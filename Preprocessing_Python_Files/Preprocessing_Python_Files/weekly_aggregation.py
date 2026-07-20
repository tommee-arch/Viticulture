#!/usr/bin/env python3
"""
Weekly accumulation per block.

Reads the daily-per-block JSON file and collapses each block's daily records
into one record per ISO calendar week (Monday-Sunday). Numeric fields are
either summed or averaged depending on their meaning; identifier / constant
fields are carried through unchanged.
"""

import json
from collections import defaultdict
from datetime import date, timedelta

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
INPUT_PATH = "D:\Hackathon\Hackathon\Output\Final\Full_final_deduped.json"
OUTPUT_PATH = "D:\Hackathon\Hackathon\Output\Final\Weekly_accumulated.json"

# Flux / quantity fields -> summed over the week
SUM_FIELDS = [
    "ETa_mm",
    "Precip_mm",
    "Net_Deficit_mm",
    "ETo_mm",
    "Net_Irrigation_mm",
    "Pheno_Net_mm",
    "Litres",
    "Volume_m3",
    "Irrigation_net",
]

# State / index / weather fields -> averaged over the week
AVG_FIELDS = [
    "Kc",
    "AvgTemp",
    "MinTemp",
    "MaxTemp",
    "Radiation",
    "Windspeed",
    "Humidity",
    "Ks",
    "Mean_NDVI",
    "Mean_NDWI",
    "Ks_current_mean",
    "Ks_diff",
]

# Constant-per-block / identifier fields -> carried through unchanged
KEEP_FIELDS = [
    "Cultivar",
    "Season",
    "Area_m2",
]


def iso_week_bounds(d):
    """Return (week_start, week_end) as ISO date strings for the Mon-Sun
    calendar week containing date d."""
    monday = d - timedelta(days=d.weekday())      # Monday of that week
    sunday = monday + timedelta(days=6)            # Sunday of that week
    return monday.isoformat(), sunday.isoformat()


def main():
    with open(INPUT_PATH) as f:
        records = json.load(f)

    # Group daily records by (Block_ID, ISO year, ISO week)
    groups = defaultdict(list)
    for r in records:
        d = date.fromisoformat(r["Date"])
        iso_year, iso_week, _ = d.isocalendar()
        groups[(r["Block_ID"], iso_year, iso_week)].append(r)

    weekly = []
    for (block_id, iso_year, iso_week), rows in groups.items():
        # Order the days so the first/last dates are correct
        rows.sort(key=lambda r: r["Date"])
        first_day = date.fromisoformat(rows[0]["Date"])
        week_start, week_end = iso_week_bounds(first_day)

        out = {
            "Block_ID": block_id,
            "ISO_Year": iso_year,
            "ISO_Week": iso_week,
            "Week_Start": week_start,
            "Week_End": week_end,
            "Days_In_Week": len(rows),
        }

        # Carry-through fields: take the first non-null value seen
        for field in KEEP_FIELDS:
            out[field] = next(
                (r[field] for r in rows if r.get(field) is not None), None
            )

        # Summed fields: ignore nulls; result is None if every day was null
        for field in SUM_FIELDS:
            vals = [r[field] for r in rows if r.get(field) is not None]
            out[field] = round(sum(vals), 6) if vals else None

        # Averaged fields: ignore nulls; result is None if every day was null
        for field in AVG_FIELDS:
            vals = [r[field] for r in rows if r.get(field) is not None]
            out[field] = round(sum(vals) / len(vals), 6) if vals else None

        weekly.append(out)

    # Sort output for readability: by block, then chronologically
    weekly.sort(key=lambda r: (r["Block_ID"], r["ISO_Year"], r["ISO_Week"]))

    with open(OUTPUT_PATH, "w") as f:
        json.dump(weekly, f, indent=2)

    print(f"Read     {len(records):,} daily records")
    print(f"Wrote    {len(weekly):,} weekly records -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()