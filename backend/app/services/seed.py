"""Seed synthetic DEMO data. NOT government data. Reproducible via seed=42."""
import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from ..models import CitizenSignal, Infrastructure, Demographic, Investment

DATA_SOURCE = "synthetic_demo"  # exposed in API responses; user submissions are "user_submitted"

DISTRICTS = [
    # state, district, pop, lat, lon
    ("Uttar Pradesh", "Lucknow", 4985000, 26.85, 80.95),
    ("Uttar Pradesh", "Varanasi", 3676000, 25.32, 82.99),
    ("Uttar Pradesh", "Kanpur Nagar", 4581000, 26.45, 80.33),
    ("Uttar Pradesh", "Gorakhpur", 4440000, 26.76, 83.37),
    ("Bihar", "Patna", 5838000, 25.59, 85.14),
    ("Bihar", "Gaya", 4391000, 24.79, 85.00),
    ("Bihar", "Muzaffarpur", 4801000, 26.12, 85.36),
    ("Bihar", "Bhagalpur", 3037000, 25.24, 87.02),
    ("Maharashtra", "Mumbai Suburban", 9356000, 19.12, 72.87),
    ("Maharashtra", "Pune", 9429000, 18.52, 73.86),
    ("Maharashtra", "Nagpur", 4653000, 21.15, 79.09),
    ("Maharashtra", "Nashik", 6107000, 19.99, 73.79),
    ("Karnataka", "Bengaluru Urban", 9621000, 12.97, 77.59),
    ("Karnataka", "Mysuru", 3001000, 12.30, 76.65),
    ("Karnataka", "Hubballi-Dharwad", 2185000, 15.35, 75.13),
    ("Karnataka", "Kalaburagi", 2564000, 17.33, 76.83),
    ("Rajasthan", "Jaipur", 6626000, 26.91, 75.79),
    ("Rajasthan", "Jodhpur", 3687000, 26.24, 73.02),
    ("Rajasthan", "Udaipur", 3068000, 24.58, 73.71),
    ("Rajasthan", "Kota", 1951000, 25.21, 75.86),
    ("West Bengal", "Kolkata", 4496000, 22.57, 88.36),
    ("West Bengal", "Howrah", 4850000, 22.59, 88.31),
    ("West Bengal", "Darjeeling", 1846000, 27.04, 88.26),
    ("West Bengal", "Nadia", 5168000, 23.47, 88.55),
]

CATEGORIES = ["healthcare", "water", "roads", "education", "electricity", "sanitation"]
WEIGHTS = [0.26, 0.22, 0.18, 0.13, 0.11, 0.10]  # healthcare/water/roads dominate

TEMPLATES = {
    "healthcare": [
        "Our village hospital is too far and ambulance takes too long.",
        "हमारे गांव में अस्पताल बहुत दूर है और एम्बुलेंस आने में बहुत समय लगता है।",
        "Primary health centre has no doctor for weeks, please help.",
        "Need emergency transport; nearest clinic is 20km away.",
    ],
    "water": [
        "No piped water for 10 days, handpumps are dry.",
        "पानी की पाइपलाइन टूटी है, कृपया मरम्मत कराएं।",
        "Village well contaminated, need clean drinking water.",
    ],
    "roads": [
        "Main road full of potholes, school bus cannot pass in rain.",
        "सड़क टूटी हुई है, बरसात में आना-जाना मुश्किल है।",
        "Need bridge repair before monsoon cuts off our locality.",
    ],
    "education": [
        "School has one teacher for 200 children, need staff.",
        "स्कूल में शिक्षक नहीं हैं, पढ़ाई बाधित है।",
    ],
    "electricity": [
        "Power cuts 8 hours daily, voltage too low for pumps.",
        "बिजली दिन में कई घंटे गुल रहती है।",
    ],
    "sanitation": [
        "Open drains overflowing, garbage not collected for weeks.",
        "नाली जाम है, सफाई की व्यवस्था कराएं।",
    ],
}

# Higher gap => worse infrastructure. Eastern/northern districts worse for healthcare (synthetic).
HIGH_GAP = {("Uttar Pradesh", "healthcare"), ("Bihar", "healthcare"),
            ("Rajasthan", "water"), ("West Bengal", "sanitation")}


def seed(db: Session, n_signals: int = 10500, seed: int = 42) -> dict:
    rng = random.Random(seed)
    now = datetime.utcnow()
    # clear
    for m in (CitizenSignal, Infrastructure, Demographic, Investment):
        db.query(m).delete()
    db.commit()

    counts = {"signals": 0, "infra": 0, "demo": 0, "invest": 0}
    for state, district, pop, lat, lon in DISTRICTS:
        db.add(Demographic(state=state, district=district, population=pop,
                           population_density=round(rng.uniform(300, 25000), 1),
                           growth_rate=round(rng.uniform(0.5, 2.5), 2)))
        counts["demo"] += 1
        for cat in CATEGORIES:
            base_gap = rng.uniform(0.25, 0.75)
            if (state, cat) in HIGH_GAP:
                base_gap = min(0.95, base_gap + 0.25)
            gap = round(base_gap, 3)
            db.add(Infrastructure(state=state, district=district, category=cat,
                                  facility_count=rng.randint(5, 220),
                                  coverage_index=round(1 - gap, 3), gap_index=gap))
            counts["infra"] += 1
            amt_cr = round(rng.uniform(2, 60) * (1.4 - gap), 2)  # underfunded where gap high
            db.add(Investment(state=state, district=district, category=cat,
                              amount=amt_cr * 1e7, status=rng.choice(["ongoing", "completed", "planned"]),
                              year=rng.choice([2023, 2024, 2025])))
            counts["invest"] += 1
    # district weights: populous + high-gap districts emit more signals
    dweights = []
    for _, district, pop, _, _ in DISTRICTS:
        dweights.append(pop / 1e6)
    for _ in range(n_signals):
        (state, district, pop, lat, lon) = rng.choices(DISTRICTS, weights=dweights, k=1)[0]
        cat = rng.choices(CATEGORIES, weights=WEIGHTS, k=1)[0]
        text = rng.choice(TEMPLATES[cat])
        # recency bias: 55% of signals in last 30 days (drives civic-pulse trend)
        days_ago = int(rng.expovariate(1 / 18)) if rng.random() < 0.55 else rng.randint(30, 90)
        days_ago = min(days_ago, 90)
        db.add(CitizenSignal(
            raw_text=text, language="hi" if any(ord(c) > 127 for c in text) else "en",
            category=cat, sub_category=f"{cat}_access",
            severity=rng.choices(["low", "medium", "high", "critical"], weights=[0.15, 0.4, 0.32, 0.13])[0],
            summary=text[:160], state=state, district=district,
            locality=rng.choice(["Ward 1", "Ward 4", "Block B", "Gram Panchayat", None]),
            latitude=round(lat + rng.uniform(-0.15, 0.15), 4),
            longitude=round(lon + rng.uniform(-0.15, 0.15), 4),
            ai_confidence=round(rng.uniform(0.62, 0.97), 2),
            created_at=now - timedelta(days=days_ago, hours=rng.randint(0, 23)),
        ))
        counts["signals"] += 1
    db.commit()
    return counts
