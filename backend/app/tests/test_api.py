import json
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest
import app.models as models
from app.main import app
from app.database import get_db
from app.services.seed import seed
from app.services import engine as eng
from app.services.gemini import ExtractedSignal, extract_signal

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
models.Base.metadata.create_all(bind=engine)


def _db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _db
client = TestClient(app)

HINDI_HEALTH = "हमारे गांव में अस्पताल बहुत दूर है और एम्बुलेंस आने में बहुत समय लगता है।"


def setup_module(_):
    db = TestingSession()
    seed(db, n_signals=1200)
    db.close()


def test_health():
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "up"
    assert set(["ai_configured", "voice_configured"]) <= set(body)


def test_rate_limiter_blocks_and_resets():
    from app.services.rate_limit import FixedWindowLimiter
    lim = FixedWindowLimiter(max_requests=2, window_seconds=60)
    assert lim.allowed("k", now=1000.0) and lim.allowed("k", now=1001.0)
    assert not lim.allowed("k", now=1002.0)
    assert lim.allowed("k", now=2000.0)  # window expired
    assert lim.allowed("other", now=1002.0)  # per-key isolation


# --- Phase 3/5: ingestion contract ---

def test_valid_signal_returns_envelope():
    r = client.post("/api/v1/citizen/signals", json={
        "text": HINDI_HEALTH, "language": "auto",
        "state": "Uttar Pradesh", "district": "Lucknow", "locality": "Demo Village"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    sig = body["signal"]
    assert sig["category"] == "healthcare"
    assert sig["severity"] == "high"
    assert sig["language"] == "hi"
    assert sig["state"] == "Uttar Pradesh" and sig["district"] == "Lucknow"
    assert "api_key" not in json.dumps(body).lower()


def test_raw_text_alias_still_accepted():
    r = client.post("/api/v1/citizen/signals", json={"raw_text": "No piped water for 10 days"})
    assert r.status_code == 200
    assert r.json()["signal"]["category"] == "water"


def test_empty_text_rejected():
    assert client.post("/api/v1/citizen/signals", json={"text": ""}).status_code == 422
    assert client.post("/api/v1/citizen/signals", json={"text": "   "}).status_code == 422
    assert client.post("/api/v1/citizen/signals", json={}).status_code == 422


def test_oversized_text_rejected():
    assert client.post("/api/v1/citizen/signals", json={"text": "x" * 5001}).status_code == 422


def test_persistence_stores_all_fields():
    r = client.post("/api/v1/citizen/signals", json={
        "text": HINDI_HEALTH, "state": "Uttar Pradesh",
        "district": "Lucknow", "locality": "Demo Village"})
    sig_id = r.json()["signal"]["id"]
    db = TestingSession()
    row = db.query(models.CitizenSignal).filter_by(id=sig_id).one()
    assert row.raw_text == HINDI_HEALTH and row.locality == "Demo Village"
    assert row.latitude is None and row.longitude is None  # nullable coords don't block
    assert row.created_at is not None
    db.close()


# --- Phase 4: Gemini validation ---

def test_invalid_category_rejected():
    with pytest.raises(ValidationError):
        ExtractedSignal(category="teleportation", sub_category="x",
                         severity="high", summary="s", language="en")


def test_invalid_severity_rejected():
    with pytest.raises(ValidationError):
        ExtractedSignal(category="water", sub_category="water_access",
                         severity="extreme", summary="s", language="en")


def _patch_model(monkeypatch, text: str):
    import google.generativeai as genai

    class _Resp:
        pass
    _Resp.text = text

    class _FakeModel:
        def __init__(self, *a, **k):
            pass

        def generate_content(self, *a, **k):
            return _Resp()

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(genai, "GenerativeModel", _FakeModel)


def test_malformed_gemini_response_falls_back(monkeypatch):
    _patch_model(monkeypatch, "this is not json {{{")
    d = extract_signal("Our hospital is too far, need ambulance")
    assert d["category"] == "healthcare" and d["extractor"] == "rule_fallback"


def test_invalid_category_gemini_response_falls_back(monkeypatch):
    evil = json.dumps({"category": "teleportation", "sub_category": "x",
                       "severity": "high", "summary": "s", "language": "en"})
    _patch_model(monkeypatch, evil)
    d = extract_signal("No piped water for 10 days")
    assert d["category"] == "water" and d["extractor"] == "rule_fallback"


def test_location_comes_from_metadata_not_model(monkeypatch):
    good = json.dumps({"category": "roads", "sub_category": "roads_access",
                       "severity": "medium", "summary": "Broken road",
                       "language": "en", "confidence": 0.9})
    _patch_model(monkeypatch, good)
    d = extract_signal("Broken road", state="Bihar", district="Patna", locality="W1")
    assert d["category"] == "roads" and d["extractor"] == "gemini"
    assert (d["state"], d["district"], d["locality"]) == ("Bihar", "Patna", "W1")


def test_gemini_fallback_schema():
    d = extract_signal("No piped water for 10 days")
    assert {"category", "severity", "summary", "language", "confidence"} <= set(d)


# --- pre-existing analytics coverage ---

def test_hotspot_aggregation():
    hotspots = client.get("/api/v1/hotspots").json()["hotspots"]
    assert len(hotspots) > 0 and hotspots[0]["priority_score"] <= 1.0


def test_hotspot_rows_carry_coordinates_and_factors():
    hotspots = client.get("/api/v1/hotspots").json()["hotspots"]
    h = hotspots[0]
    assert h["latitude"] is not None and h["longitude"] is not None
    assert set(["demand_index", "infra_gap", "pop_impact", "invest_gap", "trend"]) <= set(h["factors"])


def test_hotspot_detail_evidence():
    h = client.get("/api/v1/hotspots").json()["hotspots"][0]
    r = client.get(f"/api/v1/hotspots/{h['state']}/{h['district']}/{h['category']}")
    assert r.status_code == 200
    body = r.json()
    assert "evidence" in body and "recommendation" in body


def test_scoring_deterministic():
    s1, _ = eng.priority_score(0.8, 0.7, 0.6, 0.5, 0.5)
    s2, _ = eng.priority_score(0.8, 0.7, 0.6, 0.5, 0.5)
    assert s1 == s2


def test_simulator_math():
    out = eng.simulate("healthcare", 100, 5, 200000)
    assert out["projected_population_reached"] == int(100 * 1e7 / 1200)


def test_integration_input_to_dashboard():
    before = client.get("/api/v1/dashboard/summary").json()["total_signals"]
    client.post("/api/v1/citizen/signals", json={"text": "Power cuts 8 hours daily in our ward"})
    after = client.get("/api/v1/dashboard/summary").json()["total_signals"]
    assert after == before + 1


# --- Phase 10: voice ---

def test_voice_rejects_empty_audio():
    r = client.post("/api/v1/citizen/voice", files={"file": ("a.webm", b"", "audio/webm")})
    assert r.status_code == 400


def test_voice_graceful_without_credentials(monkeypatch):
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    r = client.post("/api/v1/citizen/voice", files={"file": ("a.webm", b"\x00" * 100, "audio/webm")})
    # 501 = STT not configured here; 422 = creds exist but gibberish unrecognized. Never 500.
    assert r.status_code in (501, 422)


def test_voice_mocked_transcript(monkeypatch):
    import app.routers.voice as voice_mod
    monkeypatch.setattr(voice_mod, "_transcribe", lambda audio, lang: "पानी नहीं आ रहा है")
    r = client.post("/api/v1/citizen/voice", files={"file": ("a.webm", b"\x00" * 100, "audio/webm")})
    assert r.status_code == 200 and r.json()["success"] is True
    # transcript feeds the normal text pipeline identically
    r2 = client.post("/api/v1/citizen/signals", json={"text": r.json()["transcript"]})
    assert r2.json()["signal"]["category"] == "water"


def test_voice_rejects_bad_mime_and_language():
    r = client.post("/api/v1/citizen/voice", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 400
    r = client.post("/api/v1/citizen/voice", files={"file": ("a.webm", b"\x00" * 10, "audio/webm")},
                    data={"language_code": "xx-XX"})
    assert r.status_code == 400


def test_voice_dev_mode_no_audio_url(monkeypatch):
    import app.routers.voice as voice_mod
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    monkeypatch.setattr(voice_mod, "_transcribe", lambda audio, lang: "पानी नहीं आ रहा है")
    r = client.post("/api/v1/citizen/voice", files={"file": ("a.webm", b"\x00" * 100, "audio/webm")})
    assert r.status_code == 200
    assert r.json()["audio_url"] is None and "transcript" in r.json()


# --- Natural-language policy query (allowlisted) ---

def test_policy_query_filters():
    r = client.get("/api/v1/policy-query",
                   params={"category": "healthcare", "min_gap": 0.5, "min_signals": 20})
    assert r.status_code == 200
    for m in r.json()["matches"]:
        assert m["category"] == "healthcare" and (m["gap_index"] or 0) >= 0.5 and m["signals"] >= 20


def test_policy_query_rejects_bad_category():
    assert client.get("/api/v1/policy-query", params={"category": "teleportation"}).status_code == 422


def test_simulate_validates_budget():
    assert client.post("/api/v1/simulate", json={"sector": "healthcare", "budget_cr": -5}).status_code == 422
    r = client.post("/api/v1/simulate", json={"sector": "healthcare", "budget_cr": 100})
    assert r.status_code == 200 and "projected_population_reached" in r.json()


# --- Phase 12: district simulation engine ---

def _sim(district="Lucknow", budget=100000000, **kw):
    body = {"state": "Uttar Pradesh", "district": district, "category": "healthcare",
            "budget": budget}
    body.update(kw)
    return client.post("/api/v1/simulate", json=body)


def test_simulate_district_shape():
    r = _sim()
    assert r.status_code == 200
    body = r.json()
    assert set(["scenario", "baseline", "estimate", "assumptions"]) <= set(body)
    assert body["scenario"]["intervention"] == "primary_healthcare"
    assert "Scenario estimate" in body["label"]


def test_simulate_monotonic_budgets():
    r = client.post("/api/v1/simulate/compare", json={
        "state": "Uttar Pradesh", "district": "Lucknow", "category": "healthcare",
        "budgets_cr": [50, 100, 250]})
    assert r.status_code == 200
    body = r.json()
    reaches = [x["population_reached"] for x in body["comparison"]]
    assert reaches == sorted(reaches)  # more budget never reaches fewer people
    assert "assumptions" in body and len(body["comparison"]) == 3


def test_simulate_rejects_bad_input():
    assert _sim(budget=0).status_code == 422
    assert _sim(budget=-5).status_code == 422
    # missing district alongside other location fields
    assert client.post("/api/v1/simulate", json={
        "state": "Uttar Pradesh", "category": "healthcare", "budget": 100}).status_code == 422
    # unsupported category
    assert _sim(category="teleportation").status_code == 422
    # unknown intervention for a valid category
    assert _sim(intervention="moon_base").status_code == 400
    # unknown district baseline
    assert _sim(district="Nowhere").status_code == 404


def test_simulate_compare_validates():
    bad = client.post("/api/v1/simulate/compare", json={
        "state": "Uttar Pradesh", "district": "Lucknow", "category": "healthcare",
        "budgets_cr": [100, -10]})
    assert bad.status_code == 422


def test_simulate_interventions_allowlisted():
    body = client.get("/api/v1/simulate/interventions").json()["interventions"]
    assert "primary_healthcare" in body["healthcare"] and "road_repair" in body["roads"]


# --- Phase 6-8: dashboard / hotspot engine / pulse ---

def _empty_override():
    from sqlalchemy.pool import StaticPool
    e2 = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(bind=e2)
    S2 = sessionmaker(bind=e2)

    def _db2():
        db = S2()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db2
    return S2


def test_empty_database_returns_zeros():
    _empty_override()
    try:
        s = client.get("/api/v1/dashboard/summary").json()
        assert s["citizen_signals"] == 0 and s["active_hotspots"] == 0
        assert s["high_priority_areas"] == 0 and s["population_affected"] == 0
        assert s["top_categories"] == [] and s["top_hotspots"] == []
        assert client.get("/api/v1/hotspots").json()["hotspots"] == []
        assert client.get("/api/v1/civic-pulse").json()["pulse"] == []
    finally:
        app.dependency_overrides[get_db] = _db


def test_pulse_insufficient_data_without_history():
    from datetime import datetime
    S2 = _empty_override()
    try:
        db = S2()
        db.add(models.CitizenSignal(raw_text="t", language="en", category="water",
                                    severity="high", state="Bihar", district="Patna",
                                    created_at=datetime.utcnow()))
        db.commit()
        db.close()
        pulse = client.get("/api/v1/civic-pulse").json()["pulse"]
        assert len(pulse) == 1 and pulse[0]["status"] == "insufficient_data"
        assert pulse[0]["trend_percent"] is None
    finally:
        app.dependency_overrides[get_db] = _db


def test_hotspot_filters():
    assert client.get("/api/v1/hotspots", params={"category": "nonsense"}).status_code == 422
    assert client.get("/api/v1/hotspots", params={"priority": "urgent"}).status_code == 422
    r = client.get("/api/v1/hotspots", params={"state": "Bihar", "category": "healthcare"}).json()
    assert r["count"] > 0
    assert all(h["state"] == "Bihar" and h["category"] == "healthcare" for h in r["hotspots"])
    r2 = client.get("/api/v1/hotspots", params={"priority": "high"}).json()
    assert all(h["priority_level"] == "high" for h in r2["hotspots"])
    r3 = client.get("/api/v1/hotspots", params={"severity": "critical"}).json()
    assert r3["count"] >= 0


def test_hotspot_by_id():
    h = client.get("/api/v1/hotspots").json()["hotspots"][0]
    assert set(["id", "signal_count", "demand_index", "priority_level"]) <= set(h)
    r = client.get(f"/api/v1/hotspots/by-id/{h['id']}")
    assert r.status_code == 200
    assert r.json()["location"] == {"state": h["state"], "district": h["district"]}
    assert client.get("/api/v1/hotspots/by-id/!!!").status_code == 404


def test_summary_top_categories():
    top = client.get("/api/v1/dashboard/summary").json()["top_categories"]
    assert len(top) > 0 and set(["category", "count", "trend_percent"]) <= set(top[0])


def test_hotspot_scores_deterministic_across_calls():
    a = client.get("/api/v1/hotspots").json()
    b = client.get("/api/v1/hotspots").json()
    assert a == b


def test_short_id_route_matches_by_id():
    h = client.get("/api/v1/hotspots").json()["hotspots"][0]
    r = client.get(f"/api/v1/hotspots/{h['id']}")
    assert r.status_code == 200
    assert r.json()["location"] == {"state": h["state"], "district": h["district"]}


def test_recommendations_persisted_and_upserted():
    r1 = client.get("/api/v1/recommendations").json()["recommendations"]
    assert len(r1) == 10 and all("id" in r for r in r1)
    db = TestingSession()
    n1 = db.query(models.Recommendation).count()
    assert n1 == 10
    rec = db.query(models.Recommendation).first()
    assert rec.evidence and rec.recommendation and rec.population_affected > 0
    db.close()
    client.get("/api/v1/recommendations")
    db = TestingSession()
    assert db.query(models.Recommendation).count() == n1  # upsert, no duplicates
    db.close()


def test_explanation_template_without_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    from app.services.gemini import explain_recommendation
    text, source = explain_recommendation("Bihar", "Gaya", "water", {"signals": 50, "gap_index": 0.8})
    assert source == "template" and "Gaya" in text


def test_nl_policy_query():
    r = client.post("/api/v1/policy-query/nl",
                    json={"question": "Which districts have high healthcare demand but low existing investment?"})
    assert r.status_code == 200
    body = r.json()
    assert body["filters"]["category"] == "healthcare"
    assert body["filters"]["max_investment_cr"] == 30.0
    assert all(m["category"] == "healthcare" for m in body["matches"])
    assert client.post("/api/v1/policy-query/nl", json={"question": "hi"}).status_code == 422


# --- Phase 9: recommendation engine ---

def test_recommendation_engine_deterministic():
    from app.services.recommendation_engine import build_recommendation
    row = {"signals": 8421, "population": 183000, "gap_index": 0.81, "trend_pct": 34,
           "investment_inr": 120000000, "priority_score": 0.86,
           "factors": {"demand_index": 0.9, "infra_gap": 0.81, "pop_impact": 0.8,
                       "invest_gap": 0.7, "trend": 0.9}}
    a = build_recommendation("UP", "Lucknow", "healthcare", row)
    b = build_recommendation("UP", "Lucknow", "healthcare", row)
    assert a == b
    assert a["intervention"] == "Improve primary healthcare access and emergency transport"
    assert a["evidence"] == {"citizen_signals": 8421, "population_affected": 183000,
                             "infrastructure_gap": 0.81, "demand_trend": 34,
                             "existing_investment": 120000000}
    assert len(a["reasoning"]) >= 4 and "guarantee" in a["confidence_label"]


def test_hotspot_recommendation_endpoint():
    h = client.get("/api/v1/hotspots").json()["hotspots"][0]
    r = client.get(f"/api/v1/hotspots/{h['id']}/recommendation")
    assert r.status_code == 200
    body = r.json()
    assert body["evidence"]["citizen_signals"] == h["signals"]
    assert body["evidence"]["population_affected"] == h["population"]
    assert "intervention" in body["recommendation"] and "confidence" in body["recommendation"]
    assert set(["summary", "evidence_points", "caveats"]) <= set(body["explanation"])
    assert client.get("/api/v1/hotspots/!!!/recommendation").status_code == 404


def test_structured_explanation_fallback_without_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    from app.services.gemini import explain_structured
    out, source = explain_structured({"citizen_signals": 10, "population": 5,
                                      "infrastructure_gap": 0.5, "trend": None, "investment": 0})
    assert source == "template" and len(out["evidence_points"]) >= 3 and len(out["caveats"]) >= 1


def test_structured_explanation_validates_gemini_output(monkeypatch):
    import json as _json
    import google.generativeai as genai

    class _Resp:
        text = "not json"

    class _FakeModel:
        def __init__(self, *a, **k):
            pass

        def generate_content(self, *a, **k):
            return _Resp()

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(genai, "GenerativeModel", _FakeModel)
    from app.services.gemini import explain_structured
    out, source = explain_structured({"citizen_signals": 10})
    assert source == "template" and "summary" in out


# --- Phase 11: pulse intelligence ---

def test_pulse_status_and_period():
    body = client.get("/api/v1/civic-pulse").json()
    assert body["period"] == {"current_days": 30, "previous_days": 30}
    assert set(body.keys()) >= {"period", "signals", "pulse", "emerging_hotspots"}
    for p in body["signals"]:
        assert p["status"] in ("rising", "stable", "declining", "insufficient_data")
        if p["status"] == "insufficient_data":
            assert p["trend_percent"] is None


def test_emerging_hotspots_shape():
    em = client.get("/api/v1/civic-pulse").json()["emerging_hotspots"]
    assert len(em) > 0
    for e in em:
        assert set(["id", "district", "category", "trend_percent"]) <= set(e)
        assert e["trend_percent"] is not None
    trends = [e["trend_percent"] for e in em]
    assert trends == sorted(trends, reverse=True)


# --- Submission: recent signals + failure envelopes ---

def test_recent_signals():
    body = client.get("/api/v1/signals/recent?limit=5").json()
    assert len(body["signals"]) == 5
    assert set(["id", "category", "severity", "summary", "language", "state", "district"]) <= set(body["signals"][0])
    assert client.get("/api/v1/signals/recent?limit=0").status_code == 422
    assert client.get("/api/v1/signals/recent?limit=500").status_code == 422


def test_db_failure_returns_safe_envelope():
    from sqlalchemy.exc import OperationalError

    def _boom():
        raise OperationalError("SELECT 1", {}, Exception("secret db password xyz"))
        yield

    app.dependency_overrides[get_db] = _boom
    try:
        r = client.get("/api/v1/dashboard/summary")
        assert r.status_code == 500
        body = r.json()
        assert body["success"] is False and body["error"]["code"] == "INTERNAL_ERROR"
        raw = json.dumps(body).lower()
        assert "xyz" not in raw and "password" not in raw and "traceback" not in raw
    finally:
        app.dependency_overrides[get_db] = _db
