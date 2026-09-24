from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import app.models as models
from app.main import app
from app.database import get_db
from app.services.seed import seed
from app.services import engine as eng

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


def setup_module(_):
    db = TestingSession()
    seed(db, n_signals=1200)
    db.close()


def test_health():
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_signal_validation_rejects_short():
    assert client.post("/api/v1/citizen/signals", json={"raw_text": "hi"}).status_code == 422


def test_signal_ingest_hindi():
    r = client.post("/api/v1/citizen/signals",
                    json={"raw_text": "हमारे गांव में अस्पताल बहुत दूर है और एम्बुलेंस आने में बहुत समय लगता है।"})
    assert r.status_code == 200
    assert r.json()["category"] == "healthcare"


def test_gemini_fallback_schema():
    from app.services.gemini import extract_signal
    d = extract_signal("No piped water for 10 days")
    assert set(["category", "severity", "summary", "language", "confidence"]) <= set(d)


def test_hotspot_aggregation():
    hotspots = client.get("/api/v1/hotspots").json()["hotspots"]
    assert len(hotspots) > 0 and hotspots[0]["priority_score"] <= 1.0


def test_scoring_deterministic():
    s1, _ = eng.priority_score(0.8, 0.7, 0.6, 0.5, 0.5)
    s2, _ = eng.priority_score(0.8, 0.7, 0.6, 0.5, 0.5)
    assert s1 == s2


def test_simulator_math():
    out = eng.simulate("healthcare", 100, 5, 200000)
    assert out["projected_population_reached"] == int(100 * 1e7 / 1200)


def test_integration_input_to_dashboard():
    client.post("/api/v1/citizen/signals", json={"raw_text": "Power cuts 8 hours daily in our ward"})
    s = client.get("/api/v1/dashboard/summary").json()
    assert s["total_signals"] >= 1200
