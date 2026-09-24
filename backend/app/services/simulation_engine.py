"""Deterministic investment-scenario engine — prototype simulation.

NOT a prediction of government outcomes. Every result is labelled
"Scenario estimate" / "Prototype simulation".

Model (documented assumptions):
- Each (category, intervention) has an assumed cost per person reached (INR).
- population_reached = min(population_affected, budget / cost_per_person).
- coverage_improvement = (reached / population) * (1 - coverage_index):
  newly reached people only lift coverage where none existed.
- gap_reduction = (reached / population) * gap_index.
- District-scoped runs affect 1 location; aggregate runs count high-gap districts.
- Gemini never touches these numbers; it may only explain them.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models import Demographic, Infrastructure, Investment

INTERVENTIONS: dict[str, dict[str, float]] = {
    "healthcare": {"primary_healthcare": 1200.0, "emergency_transport": 900.0, "facility_upgrade": 2500.0},
    "water": {"water_access": 800.0, "pipeline_upgrade": 1400.0, "treatment_capacity": 2000.0},
    "roads": {"road_repair": 1100.0, "road_connectivity": 1500.0},
    "education": {"school_capacity": 900.0, "school_infrastructure": 1600.0},
    "electricity": {"power_access": 700.0, "grid_upgrade": 1300.0},
    "sanitation": {"sanitation_access": 600.0, "waste_systems": 1000.0},
    "public_transport": {"bus_services": 950.0, "last_mile": 800.0},
    "digital_infrastructure": {"mobile_coverage": 500.0, "broadband": 1100.0},
    "housing": {"safe_housing": 5000.0, "housing_upgrade": 3000.0},
    "environment": {"pollution_action": 750.0, "green_cover": 650.0},
    "other": {"general_review": 1000.0},
}

ASSUMPTIONS = [
    "Prototype cost model — per-person costs are planning assumptions, not bids.",
    "Estimated population reach based on available demographic data.",
    "Coverage lift applies only to the unserved share of the population.",
    "Scenario estimate — does not represent an official government projection.",
]

LABEL = "Scenario estimate (prototype simulation — not a guaranteed outcome)"


def default_intervention(category: str) -> str:
    return next(iter(INTERVENTIONS.get(category, INTERVENTIONS["other"])))


def baseline(db: Session, state: str, district: str, category: str) -> dict | None:
    demo = db.query(Demographic).filter_by(state=state, district=district).first()
    infra = db.query(Infrastructure).filter_by(state=state, district=district, category=category).first()
    if not demo or not infra:
        return None
    inv = db.query(func.sum(Investment.amount)).filter_by(
        state=state, district=district, category=category).scalar() or 0
    return {"state": state, "district": district, "category": category,
            "population_affected": demo.population, "coverage_index": infra.coverage_index,
            "gap_index": infra.gap_index, "facility_count": infra.facility_count,
            "existing_investment_inr": inv}


def run_scenario(population: int, coverage: float, gap: float, budget_inr: float,
                 cost_per_person: float, locations: int) -> dict:
    if population <= 0:
        reached = 0
    else:
        reached = int(min(population, budget_inr / max(1.0, cost_per_person)))
    share = reached / max(1, population)
    return {
        "population_reached": reached,
        "coverage_improvement": round(share * (1.0 - coverage), 4),
        "gap_reduction": round(share * gap, 4),
        "locations_affected": locations,
        "estimated_cost_per_person_inr": cost_per_person,
    }


def simulate_district(db: Session, state: str, district: str, category: str,
                      budget_inr: float, intervention: str | None = None) -> dict | None:
    base = baseline(db, state, district, category)
    if not base:
        return None
    options = INTERVENTIONS.get(category, INTERVENTIONS["other"])
    intervention = intervention or default_intervention(category)
    if intervention not in options:
        return None
    est = run_scenario(base["population_affected"], base["coverage_index"],
                       base["gap_index"], budget_inr, options[intervention], 1)
    return {"label": LABEL,
            "scenario": {"state": state, "district": district, "category": category,
                         "budget_inr": budget_inr, "budget_cr": round(budget_inr / 1e7, 2),
                         "intervention": intervention},
            "baseline": {k: base[k] for k in ("population_affected", "coverage_index", "gap_index",
                                              "facility_count", "existing_investment_inr")},
            "estimate": {"population_reached": est["population_reached"],
                         "coverage_improvement": est["coverage_improvement"],
                         "gap_reduction": est["gap_reduction"],
                         "locations_affected": est["locations_affected"],
                         "estimated_cost_per_person": est["estimated_cost_per_person_inr"]},
            "assumptions": ASSUMPTIONS}
