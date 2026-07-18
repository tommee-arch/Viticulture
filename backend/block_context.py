"""Loads the same Tokara vineyard datasets the React frontend uses and turns
them into the per-block context the Gemini advisor answers questions from.

Data files live in ./data - copied from irrigation-dashboard/public/data at
setup time (see README.md). Re-copy them there if the source data changes.
"""
import json
import os
from dataclasses import dataclass
from datetime import date, datetime

import pandas as pd
import requests

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# PWDI (Plant Water Deficit Index) weights, as specified for the advisor.
DEFICIT_WEIGHT = 0.40
ETA_WEIGHT = 0.30
STAGE_WEIGHT = 0.20
CULTIVAR_WEIGHT = 0.10

# Ordinal water-sensitivity by growth stage (there's no Veraison/Harvest date
# in the dataset, so Flowering is as far as this resolves). Not sourced from
# a citation - a reasonable ordering pending real agronomic weights.
STAGE_SENSITIVITY = {
    "Pre-Budbreak": 0.2,
    "Budbreak": 0.6,
    "Flowering": 1.0,
}

# No per-cultivar water-need dataset exists in this project, so every
# cultivar gets the same neutral weight. Swap in real coefficients if/when
# that data becomes available - the 0.10 weight keeps its impact small.
DEFAULT_CULTIVAR_WEIGHT = 0.5

PRIORITY_THRESHOLDS = [
    (0.75, "Critical"),
    (0.5, "High"),
    (0.25, "Medium"),
    (0.0, "Low"),
]


@dataclass
class BlockContext:
    block_id: str
    cultivar: str
    stage: str
    stage_day: int
    eta: float
    deficit: float
    pwdi: float
    priority: str
    volume: float
    weather_summary: str


def _parse_us_date(value):
    """vineyard_STAR.csv stores Budbreak/Flowering as M/D/YYYY strings."""
    if not value or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        month, day, year = str(value).split("/")
        return date(int(year), int(month), int(day))
    except (ValueError, AttributeError):
        return None


def _anchor_to_season(day: date | None, season_start_year: int | None) -> date | None:
    """vineyard_STAR.csv only records Budbreak/Flowering for the 2022/2023
    season, but weekly_irrigation_final.json spans three seasons - re-anchor
    the month/day onto whichever season the reading actually falls in, since
    phenology recurs annually rather than only ever happening in 2022."""
    if day is None or season_start_year is None:
        return day
    return date(season_start_year, day.month, day.day)


def _derive_stage(record_date: date, season_start_year: int | None, budbreak: date | None, flowering: date | None):
    budbreak = _anchor_to_season(budbreak, season_start_year)
    flowering = _anchor_to_season(flowering, season_start_year)
    if flowering and record_date >= flowering:
        return "Flowering", (record_date - flowering).days
    if budbreak and record_date >= budbreak:
        return "Budbreak", (record_date - budbreak).days
    if budbreak:
        return "Pre-Budbreak", (record_date - budbreak).days
    return "Pre-Budbreak", 0


def _priority_for(pwdi: float) -> str:
    for threshold, label in PRIORITY_THRESHOLDS:
        if pwdi >= threshold:
            return label
    return "Low"


class BlockDataStore:
    """Loads once at process start; the underlying datasets are static."""

    def __init__(self):
        self.fields = pd.read_csv(os.path.join(DATA_DIR, "vineyard_STAR.csv"))
        self.fields = self.fields.dropna(subset=["BLOCK"]).drop_duplicates("BLOCK")

        with open(os.path.join(DATA_DIR, "weekly_irrigation_final.json")) as f:
            weekly = pd.DataFrame(json.load(f))
        # Each block's most recent weekly reading.
        weekly = weekly.sort_values("Date")
        self.latest_by_block = weekly.groupby("Block_ID").last()

        with open(os.path.join(DATA_DIR, "Tokara_V_Required.json")) as f:
            v_required_geojson = json.load(f)
        volumes: dict[str, float] = {}
        for feature in v_required_geojson.get("features", []):
            props = feature.get("properties", {})
            block = props.get("BLOCK")
            volume = props.get("V_Required_m3")
            if block is None or not isinstance(volume, (int, float)):
                continue
            volumes[block] = volumes.get(block, 0.0) + volume
        self.volume_by_block = volumes

        # Min/max deficit and ETa across all blocks' latest readings, for
        # normalizing the PWDI components consistently block-to-block.
        self.deficit_min = float(self.latest_by_block["Net_Deficit_mm"].min())
        self.deficit_max = float(self.latest_by_block["Net_Deficit_mm"].max())
        self.eta_min = float(self.latest_by_block["ETa_mm"].min())
        self.eta_max = float(self.latest_by_block["ETa_mm"].max())

    def _normalize(self, value: float, lo: float, hi: float) -> float:
        if hi <= lo:
            return 0.0
        return max(0.0, min(1.0, (value - lo) / (hi - lo)))

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

        if block_id not in self.latest_by_block.index:
            raise ValueError(f"No irrigation data recorded for block '{block_id}'.")
        record = self.latest_by_block.loc[block_id]
        record_date = datetime.strptime(record["Date"], "%Y-%m-%d").date()

        budbreak = _parse_us_date(field.get("Budbreak"))
        flowering = _parse_us_date(field.get("Flowering"))
        season_start_year = int(str(record["Season"])[:4])
        stage, stage_day = _derive_stage(record_date, season_start_year, budbreak, flowering)

        deficit = float(record["Net_Deficit_mm"])
        eta = float(record["ETa_mm"])
        deficit_norm = self._normalize(deficit, self.deficit_min, self.deficit_max)
        eta_norm = self._normalize(eta, self.eta_min, self.eta_max)
        stage_weight = STAGE_SENSITIVITY.get(stage, 0.2)

        pwdi = (
            DEFICIT_WEIGHT * deficit_norm
            + ETA_WEIGHT * eta_norm
            + STAGE_WEIGHT * stage_weight
            + CULTIVAR_WEIGHT * DEFAULT_CULTIVAR_WEIGHT
        )

        weather_summary = self._weather_summary(field.get("Y"), field.get("X"))

        return BlockContext(
            block_id=block_id,
            cultivar=field.get("CULTIVAR", "Unknown"),
            stage=stage,
            stage_day=stage_day,
            eta=round(eta, 2),
            deficit=round(deficit, 2),
            pwdi=round(pwdi, 3),
            priority=_priority_for(pwdi),
            volume=round(self.volume_by_block.get(block_id, 0.0)),
            weather_summary=weather_summary,
        )


store = BlockDataStore()


def get_block_context(block_id: str) -> BlockContext:
    return store.get_block_context(block_id)
