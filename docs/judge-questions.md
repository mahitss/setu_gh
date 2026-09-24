# Judge questions (concise, factual, no unsupported claims)

1. **Why Gemini?** Multilingual understanding + structured extraction with JSON
   mode; explanations grounded on our evidence. Validated by Pydantic, with a
   deterministic fallback when unavailable.
2. **Why is AI necessary?** Citizen input arrives in many languages and free
   text; rules alone can't classify severity, category, and language reliably.
   AI handles language; code handles math.
3. **Where does your data come from?** Seeded synthetic demo data (`seed=42`,
   labelled `synthetic_demo`) plus whatever citizens submit live. No public
   datasets integrated yet; candidates documented in `docs/data-sources.md`.
4. **How do you prevent hallucinations?** Locations come from form metadata,
   categories are allowlisted, model JSON is schema-validated, numbers are
   computed by Python and the model only receives them as evidence.
5. **How is the priority calculated?** `0.30·demand + 0.25·infra_gap +
   0.20·pop + 0.15·invest_gap + 0.10·trend` — every factor shown in the UI.
   Prototype model, not validated science.
6. **How does multilingual input work?** Auto-detection (script + Gemini) with
   manual override (auto/hi/en/bn/mr/kn); STT language codes validated
   server-side; original text always preserved.
7. **How does the system scale?** Stateless API, indexed columns, server-side
   aggregation (≤50 hotspots/response); district-agnostic logic; Cloud Run +
   Cloud SQL + BigQuery offload path.
8. **Why Google Cloud?** Gemini/Vertex AI, Speech-to-Text, Cloud Run, GCS, and
   Maps in one deployable footprint (hackathon track + `cloudbuild.yaml`).
9. **How would a real government pilot this?** Replace seed with HMIS/Census/JJM
   extracts in the same schema, run one district, validate scores with officials,
   add auth/audit and data-governance review.
10. **What are the limitations?** Synthetic data, hypothetical simulator,
    decision-support only, no auth yet, in-memory rate limiter, fallbacks act
    when AI keys are absent.
11. **How does this become a Digital Public Good?** Open schema, country-neutral
    pipeline, documented ingestion for public datasets, reproducible seed.
12. **How could this extend beyond India?** Categories, weights, costs, and
    languages are config; the extract → validate → aggregate → explain pipeline
    is country-neutral (BRICS-ready design).

13. **How do you validate citizen data?** Pydantic validation (non-empty,
    ≤5000 chars), allowlisted categories/severities, server-side language and
    location handling, audio MIME/size caps. Aggregation dilutes single bad rows.
14. **How do you handle fake/spam submissions?** Honestly: 120/min per-IP rate
    limit plus validation only. No ML spam filter yet — listed as future work;
    hotspot aggregation means one fake report cannot move a priority score alone.
15. **How is citizen privacy protected?** No accounts, no names/phones collected;
    free-text locality only; request logs record method/path/timing, never bodies
    or keys. A production pilot would need a formal data-governance review.
16. **How does the investment simulator work?** Documented per-intervention
    cost-per-person assumptions: reach = min(population, budget/cost),
    coverage/gap lift proportional to unserved share. Always labelled estimate.
17. **What data is real vs simulated?** Real: rows citizens submit live.
    Simulated: the 10,500-row seed (`synthetic_demo`, in every aggregate
    response). Estimates: simulator outputs. Never mixed without labels.
18. **How could governments deploy this?** Cloud Run + Cloud SQL via the shipped
    `cloudbuild.yaml`; swap seed for departmental extracts; validate scores with
    officials; add auth, audit trail, and grievance-redressal linkage.
