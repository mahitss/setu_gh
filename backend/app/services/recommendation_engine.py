"""Deterministic development-recommendation engine.

Inputs are backend-computed facts only (demand, severity mix, population,
infrastructure gap, trend, investment, coverage). It never invents numbers.

Output: structured recommendation {category, intervention, reasoning[],
evidence{...}, confidence}. Confidence is the hotspot priority score,
labelled prototype/system confidence — NOT a statistical guarantee.
Gemini may rephrase the reasoning; it must never create or alter numbers.
"""
from .hotspot_engine import MODEL_NOTE

INTERVENTIONS: dict[str, str] = {
    "healthcare": "Improve primary healthcare access and emergency transport",
    "water": "Expand safe drinking-water supply and repair distribution",
    "roads": "Repair and upgrade road connectivity, prioritizing monsoon access",
    "education": "Add teaching staff and classroom capacity",
    "electricity": "Stabilize power supply and upgrade distribution",
    "sanitation": "Clear drains and restore regular waste collection",
    "public_transport": "Strengthen bus services and last-mile connectivity",
    "digital_infrastructure": "Extend mobile and broadband coverage",
    "housing": "Accelerate safe-housing provision for vulnerable households",
    "environment": "Act on reported pollution sources and restore green cover",
    "other": "Review reported civic issue and assign to the relevant department",
}


def build_recommendation(state: str, district: str, category: str, row: dict) -> dict:
    f = row.get("factors", {}) or {}
    trend = row.get("trend_pct")
    reasoning: list[str] = []
    if (f.get("demand_index", 0)) >= 0.5 or row.get("signals", 0) >= 50:
        reasoning.append("Citizen demand is high")
    else:
        reasoning.append("Citizen demand is notable")
    if (f.get("infra_gap", 0)) >= 0.5:
        reasoning.append("Infrastructure coverage is low")
    else:
        reasoning.append("Infrastructure coverage needs review")
    if trend is None:
        reasoning.append("Demand history is still building")
    elif trend > 5:
        reasoning.append("Demand has increased recently")
    else:
        reasoning.append("Demand is stable or easing")
    if (f.get("pop_impact", 0)) >= 0.5:
        reasoning.append("A large population is affected")
    else:
        reasoning.append("A concentrated population is affected")
    if (f.get("invest_gap", 0)) >= 0.5:
        reasoning.append("Existing investment is low relative to need")
    else:
        reasoning.append("Existing investment is present but gaps remain")
    return {
        "category": category,
        "intervention": INTERVENTIONS.get(category, INTERVENTIONS["other"]),
        "reasoning": reasoning,
        "evidence": {
            "citizen_signals": row.get("signals", 0),
            "population_affected": row.get("population", 0),
            "infrastructure_gap": row.get("gap_index"),
            "demand_trend": trend,
            "existing_investment": row.get("investment_inr", 0),
        },
        "confidence": row.get("priority_score", 0.0),
        "confidence_label": "prototype/system confidence — not a statistical guarantee",
        "model_note": MODEL_NOTE,
    }
