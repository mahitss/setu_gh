# Demo script (3–5 minutes, show the product, not code)

## 0:00–0:20 — Problem
"Citizen development requests are fragmented across languages and places.
Governments can't see real demand. JanSetu makes it visible."

## 0:20–0:50 — Citizen submits Hindi request
`/citizen`: paste "हमारे गांव में अस्पताल बहुत दूर है और एम्बुलेंस आने में बहुत
समय लगता है।" → UP/Lucknow/Demo Village → Submit → "understood" card
(Healthcare, High, Hindi). Mention voice option.

## 0:50–1:20 — Gemini understands and structures it
Show the structured card; note location came from the form, never hallucinated;
numbers are computed, never invented. (All demo data labelled synthetic.)

## 1:20–2:00 — Dashboard + India map
`/dashboard`: KPIs, hotspot map (fallback OK), backend-driven filters.

## 2:00–2:30 — CivicPulse + hotspot
Pulse trends (30d vs prior 30d), Emerging Hotspots; ask the NL question and
show matching districts.

## 2:30–3:10 — Evidence + recommendation
Open `/hotspots/[id]`: evidence grid, score factors, flagged checklist,
development recommendation WHY card.

## 3:10–4:00 — Investment simulator
"Simulate investment" → Healthcare / Primary Healthcare / ₹100 Cr → estimates +
assumptions → compare ₹50/100/250 Cr. Stress the estimate disclaimer.

## 4:00–4:30 — Scale/deployment
"District-agnostic pipeline; Cloud Run configs ready; real datasets plug into
the same schema. AI explains, math stays deterministic."
