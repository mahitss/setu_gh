"""Natural-language policy query: question -> allowlisted structured filters.

Two paths, same validated output:
1. Gemini (when GEMINI_API_KEY set): converts the question to filter JSON,
   validated by PolicyQueryFilters. Any failure -> keyword fallback.
2. Deterministic keyword parser: category synonyms, demand/investment hints,
   and state/district names matched against the database (never hallucinated).

The backend executes the filters against real data. The model never sees SQL.
"""
import json
import logging
import os
from sqlalchemy.orm import Session
from ..models import CitizenSignal

log = logging.getLogger("jansetu.nlquery")

CATEGORY_SYNONYMS: dict[str, list[str]] = {
    "healthcare": ["health", "hospital", "doctor", "clinic", "ambulance", "medical"],
    "education": ["education", "school", "teacher", "classroom", "student"],
    "roads": ["road", "bridge", "pothole", "highway", "street"],
    "water": ["water", "tap", "pipeline", "drinking water"],
    "sanitation": ["sanitation", "drain", "garbage", "sewage", "toilet", "waste"],
    "electricity": ["electricity", "power", "voltage", "bijli"],
    "public_transport": ["public transport", "bus", "train", "metro", "transport"],
    "digital_infrastructure": ["digital", "internet", "network", "mobile", "broadband"],
    "housing": ["housing", "house", "shelter", "home"],
    "environment": ["environment", "pollution", "air", "tree", "green"],
}


def _keyword_parse(question: str, db: Session) -> dict:
    q = question.lower()
    filters: dict = {"min_gap": 0.0, "min_signals": 0}
    for cat, words in CATEGORY_SYNONYMS.items():
        if any(w in q for w in words):
            filters["category"] = cat
            break
    if any(w in q for w in ["high gap", "low coverage", "poor coverage", "no facility"]):
        filters["min_gap"] = 0.5
    if any(w in q for w in ["high demand", "most demand", "rising demand", "demand rising", "rising", "increasing", "surging"]):
        filters["min_signals"] = 50
    if any(w in q for w in ["low investment", "low existing investment", "underfunded", "under-funded", "under invested", "less funding"]):
        filters["max_investment_cr"] = 30.0
    states = [s for (s,) in db.query(CitizenSignal.state).distinct().all()]
    for s in states:
        if s.lower() in q:
            filters["state"] = s
            break
    if "state" in filters:
        districts = [d for (d,) in db.query(CitizenSignal.district)
                     .filter(CitizenSignal.state == filters["state"]).distinct().all()]
    else:
        districts = [d for (d,) in db.query(CitizenSignal.district).distinct().all()]
    for d in districts:
        if d.lower() in q:
            filters["district"] = d
            break
    return {"filters": filters, "source": "keyword_parser"}


def _gemini_parse(question: str) -> dict | None:
    from ..schemas import PolicyQueryFilters

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
            system_instruction=(
                "Convert a policymaker question into civic-data filters. "
                "Use only the provided evidence context. Do not invent facts. "
                "Reply JSON only."))
        cats = ", ".join(CATEGORY_SYNONYMS)
        resp = model.generate_content(
            f"Keys (all optional except as needed): category (one of {cats}), "
            f"state, district, min_gap (0..1), min_signals (>=0), max_investment_cr (>0). "
            f"Question: {question}",
            generation_config={"response_mime_type": "application/json"})
        data = PolicyQueryFilters(**json.loads(resp.text.strip().strip("`").replace("json\n", "")))
        return {"filters": data.model_dump(exclude_none=True), "source": "gemini"}
    except Exception as e:
        log.warning("NL Gemini parse failed, using keyword parser: %s", e)
        return None


def parse_question(question: str, db: Session) -> dict:
    return _gemini_parse(question) or _keyword_parse(question, db)
