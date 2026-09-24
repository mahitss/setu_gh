"""Gemini integration boundary (Phase 4).

Rules: Gemini returns STRUCTURED extraction only. All numbers/scores are
computed by services/engine.py. Never trust LLM numerics.
Currently a rule-based fallback so the pipeline works without a key.
"""
import os
import re

CATEGORIES = ["healthcare", "water", "roads", "education", "electricity", "sanitation"]

_KEYWORDS = {
    "healthcare": ["hospital", "doctor", "clinic", "ambulance", "health", "अस्पताल", "डॉक्टर", "एम्बुलेंस", "स्वास्थ्य"],
    "water": ["water", "tap", "pipeline", "well", "पानी", "जल"],
    "roads": ["road", "bridge", "pothole", "highway", "सड़क", "रास्ता"],
    "education": ["school", "teacher", "classroom", "स्कूल", "शिक्षक", "पढ़ाई"],
    "electricity": ["power", "electricity", "voltage", "बिजली"],
    "sanitation": ["drain", "garbage", "toilet", "sewage", "सफाई", "कचरा", "नाली"],
}


def _rule_based(text: str) -> dict:
    t = text.lower()
    scores = {c: sum(1 for k in ks if k in text or k in t) for c, ks in _KEYWORDS.items()}
    category = max(scores, key=scores.get) if max(scores.values()) > 0 else "water"
    severe = any(w in t for w in ["urgent", "critical", "emergency", "बहुत", "गंभीर"]) or "एम्बुलेंस" in text
    return {
        "category": category,
        "sub_category": f"{category}_access",
        "severity": "high" if severe else "medium",
        "summary": text[:160],
        "language": "hi" if re.search(r"[\u0900-\u097F]", text) else "en",
        "confidence": 0.55,
        "extractor": "rule_fallback",
    }


def extract_signal(text: str) -> dict:
    """Phase 4 will call Gemini here when GEMINI_API_KEY is set. Same schema either way."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return _rule_based(text)
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = (
            "Extract a civic issue as JSON with keys: category (one of healthcare,water,roads,"
            "education,electricity,sanitation), sub_category, severity (low|medium|high|critical), "
            f"summary (<=25 words), language (ISO code). Text: {text}. Reply JSON only."
        )
        resp = model.generate_content(prompt)
        import json
        data = json.loads(resp.text.strip().strip('`').replace('json\n', ''))
        data.setdefault("confidence", 0.8)
        data["extractor"] = "gemini"
        if data.get("category") not in CATEGORIES:
            return _rule_based(text)
        return data
    except Exception:
        return _rule_based(text)
