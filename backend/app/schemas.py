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

    class Config:
        from_attributes = True


class SignalResponse(BaseModel):
    success: bool = True
    signal: SignalOut


class SimulateIn(BaseModel):
    sector: str = Field(min_length=2, max_length=64)
    budget_cr: float = Field(gt=0, le=100000, description="Budget in INR crore")
