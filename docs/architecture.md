# Architecture

```mermaid
flowchart TD
    Citizen --> Nextjs[Next.js]
    Nextjs --> FastAPI[FastAPI]
    FastAPI --> GoogleAI[Google AI: Gemini, Speech]
    GoogleAI --> CivicSignal[Civic Signal]
    CivicSignal --> Database[Database]
    Database --> DataFusion[Data Fusion]
    DataFusion --> CivicPulse[CivicPulse]
    DataFusion --> Hotspots[Hotspots]
    DataFusion --> Evidence[Evidence]
    Hotspots --> Recommendation[Recommendation]
    Recommendation --> Simulator[Simulator]
    Simulator --> Policymaker[Policymaker]
```

Rules: Gemini extracts/explains only (validated output, template fallback).
Python owns every number. Allowlisted filters only — the model never touches
SQL. Deploy: Cloud Run frontend + backend, Postgres, GCS, Speech-to-Text.
