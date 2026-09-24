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
    assert client.get("/api/v1/health").json()["status"] == "ok"


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
