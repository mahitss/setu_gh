from pydantic import BaseModel, Field
from typing import Optional


class SignalIn(BaseModel):
    raw_text: str = Field(min_length=3, max_length=5000)
    language: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    locality: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


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


class SimulateIn(BaseModel):
    sector: str = Field(min_length=2, max_length=64)
    budget_cr: float = Field(gt=0, le=100000, description="Budget in INR crore")
