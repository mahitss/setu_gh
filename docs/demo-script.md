# Demo script (3–5 minutes, show the product — max 20 seconds of code)

## 0:00–0:20 — Problem
"Citizen development requests are fragmented across languages and places.
Governments can't see real demand. JanSetu makes it visible."

## 0:20–0:45 — Citizen submits Hindi voice/text request
`/citizen`: paste "हमारे गांव में अस्पताल बहुत दूर है और एम्बुलेंस आने में बहुत
समय लगता है।" → UP/Lucknow/Demo Village → Submit → "understood" card
(Healthcare, High, Hindi). Mention the voice-record option.

## 0:45–1:10 — Gemini converts it into structured civic intelligence
Show the structured card: category, severity, language. Location came from the
form — never hallucinated. Numbers are computed, never invented. Demo data is
labelled synthetic throughout.

## 1:10–1:45 — Policymaker dashboard
`/dashboard`: Citizen Signals, Active Hotspots, High Priority Areas, Population
Affected — all live from the database.

## 1:45–2:15 — CivicPulse and hotspot
Pulse trends (last 30 days vs prior 30 days, rising/stable/declining),
Emerging Hotspots, backend-driven filters, map.

## 2:15–2:45 — Evidence
Open `/hotspots/[id]`: citizen demand, trend, population, coverage, gap,
investment, score factors, "why flagged" checklist.

## 2:45–3:20 — Development recommendation
Intervention + WHY bullets + prototype-analysis label. "Evidence indicates…"
— the policymaker decides, not the AI.

## 3:20–4:00 — Investment simulator
"Simulate investment" (hotspot pre-selected) → Primary Healthcare → ₹100 Cr →
reach, coverage, gap reduction + assumptions.

## 4:00–4:30 — Change budget, show scenario estimate
₹100 Cr → ₹250 Cr: values update via the deterministic engine. Stress:
"Scenario estimate — not a guaranteed outcome."

## 4:30–5:00 — Google Cloud architecture and scalability
Cloud Run frontend/backend, Postgres, Gemini/Vertex AI, Speech-to-Text, Cloud
Storage; district-agnostic pipeline scales India-wide, then BRICS.
