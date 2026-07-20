r"""
For every Ks_current_YYYY-MM-DD.tif:
  1. Compute the MEAN Ks_current inside each block (using the shapefile).
Then, back in the final JSON, for every record (matched by Block_ID + Date):
  2. Add   Ks_current_mean  = that block/day mean.
  3. Add   Ks_diff          = Ks (managerial, from the record) - Ks_current_mean.

Records with no matching raster/block, or a null managerial Ks, get null in the
new fields. Matching is exact on (Block_ID, Date), so records line up.

Requires: pandas, numpy, geopandas, rasterio
"""

import json
import os
import re
from datetime import datetime

import numpy as np

# ----------------------------- CONFIG ---------------------------------------
KS_CURRENT_DIR = r"D:\Hackathon\Hackathon\Output\Ks_current"

INPUT_JSON  = r"D:\Hackathon\Hackathon\Final_Json\Daily_Statistics.json"
OUTPUT_JSON = r"D:\Hackathon\Hackathon\Output\Final\Full_final_ksdiff.json"

SHAPEFILE_PATH        = r"D:\Hackathon\Hackathon\Shapefiles\Tokara_Polygons.shp"
SHAPEFILE_BLOCK_FIELD = "BLOCK"

KS_BAND = 1
ROUND_TO = 4          # decimal places for the new fields
# -----------------------------------------------------------------------------

DATE_PATTERN = re.compile(r"(\d{4})[-_\.]?(\d{2})[-_\.]?(\d{2})")


def extract_date_str(text):
    """Return 'YYYY-MM-DD' parsed from a filename, or None."""
    for m in DATE_PATTERN.finditer(text):
        y, mo, d = m.groups()
        try:
            return datetime(int(y), int(mo), int(d)).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def list_ks_current_tifs():
    """Return sorted list of (date_str, path) for the Ks_current rasters."""
    if not os.path.isdir(KS_CURRENT_DIR):
        raise SystemExit(f"ERROR: Ks_current folder not found: {KS_CURRENT_DIR}")
    out = []
    for name in sorted(os.listdir(KS_CURRENT_DIR)):
        if not name.lower().endswith((".tif", ".tiff")):
            continue
        date_str = extract_date_str(name)
        if date_str is None:
            print(f"  WARNING: no date in filename, skipped: {name}")
            continue
        out.append((date_str, os.path.join(KS_CURRENT_DIR, name)))
    if not out:
        raise SystemExit(f"ERROR: no dated .tif files in {KS_CURRENT_DIR}")
    print(f"Found {len(out)} Ks_current rasters "
          f"({out[0][0]} to {out[-1][0]}).")
    return out


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


def compute_block_means(tifs, blocks):
    """Return {(BLOCK_ID, 'YYYY-MM-DD'): mean_ks_current}."""
    import rasterio
    import rasterio.mask
    from shapely.geometry import box

    means = {}
    reprojected = {}   # crs string -> gdf in that crs
    tile_ok = 0

    for i, (date_str, path) in enumerate(tifs, 1):
        with rasterio.open(path) as src:
            crs_key = str(src.crs)
            if crs_key not in reprojected:
                reprojected[crs_key] = blocks.to_crs(src.crs)
            gdf = reprojected[crs_key]
            raster_bounds = box(*src.bounds)
            nodata = src.nodata

            for block, row in gdf.iterrows():
                geom = row.geometry
                if geom.is_empty or not geom.intersects(raster_bounds):
                    continue
                try:
                    data, _ = rasterio.mask.mask(
                        src, [geom], crop=True, filled=False, indexes=KS_BAND)
                except ValueError:
                    continue  # block doesn't overlap this raster
                arr = np.ma.masked_invalid(data.astype("float64"))
                if nodata is not None:
                    arr = np.ma.masked_equal(arr, nodata)
                if arr.count():
                    means[(block, date_str)] = round(float(arr.mean()), ROUND_TO)
                    tile_ok += 1

        if i % 50 == 0:
            print(f"  ...{i}/{len(tifs)} rasters processed")

    print(f"Computed {len(means)} block/day means "
          f"({tile_ok} block-raster overlaps).")
    return means


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data, data
    for value in data.values():
        if isinstance(value, list):
            return data, value
    raise ValueError("JSON does not contain a list of records.")


def main():
    tifs = list_ks_current_tifs()
    blocks = load_block_geometries()
    means = compute_block_means(tifs, blocks)

    root, records = load_json(INPUT_JSON)

    stats = {"total": 0, "mean_added": 0, "diff_added": 0,
             "no_mean": 0, "null_ks": 0}

    for rec in records:
        stats["total"] += 1
        block = str(rec.get("Block_ID", "")).strip().upper()
        date_str = str(rec.get("Date", "")).strip()

        mean_ks = means.get((block, date_str))
        rec["Ks_current_mean"] = mean_ks
        if mean_ks is None:
            stats["no_mean"] += 1

        managerial_ks = rec.get("Ks")
        if managerial_ks is None:
            stats["null_ks"] += 1

        if mean_ks is not None and managerial_ks is not None:
            rec["Ks_diff"] = round(float(managerial_ks) - mean_ks, ROUND_TO)
            stats["diff_added"] += 1
        else:
            rec["Ks_diff"] = None

        if mean_ks is not None:
            stats["mean_added"] += 1

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(root, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 55)
    print("Ks_diff REPORT")
    print("=" * 55)
    print(f"Total records:                       {stats['total']}")
    print(f"Records given Ks_current_mean:       {stats['mean_added']}")
    print(f"Records given Ks_diff:               {stats['diff_added']}")
    print(f"Records with no raster mean:         {stats['no_mean']}")
    print(f"Records with null managerial Ks:     {stats['null_ks']}")
    print(f"\nSaved: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()