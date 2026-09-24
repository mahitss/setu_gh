"""SQLAlchemy models. SQLite-local, Postgres-compatible. BigQuery-ready via flat tables."""
from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class CitizenSignal(Base):
    __tablename__ = "citizen_signals"
    id = Column(Integer, primary_key=True, index=True)
    raw_text = Column(Text, nullable=False)
    language = Column(String(8), default="en")
    category = Column(String(64), index=True)
    sub_category = Column(String(64), nullable=True)
    severity = Column(String(16), default="medium")  # low|medium|high|critical
    summary = Column(Text, nullable=True)
    state = Column(String(128), index=True)
    district = Column(String(128), index=True)
    locality = Column(String(128), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    ai_confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Infrastructure(Base):
    __tablename__ = "infrastructure"
    id = Column(Integer, primary_key=True)
    state = Column(String(128), index=True)
    district = Column(String(128), index=True)
    category = Column(String(64), index=True)
    facility_count = Column(Integer, default=0)
    coverage_index = Column(Float, default=0.0)  # 0..1, higher = better served
    gap_index = Column(Float, default=0.0)       # 0..1, higher = worse gap


class Demographic(Base):
    __tablename__ = "demographics"
    id = Column(Integer, primary_key=True)
    state = Column(String(128), index=True)
    district = Column(String(128), index=True)
    population = Column(Integer, default=0)
    population_density = Column(Float, default=0.0)
    growth_rate = Column(Float, default=0.0)


class Investment(Base):
    __tablename__ = "investments"
    id = Column(Integer, primary_key=True)
    state = Column(String(128), index=True)
    district = Column(String(128), index=True)
    category = Column(String(64), index=True)
    amount = Column(Float, default=0.0)  # INR
    status = Column(String(32), default="ongoing")
    year = Column(Integer, default=2025)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id = Column(Integer, primary_key=True)
    state = Column(String(128), index=True)
    district = Column(String(128), index=True)
    category = Column(String(64), index=True)
    evidence = Column(Text, nullable=True)  # JSON string of deterministic evidence
    recommendation = Column(Text, nullable=True)
    population_affected = Column(Integer, default=0)
    confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
