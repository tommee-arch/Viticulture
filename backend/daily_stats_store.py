"""Ingests newly uploaded ETa/ETo/Kc/NDVI rasters plus a precomputed
Sentinel-2 NDVI/NDWI CSV, turns them into per-block rows, and upserts them
into Daily_Statistics.json.

IMPORTANT CAVEAT: this was built without any real sample raster or CSV file
to test against (none were available) - the zonal-statistics logic follows
rasterstats' standard usage and reprojects the block polygons to match
whatever CRS each uploaded raster reports, which is the normally-correct
approach, but it has not been exercised against a real ETa/NDVI product.
Test with a real file before relying on this in production, and check the
CRS assumption in particular if results look wrong (all-null or all-zero
per block usually means a CRS/nodata mismatch).
"""
import io
import json
import os
from datetime import date, datetime

import geopandas as gpd
import pandas as pd
import requests

from block_context import store as block_store

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DAILY_STATS_PATH = os.path.join(DATA_DIR, "Daily_Statistics.json")
BLOCKS_PATH = os.path.join(DATA_DIR, "Tokara_Study_Area.json")
PHENO_PATH = os.path.join(DATA_DIR, "Tokara_Pheno_Data.csv")

GROWTH_STAGES = ["Budbreak", "Flowering", "PreVeraison", "Harvest"]


def _parse_us_date(value):
    if not value or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        month, day, year = str(value).split("/")
        return date(int(year), int(month), int(day))
    except (ValueError, AttributeError, TypeError):
        return None


def _season_label(record_date: date) -> str:
    """Vineyard seasons run roughly Aug-Jul - a date in Jan-Jun belongs to
    the season that started the previous calendar year. Mirrors the same
    July-cutover convention used in the frontend's Irrigation Planner."""
    start_year = record_date.year if record_date.month >= 7 else record_date.year - 1
    return f"{start_year}/{start_year + 1}"


def _season_number(season_label: str) -> int:
    """'2024/2025' -> 20242025, matching Daily_Statistics.json's Season field."""
    start, end = season_label.split("/")
    return int(f"{start}{end}")


class DailyStatsStore:
    """Loads once at process start; mutated in place as uploads come in."""

    def __init__(self):
        self.blocks_gdf = gpd.read_file(BLOCKS_PATH)
        if self.blocks_gdf.crs is None:
            # Tokara_Study_Area.json has no explicit CRS - its coordinates
            # are plain lon/lat (WGS84), same as everywhere else in this app.
            self.blocks_gdf = self.blocks_gdf.set_crs(epsg=4326)

        pheno = pd.read_csv(PHENO_PATH, encoding="cp1252")
        self.pheno = pheno[pheno["Block ID"].notna()]

        with open(DAILY_STATS_PATH) as f:
            self.rows = json.load(f)
        self._reindex()
        self._json_cache = None

    def to_json(self) -> str:
        """Cached serialization - re-encoding 80k+ rows on every GET would be
        wasteful, so this only re-serializes after an upsert changes data."""
        if self._json_cache is None:
            self._json_cache = json.dumps(self.rows)
        return self._json_cache

    def _reindex(self):
        self.index = {(r["Block_ID"], r["Date"]): i for i, r in enumerate(self.rows)}

    def _pheno_row_for(self, block_id: str, season_label: str):
        block_rows = self.pheno[self.pheno["Block ID"] == block_id]
        exact = block_rows[block_rows["season"] == season_label]
        if not exact.empty:
            return exact.iloc[0]
        with_season = block_rows[block_rows["season"].notna()].sort_values("season")
        if not with_season.empty:
            return with_season.iloc[-1]
        return block_rows.iloc[0] if not block_rows.empty else None

    def growth_stage_for(self, block_id: str, record_date: date) -> str | None:
        season_label = _season_label(record_date)
        pheno_row = self._pheno_row_for(block_id, season_label)
        if pheno_row is None:
            return None
        stage = "Pre-Budbreak"
        for stage_name in GROWTH_STAGES:
            stage_date = _parse_us_date(pheno_row.get(stage_name))
            if stage_date and record_date >= stage_date:
                stage = stage_name
        return stage

    def zonal_mean_per_block(self, raster_bytes: bytes) -> dict:
        """Mean raster value within each block polygon, keyed by Block_ID."""
        import rasterio
        from rasterio.io import MemoryFile
        from rasterstats import zonal_stats

        with MemoryFile(raster_bytes) as memfile:
            with memfile.open() as src:
                blocks = self.blocks_gdf
                if src.crs is not None and blocks.crs != src.crs:
                    blocks = blocks.to_crs(src.crs)
                band = src.read(1, masked=True)
                stats = zonal_stats(
                    blocks,
                    band,
                    affine=src.transform,
                    nodata=src.nodata,
                    stats=["mean"],
                )
        return {
            block: s["mean"]
            for block, s in zip(blocks["BLOCK"], stats)
            if s["mean"] is not None
        }

    def parse_precomputed_indices_csv(self, csv_bytes: bytes) -> dict:
        """'Sentinel imagery' upload: a CSV of already-computed per-block
        NDVI/NDWI (see the module docstring - not yet tested against a real
        file, so column names are matched flexibly and generously)."""
        df = pd.read_csv(io.BytesIO(csv_bytes))
        cols = {c.strip().lower(): c for c in df.columns}
        block_col = cols.get("block_id") or cols.get("block")
        ndvi_col = cols.get("mean_ndvi") or cols.get("ndvi")
        ndwi_col = cols.get("mean_ndwi") or cols.get("ndwi")
        if not block_col:
            raise ValueError("Sentinel imagery CSV needs a Block_ID (or Block) column.")

        result = {}
        for _, row in df.iterrows():
            block = row[block_col]
            entry = {}
            if ndvi_col and pd.notna(row.get(ndvi_col)):
                entry["Mean_NDVI"] = float(row[ndvi_col])
            if ndwi_col and pd.notna(row.get(ndwi_col)):
                entry["Mean_NDWI"] = float(row[ndwi_col])
            if entry:
                result[block] = entry
        return result

    def precip_for_date(self, date_str: str):
        """Historical rainfall from the same Open-Meteo archive endpoint the
        frontend's WeatherWidget already uses - none of the 5 upload types
        (ETa/ETo/Kc/NDVI/Sentinel imagery) carry precipitation. The whole
        vineyard spans under 2km, so one representative point (the block
        centroid average) stands in for all blocks rather than making a
        separate request per block - daily rainfall doesn't meaningfully
        vary over that distance, and Open-Meteo's own model grid is coarser
        than the vineyard anyway."""
        centroid = block_store.fields[["Y", "X"]].mean()
        try:
            resp = requests.get(
                "https://archive-api.open-meteo.com/v1/archive",
                params={
                    "latitude": centroid["Y"],
                    "longitude": centroid["X"],
                    "start_date": date_str,
                    "end_date": date_str,
                    "daily": "precipitation_sum",
                    "timezone": "auto",
                },
                timeout=10,
            )
            resp.raise_for_status()
            values = resp.json().get("daily", {}).get("precipitation_sum") or []
            return values[0] if values else None
        except requests.RequestException:
            return None

    def build_updates(self, date_str, eta_by_block=None, eto_by_block=None,
                       kc_by_block=None, ndvi_by_block=None, sentinel_by_block=None):
        """One merged update row per block touched by any of the uploads."""
        record_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        season_label = _season_label(record_date)
        season_number = _season_number(season_label)

        all_blocks = set()
        for d in (eta_by_block, eto_by_block, kc_by_block, ndvi_by_block, sentinel_by_block):
            if d:
                all_blocks.update(d.keys())

        # One rainfall lookup for the whole batch (see precip_for_date) rather
        # than one per block - was the bottleneck (~1 request/block/upload).
        precip = self.precip_for_date(date_str)

        updates = {}
        for block in all_blocks:
            eta = (eta_by_block or {}).get(block)
            eto = (eto_by_block or {}).get(block)
            kc = (kc_by_block or {}).get(block)
            ndvi = (ndvi_by_block or {}).get(block)
            sentinel = (sentinel_by_block or {}).get(block) or {}
            mean_ndvi = ndvi if ndvi is not None else sentinel.get("Mean_NDVI")
            mean_ndwi = sentinel.get("Mean_NDWI")

            net_irrigation = (eta - precip) if (eta is not None and precip is not None) else None
            net_deficit = max(net_irrigation, 0) if net_irrigation is not None else None

            field_rows = block_store.fields[block_store.fields["BLOCK"] == block]
            cultivar = field_rows.iloc[0]["CULTIVAR"] if not field_rows.empty else None

            row = {
                "Block_ID": block,
                "Date": date_str,
                "Season": season_number,
                "ETa_mm": eta,
                "ETo_mm": eto,
                "Kc": kc,
                "Precip_mm": precip,
                "Net_Irrigation_mm": net_irrigation,
                "Net_Deficit_mm": net_deficit,
                "Cultivar": cultivar,
                "Growth_Stage": self.growth_stage_for(block, record_date),
                "Mean_NDVI": mean_ndvi,
                "Mean_NDWI": mean_ndwi,
            }
            updates[block] = row
        return updates

    def upsert(self, updates: dict):
        """Merges each block's update into the in-memory rows, overwriting
        only fields that were actually computed (None values are dropped so
        an upload missing e.g. Kc doesn't blank out an existing Kc value)."""
        touched = 0
        for block, new_fields in updates.items():
            key = (block, new_fields["Date"])
            clean_fields = {k: v for k, v in new_fields.items() if v is not None}
            if key in self.index:
                self.rows[self.index[key]].update(clean_fields)
            else:
                self.index[key] = len(self.rows)
                self.rows.append(clean_fields)
            touched += 1
        self._json_cache = None
        return touched

    def save_to_disk(self):
        """Persists back to disk. On a host with an ephemeral filesystem
        (e.g. Render's free tier) this does NOT survive a restart/redeploy -
        fine for a single running session/demo, but a real deployment needs
        a database or object storage for this to be durable."""
        with open(DAILY_STATS_PATH, "w") as f:
            json.dump(self.rows, f)


store = DailyStatsStore()
