r"""
Create daily ETtarget rasters:

    ETtarget(pixel) = ETo(day, pixel) * Kc(week of day, pixel) * Ks(block of pixel, day)

  - ETo:  DAILY rasters in {BASE_DIR}\{season}\{ETO_SUBPATH}   (date in filename)
  - Kc:   WEEKLY rasters in {BASE_DIR}\{season}\{KC_SUBPATH}   (date in filename);
          every day in a week uses the most recent Kc raster on/before that day.
  - Ks:   daily per block, read from the final JSON ("Ks" field), painted onto
          the ETo grid using the block polygons from the shapefile.

One output tif per day is written to OUTPUT_DIR (ETtarget_YYYY-MM-DD.tif).
Pixels outside the blocks, or in blocks with no Ks that day, are nodata.

Requires: pandas, numpy, geopandas, rasterio, shapely
"""

import json
import os
import re
from datetime import datetime

import numpy as np
import pandas as pd

# ----------------------------- CONFIG ---------------------------------------
INPUT_JSON = r"D:\Hackathon\Hackathon\Final_Json\Daily_Statistics.json"
OUTPUT_DIR = r"D:\Hackathon\Hackathon\Output\ETtarget"

BASE_DIR       = r"D:\Hackathon\Hackathon"
SEASON_FOLDERS = ["2022_2023", "2023_2024", "2024_2025"]
ETO_SUBPATH    = os.path.join("ETo", "10m")   # -> {season}\ETo\10m\*.tif
KC_SUBPATH     = os.path.join("Kc", "10m")    # -> {season}\Kc\10m\*.tif

SHAPEFILE_PATH        = r"D:\Hackathon\Hackathon\Shapefiles\Tokara_Polygons.shp"
SHAPEFILE_BLOCK_FIELD = "BLOCK"

# Kc matching: each day uses the Kc raster CLOSEST in time (before or after),
# with no cap, so no day is left without a Kc. If the nearest Kc is more than
# this many days away, a warning is printed (raster likely missing) but the
# value is still used.
KC_WARN_DAYS = 14

# What to do when a block has no Ks for a day (Ks is null pre-budbreak):
#   None -> that block becomes nodata for that day
#   1.0  -> include the block with no stress scaling (ETtarget = ETo * Kc)
DEFAULT_KS = 1

ETO_BAND = 1        # band of the ETo tifs holding the ETo values
KC_BAND  = 1        # band of the Kc tifs holding the Kc values
NODATA   = -9999.0
# -----------------------------------------------------------------------------


# ------------------------- image date indexing -------------------------------
DATE_PATTERNS = [
    r"(\d{4})[-_\.]?(\d{2})[-_\.]?(\d{2})",   # 2023-01-20 / 20230120 / 2023_01_20
    r"(\d{2})[-_\.](\d{2})[-_\.](\d{4})",     # 20-01-2023 (day first)
]


def extract_date(text):
    for i, pattern in enumerate(DATE_PATTERNS):
        for match in re.finditer(pattern, text):
            a, b, c = match.groups()
            try:
                if i == 0:
                    return datetime(int(a), int(b), int(c))
                return datetime(int(c), int(b), int(a))
            except ValueError:
                continue
    return None


def build_index(subpath, label):
    r"""Recursively index {BASE_DIR}\{season}\{subpath} for dated tifs.
    Returns a sorted list of (date, path). Duplicate dates keep the first file."""
    entries = {}
    for season in SEASON_FOLDERS:
        root = os.path.join(BASE_DIR, season, subpath)
        if not os.path.isdir(root):
            print(f"WARNING: {label} folder not found: {root}")
            continue
        found_here = 0
        for dirpath, _, filenames in os.walk(root):
            for name in sorted(filenames):
                if not name.lower().endswith((".tif", ".tiff")):
                    continue
                date = extract_date(name)
                if date is None:
                    print(f"  WARNING: no date in {label} filename: {name}")
                    continue
                if date in entries:
                    print(f"  WARNING: duplicate {label} date {date.date()} "
                          f"({name} ignored, using {os.path.basename(entries[date])})")
                else:
                    entries[date] = os.path.join(dirpath, name)
                    found_here += 1
        print(f"  {root}: {found_here} tifs")

    index = sorted(entries.items())
    if index:
        print(f"{label}: {len(index)} rasters "
              f"({index[0][0].date()} to {index[-1][0].date()})")
    else:
        print(f"WARNING: no {label} rasters found!")
    return index


def find_kc_for_date(record_date, kc_index):
    """The Kc raster closest in time to the day (before or after, whichever is
    nearer). With no distance cap, every day gets a Kc as long as any Kc raster
    exists, so there are no missing-Kc gaps."""
    if not kc_index:
        return None
    return min(kc_index, key=lambda entry: abs((entry[0] - record_date).days))


# ----------------------------- Ks from JSON -----------------------------------
def load_ks_lookup():
    """{(BLOCK_ID, 'YYYY-MM-DD'): ks or None} from the final JSON."""
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    records = data if isinstance(data, list) else next(
        v for v in data.values() if isinstance(v, list))

    lookup = {}
    dup_count = 0
    for rec in records:
        block = str(rec.get("Block_ID", "")).strip().upper()
        date = str(rec.get("Date", "")).strip()
        key = (block, date)
        ks = rec.get("Ks")
        if key in lookup:
            dup_count += 1
            if lookup[key] is None:   # prefer a non-null Ks over null
                lookup[key] = ks
        else:
            lookup[key] = ks
    print(f"Ks lookup: {len(lookup)} block/date entries from JSON "
          f"({len(records)} records).")
    if dup_count:
        print(f"  WARNING: {dup_count} duplicate block/date records in the JSON "
              f"- consider deduplicating it.")
    return lookup


# --------------------------- block geometries ---------------------------------
def load_block_geometries():
    import geopandas as gpd

    gdf = gpd.read_file(SHAPEFILE_PATH)
    if SHAPEFILE_BLOCK_FIELD not in gdf.columns:
        raise ValueError(f"'{SHAPEFILE_BLOCK_FIELD}' not in shapefile. "
                         f"Available fields: {list(gdf.columns)}")
    gdf["_block"] = gdf[SHAPEFILE_BLOCK_FIELD].astype(str).str.strip().str.upper()
    gdf = gdf.dissolve(by="_block")
    print(f"Loaded {len(gdf)} block geometries from shapefile.")
    return gdf


# ----------------------------------- main --------------------------------------
def main():
    import rasterio
    from rasterio.features import rasterize
    from rasterio.warp import reproject, Resampling

    print("Indexing ETo rasters:")
    eto_index = build_index(ETO_SUBPATH, "ETo")
    print("Indexing Kc rasters:")
    kc_index = build_index(KC_SUBPATH, "Kc")

    if not eto_index or not kc_index:
        raise SystemExit(
            "\nERROR: no rasters were indexed - check the folder paths above.\n"
            f"Expected: {os.path.join(BASE_DIR, '<season>', ETO_SUBPATH)} (ETo) and "
            f"{os.path.join(BASE_DIR, '<season>', KC_SUBPATH)} (Kc).\n"
            "Fix BASE_DIR / SEASON_FOLDERS / ETO_SUBPATH / KC_SUBPATH in CONFIG."
        )

    ks_lookup = load_ks_lookup()
    blocks = load_block_geometries()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    reprojected_blocks = {}   # crs string -> gdf in that CRS
    kc_cache = {}             # (kc_path, crs, transform, shape) -> masked array

    stats = {"days": 0, "written": 0, "no_kc": 0, "no_ks_day": 0, "kc_far": 0,
             "block_no_ks": 0, "block_not_in_json": 0}

    for i, (date, eto_path) in enumerate(eto_index, 1):
        stats["days"] += 1
        date_str = date.strftime("%Y-%m-%d")

        # ---------- Kc raster closest to this day ----------
        kc_hit = find_kc_for_date(date, kc_index)
        if kc_hit is None:
            stats["no_kc"] += 1
            print(f"  {date_str}: no Kc rasters exist at all - skipped")
            continue
        gap = abs((kc_hit[0] - date).days)
        if gap > KC_WARN_DAYS:
            stats["kc_far"] += 1
            print(f"  {date_str}: nearest Kc is {gap} days away "
                  f"({kc_hit[0].date()}) - using it anyway")
        kc_path = kc_hit[1]

        with rasterio.open(eto_path) as src:
            eto = np.ma.masked_invalid(src.read(ETO_BAND, masked=True)
                                       .astype("float64"))
            transform, crs, shape = src.transform, src.crs, (src.height, src.width)
            profile = src.profile

        # ---------- Kc onto the ETo grid (cached per Kc file/grid) ----------
        grid_key = (kc_path, str(crs), tuple(transform)[:6], shape)
        if grid_key not in kc_cache:
            with rasterio.open(kc_path) as kc_src:
                dst = np.full(shape, NODATA, dtype="float64")
                reproject(
                    source=rasterio.band(kc_src, KC_BAND),
                    destination=dst,
                    src_transform=kc_src.transform,
                    src_crs=kc_src.crs,
                    src_nodata=kc_src.nodata,
                    dst_transform=transform,
                    dst_crs=crs,
                    dst_nodata=NODATA,
                    resampling=Resampling.nearest,
                )
            kc_cache[grid_key] = np.ma.masked_invalid(
                np.ma.masked_equal(dst, NODATA))
        kc = kc_cache[grid_key]

        # ---------- Ks raster for this day (per block) ----------
        crs_key = str(crs)
        if crs_key not in reprojected_blocks:
            reprojected_blocks[crs_key] = blocks.to_crs(crs)
        gdf = reprojected_blocks[crs_key]

        shapes = []
        for block, row in gdf.iterrows():
            key = (block, date_str)
            if key not in ks_lookup:
                stats["block_not_in_json"] += 1
                ks = DEFAULT_KS
            else:
                ks = ks_lookup[key]
                if ks is None:
                    stats["block_no_ks"] += 1
                    ks = DEFAULT_KS
            if ks is not None:
                shapes.append((row.geometry, float(ks)))

        if not shapes:
            stats["no_ks_day"] += 1
            continue  # no block has a Ks value this day (e.g. pre-budbreak)

        ks_arr = rasterize(shapes, out_shape=shape, transform=transform,
                           fill=NODATA, dtype="float64")
        ks = np.ma.masked_equal(ks_arr, NODATA)

        # ---------- ETtarget = ETo * Kc * Ks ----------
        et_target = eto * kc * ks   # masks combine automatically

        profile.update(dtype="float32", count=1, nodata=NODATA, compress="lzw")
        out_path = os.path.join(OUTPUT_DIR, f"ETtarget_{date_str}.tif")
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(et_target.filled(NODATA).astype("float32"), 1)
        stats["written"] += 1

        if i % 50 == 0:
            print(f"  ...{i}/{len(eto_index)} days processed")

    print("\n" + "=" * 55)
    print("ETtarget REPORT")
    print("=" * 55)
    print(f"ETo days found:                      {stats['days']}")
    print(f"ETtarget tifs written:               {stats['written']}")
    print(f"Days skipped - no Kc rasters at all: {stats['no_kc']}")
    print(f"Days where nearest Kc was >{KC_WARN_DAYS}d away: {stats['kc_far']}")
    print(f"Days skipped - no block had Ks:      {stats['no_ks_day']}")
    print(f"Block-days with null Ks:             {stats['block_no_ks']}"
          f"  (DEFAULT_KS={DEFAULT_KS})")
    print(f"Block-days missing from JSON:        {stats['block_not_in_json']}")
    print(f"\nOutputs in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()