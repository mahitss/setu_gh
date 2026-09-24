"""Gemini structured-extraction boundary (Phase 4).

Rules:
- Gemini returns STRUCTURED extraction only. All numbers/scores are computed
  by services/engine.py. Never trust LLM numerics.
- Location (state/district/locality) comes from request metadata, NOT the model.
  The model must not hallucinate locations.
- Model output is validated with Pydantic (ExtractedSignal). Malformed output
  falls back to the deterministic rule-based extractor so ingestion never breaks.
- Works without GEMINI_API_KEY (rule fallback) so tests/demo run offline.
"""
import json
import logging
import os
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, ValidationError

log = logging.getLogger("jansetu.gemini")

Category = Literal[
    "healthcare",
    "education",
    "roads",
    "water",
    "sanitation",
    "electricity",
    "public_transport",
    "digital_infrastructure",
    "housing",
    "environment",
    "other",
]

ALLOWED_CATEGORIES: list[str] = [
    "healthcare",
    "education",
    "roads",
    "water",
    "sanitation",
    "electricity",
    "public_transport",
    "digital_infrastructure",
    "housing",
    "environment",
    "other",
]

Severity = Literal["low", "medium", "high", "critical"]

SYSTEM_INSTRUCTION = (
    "You are a civic issue classification system. "
    "Convert citizen requests into structured civic signals. "
    "Do not invent facts. "
    "Only extract information present in the input or provided metadata. "
    f"Use only these allowed categories: {', '.join(ALLOWED_CATEGORIES)}. "
    "Severity must represent the urgency of the reported civic issue, "
    "not the emotional tone of the citizen. "
    "Do not guess locations; use the provided metadata as-is. "
    "Return valid structured JSON only."
)

EXTRACTION_SCHEMA = (
    "JSON keys: category (exactly one allowed value), "
    "sub_category (string like '<category>_access'), "
    "severity (low|medium|high|critical), "
    "summary (<=25 words, facts only, no new claims), "
    "language (ISO 639-1 code, e.g. hi, en). Reply JSON only."
)


class ExtractedSignal(BaseModel):
    """Validated shape of Gemini output. Location/confidence handled server-side."""

    category: Category
    sub_category: str = Field(min_length=1, max_length=128)
    severity: Severity
    summary: str = Field(min_length=1, max_length=500)
    language: str = Field(min_length=2, max_length=8)
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)


_KEYWORDS: dict[str, list[str]] = {
    "healthcare": ["hospital", "doctor", "clinic", "ambulance", "health", "medicine",
                   "अस्पताल", "डॉक्टर", "एम्बुलेंस", "स्वास्थ्य", "इलाज"],
    "water": ["water", "tap", "pipeline", "well", "handpump", "पानी", "जल"],
    "roads": ["road", "bridge", "pothole", "highway", "street", "सड़क", "रास्ता", "पुल"],
    "education": ["school", "teacher", "classroom", "student", "स्कूल", "शिक्षक", "पढ़ाई"],
    "electricity": ["power", "electricity", "voltage", "transformer", "बिजली"],
    "sanitation": ["drain", "garbage", "toilet", "sewage", "waste", "सफाई", "कचरा", "नाली"],
    "public_transport": ["bus", "train", "metro", "transport", "बस", "ट्रेन", "परिवहन"],
    "digital_infrastructure": ["internet", "network", "mobile", "broadband", "इंटरनेट", "नेटवर्क", "मोबाइल"],
    "housing": ["house", "housing", "shelter", "मकान", "आवास", "घर"],
    "environment": ["pollution", "tree", "forest", "air", "smoke", "प्रदूषण", "पर्यावरण", "पेड़"],
}

_SEVERE_HINTS = ["urgent", "critical", "emergency", "dying", "बहुत", "गंभीर", "तुरंत",
                 "एम्बुलेंस", "ambulance"]


def _detect_language(text: str) -> str:
    return "hi" if re.search(r"[\u0900-\u097F]", text) else "en"


def _rule_based(text: str) -> dict:
    t = text.lower()
    scores = {c: sum(1 for k in ks if k in text or k in t) for c, ks in _KEYWORDS.items()}
    best = max(scores, key=scores.get)
    category = best if scores[best] > 0 else "other"
    severity = "high" if any(w in t or w in text for w in _SEVERE_HINTS) else "medium"
    return {
        "category": category,
        "sub_category": f"{category}_access",
        "severity": severity,
        "summary": text[:160],
        "language": _detect_language(text),
        "confidence": 0.55,
        "extractor": "rule_fallback",
    }


def _gemini_extract(text: str) -> Optional[dict]:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        model = genai.GenerativeModel(model_name, system_instruction=SYSTEM_INSTRUCTION)
        resp = model.generate_content(
            f"{EXTRACTION_SCHEMA}\nCitizen text: {text}",
            generation_config={"response_mime_type": "application/json"},
        )
        data = json.loads(resp.text.strip().strip("`").replace("json\n", ""))
        validated = ExtractedSignal(**data)
        out = validated.model_dump()
        out["extractor"] = "gemini"
        return out
    except (ValidationError, ValueError, KeyError, AttributeError) as e:
        log.warning("Gemini output failed validation, using fallback: %s", e)
        return None
    except Exception as e:  # API/network failure: never break ingestion
        log.warning("Gemini API failure, using fallback: %s", e)
        return None


def extract_signal(text: str, state: Optional[str] = None,
                   district: Optional[str] = None,
                   locality: Optional[str] = None) -> dict:
    """Extract structured civic signal. Location always comes from caller metadata."""
    result = _gemini_extract(text) or _rule_based(text)
    result["state"] = state
    result["district"] = district
    result["locality"] = locality
    return result


def explain_recommendation(state: str, district: str, category: str, evidence: dict) -> tuple[str, str]:
    """Natural-language explanation grounded ONLY on backend-computed evidence.

    Returns (text, source). Without a key, or on any failure, returns the
    deterministic template so the endpoint never breaks.
    """
    template = (f"Improve {category} access and supporting services in {district}, {state}: "
                f"{evidence.get('signals')} citizen signals, gap index {evidence.get('gap_index')}.")
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return template, "template"
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
            system_instruction=(
                "Explain a civic development recommendation using ONLY the provided "
                "evidence numbers. Do not invent facts, places, or statistics. "
                "Max 60 words. Plain text, no markdown."))
        resp = model.generate_content(
            f"Evidence: {json.dumps(evidence)}. "
            f"Explain why {category} in {district}, {state} is flagged.")
        text = (resp.text or "").strip()
        if not text:
            raise ValueError("empty explanation")
        return text[:600], "gemini"
    except Exception as e:
        log.warning("Gemini explanation failed, using template: %s", e)
        return template, "template"


class StructuredExplanation(BaseModel):
    summary: str = Field(min_length=1, max_length=600)
    evidence_points: list[str] = Field(min_length=1, max_length=8)
    caveats: list[str] = Field(min_length=1, max_length=8)


EXPLAIN_INSTRUCTION = (
    "You are explaining a civic infrastructure analysis. "
    "Explain why this area was flagged using ONLY the supplied evidence. "
    "Do not invent statistics. Do not introduce new facts. Do not claim certainty. "
    "Do not recommend spending a specific amount unless that amount is provided. "
    "Clearly distinguish observed evidence from the prototype's recommendation. "
    "Reply JSON only with keys: summary, evidence_points (list), caveats (list).")


def _template_explanation(evidence: dict) -> dict:
    pts = [
        f"{evidence.get('citizen_signals')} citizen signals recorded",
        f"{evidence.get('population')} people in the affected area",
        f"Infrastructure gap index {evidence.get('infrastructure_gap')}",
    ]
    trend = evidence.get("trend")
    pts.append("Demand history still building" if trend is None
               else f"Demand trend {trend:+}% over the comparison window")
    return {
        "summary": "Prototype analysis flags this area from observed demand and coverage evidence.",
        "evidence_points": pts,
        "caveats": [
            "Demo/synthetic input data — not official statistics.",
            "Scores come from a prototype prioritization model.",
        ],
    }


def explain_structured(evidence: dict) -> tuple[dict, str]:
    """Structured {summary, evidence_points[], caveats[]} explanation.

    Gemini receives ONLY the evidence dict. Output is Pydantic-validated;
    any failure falls back to the deterministic template.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if api_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
                system_instruction=EXPLAIN_INSTRUCTION)
            resp = model.generate_content(
                f"Evidence: {json.dumps(evidence)}",
                generation_config={"response_mime_type": "application/json"})
            data = StructuredExplanation(**json.loads(resp.text.strip().strip("`").replace("json\n", "")))
            return data.model_dump(), "gemini"
        except Exception as e:
            log.warning("Gemini structured explanation failed, using template: %s", e)
    return _template_explanation(evidence), "template"
