"""Loads the same Tokara vineyard datasets the React frontend uses and turns
them into the per-block context the Gemini advisor answers questions from.

The PWDI/priority/volume numbers here are computed exactly the same way as
the Irrigation Planner table in the frontend (irrigation-dashboard/src/
Irrigation_Planner.js) - same Full_final_deduped.json latest-record-per-block
source, same Managerial_Ks_Value.csv hydrology lookup, same 1-5 scaling and
quartile bucketing - so the chatbot's answers match what's on screen.

Data files live in ./data - copied from irrigation-dashboard/public/data at
setup time (see README.md). Re-copy them there if the source data changes.
"""
import json
import os

import pandas as pd
import requests

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DAILY_STATS_PATH = os.path.join(DATA_DIR, "Full_final_deduped.json")
MANAGERIAL_KS_PATH = os.path.join(DATA_DIR, "Managerial_Ks_Value.csv")

# Growth stage -> water-demand score (1-5, 5 = highest demand). Mirrors
# GROWTH_STAGE_SCORE in Irrigation_Planner.js exactly.
GROWTH_STAGE_SCORE = {
    "PreVeraison": 5,
    "Flowering": 4,
    "Budbreak": 2,
    "Harvest": 1,
    "Pre-Budbreak": 1,
    "Unknown": 1,
}

# Hydrology strategy (Managerial_Ks_Value.csv's "Type of hydrology mech")
# -> water-sensitivity score (1-5). Mirrors GRAPE_TYPE_SCORE in
# Irrigation_Planner.js exactly.
GRAPE_TYPE_SCORE = {
    "Isohydric": 5,
    "Anisohydric-Isohydric": 3,
    "Anisohydric": 1,
}
DEFAULT_GRAPE_TYPE_SCORE = 3


class BlockContext:
    def __init__(self, block_id, cultivar, stage, record_date, eta, deficit,
                 irrigation_net, pwdi, priority, volume, weather_summary):
        self.block_id = block_id
        self.cultivar = cultivar
        self.stage = stage
        self.record_date = record_date
        self.eta = eta
        self.deficit = deficit
        self.irrigation_net = irrigation_net
        self.pwdi = pwdi
        self.priority = priority
        self.volume = volume
        self.weather_summary = weather_summary


class BlockDataStore:
    """Loads once at process start; the underlying datasets are static.

    NOTE: Full_final_deduped.json is also the file /api/upload-daily-data
    mutates (see daily_stats_store.py). This store reads its own snapshot
    at startup, so an upload landing while this process is already running
    won't be reflected here until the process restarts - same
    already-accepted limitation the rest of this backend has on Render's
    ephemeral filesystem (see README.md's persistence caveat).
    """

    def __init__(self):
        self.fields = pd.read_csv(os.path.join(DATA_DIR, "vineyard_STAR.csv"))
        self.fields = self.fields.dropna(subset=["BLOCK"]).drop_duplicates("BLOCK")

        # Managerial_Ks_Value.csv has a title row before the real header
        # ("Cultivars,Type of hydrology mech,Budbreak,..."), same as the
        # frontend's parsing of it.
        ks_df = pd.read_csv(MANAGERIAL_KS_PATH, skiprows=1)
        self.hydrology_by_cultivar = dict(zip(ks_df["Cultivars"], ks_df["Type of hydrology mech"]))

        with open(DAILY_STATS_PATH) as f:
            daily_rows = json.load(f)
        self.daily_latest_by_block = {}
        for row in daily_rows:
            block = row.get("Block_ID")
            if not block:
                continue
            cur = self.daily_latest_by_block.get(block)
            if not cur or row["Date"] > cur["Date"]:
                self.daily_latest_by_block[block] = row

        self.pwdi_by_block, self.priority_by_block = self._compute_pwdi_and_priority()

    def _compute_pwdi_and_priority(self):
        """PWDI = 0.4 x Irrigation_net score + 0.4 x growth-stage score +
        0.2 x grape-type score, each scaled 1-5. Priority buckets are
        relative quartiles of today's PWDI spread across the vineyard, not
        fixed cutoffs - mirrors priorityRows in Irrigation_Planner.js."""
        irrigation_net_values = [
            r.get("Irrigation_net") for r in self.daily_latest_by_block.values()
            if r.get("Irrigation_net") is not None
        ]
        irrigation_net_min = min(irrigation_net_values) if irrigation_net_values else 0
        irrigation_net_max = max(irrigation_net_values) if irrigation_net_values else 0

        pwdi_by_block = {}
        for block, record in self.daily_latest_by_block.items():
            irrigation_net = record.get("Irrigation_net")
            if irrigation_net is None:
                pwdi_by_block[block] = None
                continue
            scaled_irrigation_net = (
                3 if irrigation_net_max == irrigation_net_min
                else 1 + 4 * ((irrigation_net - irrigation_net_min) / (irrigation_net_max - irrigation_net_min))
            )
            scaled_stage = GROWTH_STAGE_SCORE.get(record.get("Growth_Stage"), 1)
            hydrology_type = self.hydrology_by_cultivar.get(record.get("Cultivar"))
            scaled_grape = GRAPE_TYPE_SCORE.get(hydrology_type, DEFAULT_GRAPE_TYPE_SCORE)
            pwdi_by_block[block] = (0.4 * scaled_irrigation_net) + (0.4 * scaled_stage) + (0.2 * scaled_grape)

        ranked = sorted(
            (b for b, v in pwdi_by_block.items() if v is not None),
            key=lambda b: pwdi_by_block[b],
            reverse=True,
        )
        priority_by_block = {}
        n = len(ranked)
        for i, block in enumerate(ranked):
            percentile = (i / (n - 1)) if n > 1 else 0
            if percentile <= 0.25:
                priority_by_block[block] = "critical"
            elif percentile <= 0.5:
                priority_by_block[block] = "high"
            elif percentile <= 0.75:
                priority_by_block[block] = "moderate"
            else:
                priority_by_block[block] = "low"
        # Blocks with no Irrigation_net reading fall back to 'low' rather
        # than being left unscored - same as the frontend.
        for block, v in pwdi_by_block.items():
            if v is None:
                priority_by_block[block] = "low"

        return pwdi_by_block, priority_by_block

    def _weather_summary(self, lat: float, lng: float) -> str:
        try:
            resp = requests.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "daily": "et0_fao_evapotranspiration,precipitation_sum",
                    "timezone": "auto",
                    "forecast_days": 7,
                },
                timeout=5,
            )
            resp.raise_for_status()
            daily = resp.json().get("daily", {})
            precip = daily.get("precipitation_sum") or []
            eto = daily.get("et0_fao_evapotranspiration") or []
            if not precip or not eto:
                return "Forecast unavailable."
            total_precip = sum(precip)
            avg_eto = sum(eto) / len(eto)
            return (
                f"Next 7 days: {total_precip:.1f}mm total rain expected, "
                f"ETo averaging {avg_eto:.1f}mm/day."
            )
        except requests.RequestException:
            return "Forecast unavailable."

    def get_block_context(self, block_id: str) -> BlockContext:
        field_rows = self.fields[self.fields["BLOCK"] == block_id]
        if field_rows.empty:
            raise ValueError(f"Unknown block '{block_id}'.")
        field = field_rows.iloc[0]

        record = self.daily_latest_by_block.get(block_id)
        if record is None:
            raise ValueError(f"No irrigation data recorded for block '{block_id}'.")

        cultivar = record.get("Cultivar") or field.get("CULTIVAR", "Unknown")
        stage = record.get("Growth_Stage") or "Unknown"
        eta = record.get("ETa_mm")
        deficit = record.get("Net_Deficit_mm")
        irrigation_net = record.get("Irrigation_net")
        volume = record.get("Volume_m3") or 0
        pwdi = self.pwdi_by_block.get(block_id)
        priority = self.priority_by_block.get(block_id, "low")

        weather_summary = self._weather_summary(field.get("Y"), field.get("X"))

        return BlockContext(
            block_id=block_id,
            cultivar=cultivar,
            stage=stage,
            record_date=record.get("Date"),
            eta=round(eta, 2) if eta is not None else None,
            deficit=round(deficit, 2) if deficit is not None else None,
            irrigation_net=round(irrigation_net, 2) if irrigation_net is not None else None,
            pwdi=round(pwdi, 3) if pwdi is not None else None,
            priority=priority,
            volume=round(volume),
            weather_summary=weather_summary,
        )


store = BlockDataStore()


def get_block_context(block_id: str) -> BlockContext:
    return store.get_block_context(block_id)
