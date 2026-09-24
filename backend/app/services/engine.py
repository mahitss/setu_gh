"""Deterministic intelligence engine.

SCORING METHODOLOGY (documented, no LLM numbers):
All inputs are DB-aggregated facts. Output priority_score in [0,1].

  demand_index      = signals_here / max_signals_anywhere (0..1)
  infra_gap         = gap_index from infrastructure table (0..1)
  population_impact = log-scaled population share (0..1)
  investment_gap    = 1 - min(1, invested_here / avg_invested) (0..1, higher=underfunded)
  trend             = recent_30d_share vs prior_30d, normalized to 0..1

  priority_score = 0.30*demand + 0.25*infra_gap + 0.20*pop + 0.15*invest_gap + 0.10*trend

Weights sum to 1. Every factor is exposed in the API/UI. LLM only explains.
"""
import math

WEIGHTS = {"demand": 0.30, "infra_gap": 0.25, "pop": 0.20, "invest_gap": 0.15, "trend": 0.10}

# Simulator: cost assumptions (INR per person reached), clearly labelled estimates.
COST_PER_PERSON = {
    "healthcare": 1200.0,
    "water": 800.0,
    "roads": 1500.0,
    "education": 900.0,
    "electricity": 700.0,
    "sanitation": 600.0,
}
DEFAULT_COST_PER_PERSON = 1000.0


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def population_impact(pop: int, max_pop: int) -> float:
    if not pop or not max_pop:
        return 0.0
    return clamp01(math.log1p(pop) / math.log1p(max_pop))


def investment_gap(invested: float, avg_invested: float) -> float:
    if avg_invested <= 0:
        return 0.5
    return clamp01(1.0 - (invested / avg_invested))


def trend_score(recent: int, prior: int) -> float:
    if recent + prior == 0:
        return 0.0
    growth = (recent - prior) / max(1, prior)
    return clamp01(0.5 + growth / 2)  # 0 growth -> 0.5


def priority_score(demand_index: float, infra_gap: float, pop_impact: float,
                   invest_gap: float, trend: float) -> tuple[float, dict]:
    factors = {
        "demand_index": clamp01(demand_index),
        "infra_gap": clamp01(infra_gap),
        "pop_impact": clamp01(pop_impact),
        "invest_gap": clamp01(invest_gap),
        "trend": clamp01(trend),
    }
    score = (WEIGHTS["demand"] * factors["demand_index"]
             + WEIGHTS["infra_gap"] * factors["infra_gap"]
             + WEIGHTS["pop"] * factors["pop_impact"]
             + WEIGHTS["invest_gap"] * factors["invest_gap"]
             + WEIGHTS["trend"] * factors["trend"])
    return round(clamp01(score), 4), factors


def simulate(sector: str, budget_cr: float, high_gap_locations: int, avg_pop_per_location: int) -> dict:
    """Deterministic simulator. Budget in INR crore. Returns estimates only."""
    budget_inr = budget_cr * 1e7
    cpp = COST_PER_PERSON.get(sector.lower(), DEFAULT_COST_PER_PERSON)
    people_reached = int(budget_inr / cpp)
    locations = max(1, high_gap_locations)
    coverage_lift = clamp01(people_reached / max(1, locations * avg_pop_per_location))
    return {
        "sector": sector,
        "budget_cr": budget_cr,
        "budget_inr": budget_inr,
        "assumed_cost_per_person_inr": cpp,
        "projected_population_reached": people_reached,
        "projected_coverage_improvement": round(coverage_lift, 4),
        "high_gap_locations_affected": locations,
        "note": "Estimate/simulation only — not a guaranteed outcome.",
    }
