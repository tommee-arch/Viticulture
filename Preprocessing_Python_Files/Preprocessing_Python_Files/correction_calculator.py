r"""
Create daily correction rasters:

    correction(pixel) = Ks_diff(block, day) * ETo(day, pixel) * Kc(week, pixel)

  - Ks_diff: one value per block per day, read from the JSON ("Ks_diff" field
             produced by add_ks_diff.py), painted onto the block polygons.
  - ETo:     DAILY rasters in {BASE_DIR}\{season}\{ETO_SUBPATH}  (date in name).
  - Kc:      WEEKLY rasters in {BASE_DIR}\{season}\{KC_SUBPATH};  each day uses
             the Kc raster CLOSEST in time (before or after) - same as before.

Computed per pixel, restricted to the block polygons (shapefile). One output
tif per day -> OUTPUT_DIR (correction_YYYY-MM-DD.tif). Pixels outside blocks,
or in blocks with null Ks_diff that day, are nodata.

Requires: pandas, numpy, geopandas, rasterio, shapely
"""

import json
import os
import re
from datetime import datetime

import numpy as np

# ----------------------------- CONFIG ---------------------------------------
INPUT_JSON = r"D:\Hackathon\Hackathon\Output\Final\Full_final_ksdiff.json"
OUTPUT_DIR = r"D:\Hackathon\Hackathon\Output\Correction"

BASE_DIR       = r"D:\Hackathon\Hackathon"
SEASON_FOLDERS = ["2022_2023", "2023_2024", "2024_2025"]
ETO_SUBPATH    = os.path.join("ETo", "10m")   # -> {season}\ETo\10m\*.tif
KC_SUBPATH     = os.path.join("Kc", "10m")    # -> {season}\Kc\10m\*.tif

SHAPEFILE_PATH        = r"D:\Hackathon\Hackathon\Shapefiles\Tokara_Polygons.shp"
SHAPEFILE_BLOCK_FIELD = "BLOCK"

# Kc matching: each day uses the Kc raster CLOSEST in time (before or after),
# no cap. Warn if the nearest is more than this many days away.
KC_WARN_DAYS = 14

JSON_DIFF_FIELD = "Ks_diff"   # field holding the per-block/day difference
ETO_BAND = 1
KC_BAND  = 1
NODATA   = -9999.0
# -----------------------------------------------------------------------------

DATE_PATTERNS = [
    r"(\d{4})[-_\.]?(\d{2})[-_\.]?(\d{2})",
    r"(\d{2})[-_\.](\d{2})[-_\.](\d{4})",
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
    r"""Recursively index {BASE_DIR}\{season}\{subpath} -> {date: path}."""
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
                if date not in entries:
                    entries[date] = os.path.join(dirpath, name)
                    found_here += 1
        print(f"  {root}: {found_here} tifs")
    if entries:
        dates = sorted(entries)
        print(f"{label}: {len(entries)} rasters "
              f"({dates[0].date()} to {dates[-1].date()})")
    else:
        print(f"WARNING: no {label} rasters found!")
    return entries


def find_kc_for_date(record_date, kc_sorted):
    if not kc_sorted:
        return None
    return min(kc_sorted, key=lambda entry: abs((entry[0] - record_date).days))


def load_ksdiff_lookup():
    """{(BLOCK_ID, 'YYYY-MM-DD'): ks_diff or None} from the JSON.
    Prefers a non-null value if duplicate records disagree."""
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    records = data if isinstance(data, list) else next(
        v for v in data.values() if isinstance(v, list))

    if records and JSON_DIFF_FIELD not in records[0]:
        raise SystemExit(
            f"ERROR: field '{JSON_DIFF_FIELD}' not found in {INPUT_JSON}.\n"
            f"Run add_ks_diff.py first and point INPUT_JSON at its output "
            f"(Full_final_ksdiff.json)."
        )

    lookup = {}
    dup = 0
    for rec in records:
        block = str(rec.get("Block_ID", "")).strip().upper()
        date = str(rec.get("Date", "")).strip()
        key = (block, date)
        val = rec.get(JSON_DIFF_FIELD)
        if key in lookup:
            dup += 1
            if lookup[key] is None:
                lookup[key] = val
        else:
            lookup[key] = val
    print(f"Ks_diff lookup: {len(lookup)} block/date entries "
          f"from {len(records)} records.")
    if dup:
        print(f"  WARNING: {dup} duplicate block/date records in the JSON.")
    return lookup


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
            "\nERROR: no rasters indexed - check the folder paths above.\n"
            "Fix BASE_DIR / SEASON_FOLDERS / ETO_SUBPATH / KC_SUBPATH in CONFIG."
        )

    kc_sorted = sorted(kc_index.items())
    diff_lookup = load_ksdiff_lookup()
    blocks = load_block_geometries()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    reprojected_blocks = {}   # crs string -> gdf in that crs
    kc_cache = {}             # (kc_path, crs, transform, shape) -> masked Kc array

    stats = {"days": 0, "written": 0, "no_kc": 0, "kc_far": 0,
             "no_diff_day": 0, "block_null_diff": 0, "block_not_in_json": 0}

    for i, date in enumerate(sorted(eto_index), 1):
        stats["days"] += 1
        date_str = date.strftime("%Y-%m-%d")
        eto_path = eto_index[date]

        kc_hit = find_kc_for_date(date, kc_sorted)
        if kc_hit is None:
            stats["no_kc"] += 1
            print(f"  {date_str}: no Kc rasters exist - skipped")
            continue
        gap = abs((kc_hit[0] - date).days)
        if gap > KC_WARN_DAYS:
            stats["kc_far"] += 1
            print(f"  {date_str}: nearest Kc is {gap} days away "
                  f"({kc_hit[0].date()}) - using it anyway")
        kc_path = kc_hit[1]

        # ---------- ETo defines the output grid ----------
        with rasterio.open(eto_path) as src:
            eto = np.ma.masked_invalid(src.read(ETO_BAND, masked=True)
                                       .astype("float64"))
            transform, crs, shape = src.transform, src.crs, (src.height, src.width)
            profile = src.profile

        # ---------- Kc onto the ETo grid (cached) ----------
        grid_key = (kc_path, str(crs), tuple(transform)[:6], shape)
        if grid_key not in kc_cache:
            with rasterio.open(kc_path) as kc_src:
                if (kc_src.crs == crs and kc_src.transform == transform
                        and (kc_src.height, kc_src.width) == shape):
                    kc_cache[grid_key] = np.ma.masked_invalid(
                        kc_src.read(KC_BAND, masked=True).astype("float64"))
                else:
                    dst = np.full(shape, NODATA, dtype="float64")
                    reproject(
                        source=rasterio.band(kc_src, KC_BAND), destination=dst,
                        src_transform=kc_src.transform, src_crs=kc_src.crs,
                        src_nodata=kc_src.nodata, dst_transform=transform,
                        dst_crs=crs, dst_nodata=NODATA,
                        resampling=Resampling.nearest,
                    )
                    kc_cache[grid_key] = np.ma.masked_invalid(
                        np.ma.masked_equal(dst, NODATA))
        kc = kc_cache[grid_key]

        # ---------- Ks_diff painted onto blocks ----------
        crs_key = str(crs)
        if crs_key not in reprojected_blocks:
            reprojected_blocks[crs_key] = blocks.to_crs(crs)
        gdf = reprojected_blocks[crs_key]

        shapes = []
        for block, row in gdf.iterrows():
            key = (block, date_str)
            if key not in diff_lookup:
                stats["block_not_in_json"] += 1
                continue
            val = diff_lookup[key]
            if val is None:
                stats["block_null_diff"] += 1
                continue
            shapes.append((row.geometry, float(val)))

        if not shapes:
            stats["no_diff_day"] += 1
            continue

        diff_arr = rasterize(shapes, out_shape=shape, transform=transform,
                             fill=NODATA, dtype="float64")
        diff = np.ma.masked_equal(diff_arr, NODATA)

        # ---------- correction = Ks_diff * ETo * Kc ----------
        correction = diff * eto * kc   # masks combine automatically

        profile.update(dtype="float32", count=1, nodata=NODATA, compress="lzw")
        out_path = os.path.join(OUTPUT_DIR, f"correction_{date_str}.tif")
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(correction.filled(NODATA).astype("float32"), 1)
        stats["written"] += 1

        if i % 50 == 0:
            print(f"  ...{i}/{len(eto_index)} days processed")

    print("\n" + "=" * 55)
    print("CORRECTION REPORT")
    print("=" * 55)
    print(f"ETo days found:                      {stats['days']}")
    print(f"correction tifs written:             {stats['written']}")
    print(f"Days skipped - no Kc rasters at all: {stats['no_kc']}")
    print(f"Days where nearest Kc was >{KC_WARN_DAYS}d away: {stats['kc_far']}")
    print(f"Days skipped - no block had Ks_diff: {stats['no_diff_day']}")
    print(f"Block-days with null Ks_diff:        {stats['block_null_diff']}")
    print(f"Block-days missing from JSON:        {stats['block_not_in_json']}")
    print(f"\nOutputs in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()