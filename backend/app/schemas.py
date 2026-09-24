from pydantic import BaseModel, Field, model_validator
from typing import Optional

MAX_TEXT_LEN = 5000


class SignalIn(BaseModel):
    """Citizen submission. `text` is primary; `raw_text` accepted as alias for compat."""

    text: Optional[str] = Field(default=None, max_length=MAX_TEXT_LEN)
    raw_text: Optional[str] = Field(default=None, max_length=MAX_TEXT_LEN)
    language: Optional[str] = Field(default="auto", max_length=16)
    state: Optional[str] = Field(default=None, max_length=128)
    district: Optional[str] = Field(default=None, max_length=128)
    locality: Optional[str] = Field(default=None, max_length=128)
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @model_validator(mode="after")
    def _require_nonblank_text(self):
        txt = (self.text or self.raw_text or "").strip()
        if not txt:
            raise ValueError("text must not be empty")
        if len(txt) > MAX_TEXT_LEN:
            raise ValueError(f"text must be at most {MAX_TEXT_LEN} characters")
        self.text = txt
        return self

    def resolved_language(self) -> Optional[str]:
        lang = (self.language or "auto").strip().lower()
        return None if lang in ("", "auto") else lang


class SignalOut(BaseModel):
    id: int
    category: str
    sub_category: Optional[str] = None
    severity: str
    summary: Optional[str] = None
    language: str
    state: Optional[str] = None
    district: Optional[str] = None
    ai_confidence: float
    extractor: str = "unknown"  # gemini | rule_fallback | error_fallback (demo transparency)

    class Config:
        from_attributes = True


class SignalResponse(BaseModel):
    success: bool = True
    signal: SignalOut


class SimulateIn(BaseModel):
    """Two shapes (back-compatible):
    aggregate: {sector, budget_cr} — category-wide estimates.
    district: {state, district, category, budget|budget_cr, intervention?}."""

    sector: Optional[str] = Field(default=None, min_length=2, max_length=64)
    budget_cr: Optional[float] = Field(default=None, gt=0, le=100000)
    state: Optional[str] = Field(default=None, max_length=128)
    district: Optional[str] = Field(default=None, max_length=128)
    category: Optional[str] = Field(default=None, max_length=64)
    budget: Optional[float] = Field(default=None, gt=0, le=1e13, description="Budget in INR")
    intervention: Optional[str] = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _require_coherent_shape(self):
        loc = [self.state, self.district, self.category]
        if any(loc):
            if not all(loc):
                raise ValueError("state, district and category are required together")
            if self.budget is None and self.budget_cr is None:
                raise ValueError("budget (INR) or budget_cr is required")
        else:
            if not self.sector or (self.budget is None and self.budget_cr is None):
                raise ValueError("sector and budget_cr (or budget) are required")
        return self

    def budget_inr(self) -> float:
        if self.budget is not None:
            return self.budget
        return (self.budget_cr or 0) * 1e7


class SimulateCompareIn(BaseModel):
    state: str = Field(min_length=1, max_length=128)
    district: str = Field(min_length=1, max_length=128)
    category: str = Field(min_length=1, max_length=64)
    intervention: Optional[str] = Field(default=None, max_length=64)
    budgets_cr: list[float] = Field(min_length=1, max_length=5)


class PolicyQueryFilters(BaseModel):
    """Allowlisted structured filters. The LLM may propose them; Pydantic disposes."""

    category: Optional[str] = Field(default=None, pattern="^(healthcare|education|roads|water|sanitation|electricity|public_transport|digital_infrastructure|housing|environment|other)$")
    state: Optional[str] = Field(default=None, max_length=128)
    district: Optional[str] = Field(default=None, max_length=128)
    min_gap: float = Field(default=0.0, ge=0.0, le=1.0)
    min_signals: int = Field(default=0, ge=0)
    max_investment_cr: Optional[float] = Field(default=None, gt=0)


class NLQueryIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
