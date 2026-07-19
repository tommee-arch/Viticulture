"""Ingests newly uploaded ETa/ETo/Kc/NDVI rasters, a raw Sentinel-2 band
raster (for NDWI), plus manually-entered Precipitation and Ks, turns them
into per-block rows, and upserts them into Daily_Statistics.json.

IMPORTANT CAVEAT: this was built without any real sample raster to test
against (none were available) - the zonal-statistics logic follows
rasterstats' standard usage and reprojects the block polygons to match
whatever CRS each uploaded raster reports, which is the normally-correct
approach, but it has only been exercised against synthetic test rasters,
not a real ETa/NDVI/Sentinel-2 product. Test with a real file before
relying on this in production; if results look wrong, check first:
  - CRS/nodata mismatch (all-null or all-zero per block)
  - the Sentinel imagery band order assumption (see ndwi_mean_per_block)
"""
import json
import os
from datetime import date, datetime

import geopandas as gpd
import pandas as pd

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

        # Each block's area (m2) is static and already present on most
        # existing rows - reuse it rather than recomputing from geometry
        # (which would need a metric-CRS reprojection to get right).
        self.area_m2_by_block = {}
        for r in self.rows:
            block = r.get("Block_ID")
            area = r.get("Area_m2")
            if block and area is not None and block not in self.area_m2_by_block:
                self.area_m2_by_block[block] = area

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

    def _zonal_mean(self, values, transform, crs, nodata):
        """Shared helper: mean of a raster array within each block polygon."""
        from rasterstats import zonal_stats

        blocks = self.blocks_gdf
        if crs is not None and blocks.crs != crs:
            blocks = blocks.to_crs(crs)
        stats = zonal_stats(blocks, values, affine=transform, nodata=nodata, stats=["mean"])
        return {
            block: s["mean"]
            for block, s in zip(blocks["BLOCK"], stats)
            if s["mean"] is not None
        }

    def zonal_mean_per_block(self, raster_bytes: bytes) -> dict:
        """Mean raster value within each block polygon, keyed by Block_ID.
        Used for ETa/ETo/Kc/NDVI - each a single-band raster of
        already-computed values."""
        import rasterio
        from rasterio.io import MemoryFile

        with MemoryFile(raster_bytes) as memfile:
            with memfile.open() as src:
                band = src.read(1, masked=True)
                return self._zonal_mean(band, src.transform, src.crs, src.nodata)

    def ndwi_mean_per_block(self, raster_bytes: bytes) -> dict:
        """'Sentinel imagery' upload: a raw 4-band raster, assumed band
        order [B4, B3, B2, B8] (Red, Green, Blue, NIR) per how these bands
        were specified. NDWI = (Green - NIR) / (Green + NIR) = (B3 - B8) /
        (B3 + B8), computed per pixel then averaged per block.

        This band-order assumption is unverified against a real Sentinel-2
        file - if NDWI values come back implausible (e.g. outside [-1, 1]
        or suspiciously uniform), check the actual band order first."""
        import numpy as np
        import rasterio
        from rasterio.io import MemoryFile

        with MemoryFile(raster_bytes) as memfile:
            with memfile.open() as src:
                if src.count < 4:
                    raise ValueError(
                        f"Sentinel imagery raster needs 4 bands (B4, B3, B2, B8) - got {src.count}."
                    )
                green = src.read(2, masked=True).astype("float64")  # B3
                nir = src.read(4, masked=True).astype("float64")  # B8
                with np.errstate(invalid="ignore", divide="ignore"):
                    ndwi = (green - nir) / (green + nir)
                ndwi = np.ma.masked_invalid(ndwi)
                return self._zonal_mean(ndwi, src.transform, src.crs, src.nodata)

    def build_updates(self, date_str, eta_by_block=None, eto_by_block=None,
                       kc_by_block=None, ndvi_by_block=None, ndwi_by_block=None,
                       precip_mm=None, ks=None):
        """One merged update row per block touched by any of the uploads.
        precip_mm and ks are single values entered for the whole batch
        (not per block) - Precip_mm is stored as given; Pheno_Net_mm and
        Volume_m3 are only computed for blocks where ETa, precip and Ks are
        all available."""
        record_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        season_label = _season_label(record_date)
        season_number = _season_number(season_label)

        all_blocks = set()
        for d in (eta_by_block, eto_by_block, kc_by_block, ndvi_by_block, ndwi_by_block):
            if d:
                all_blocks.update(d.keys())

        updates = {}
        for block in all_blocks:
            eta = (eta_by_block or {}).get(block)
            eto = (eto_by_block or {}).get(block)
            kc = (kc_by_block or {}).get(block)
            mean_ndvi = (ndvi_by_block or {}).get(block)
            mean_ndwi = (ndwi_by_block or {}).get(block)

            net_irrigation = (eta - precip_mm) if (eta is not None and precip_mm is not None) else None
            net_deficit = max(net_irrigation, 0) if net_irrigation is not None else None

            # Pheno_Net_mm = (ETa - Precip) x Ks
            pheno_net_mm = (eta - precip_mm) * ks if (eta is not None and precip_mm is not None and ks is not None) else None

            # Litres = Pheno_Net_mm x block area, then Volume_m3 = that / 1000
            # - matches the existing dataset's Litres/Volume_m3 relationship.
            area_m2 = self.area_m2_by_block.get(block)
            litres = pheno_net_mm * area_m2 if (pheno_net_mm is not None and area_m2 is not None) else None
            volume_m3 = litres / 1000 if litres is not None else None

            field_rows = block_store.fields[block_store.fields["BLOCK"] == block]
            cultivar = field_rows.iloc[0]["CULTIVAR"] if not field_rows.empty else None

            row = {
                "Block_ID": block,
                "Date": date_str,
                "Season": season_number,
                "ETa_mm": eta,
                "ETo_mm": eto,
                "Kc": kc,
                "Ks": ks,
                "Precip_mm": precip_mm,
                "Net_Irrigation_mm": net_irrigation,
                "Net_Deficit_mm": net_deficit,
                "Pheno_Net_mm": pheno_net_mm,
                "Area_m2": area_m2,
                "Litres": litres,
                "Volume_m3": volume_m3,
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
