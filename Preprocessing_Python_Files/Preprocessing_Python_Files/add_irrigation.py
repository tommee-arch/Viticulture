r"""
STAGE 2: reduce the daily irrigation_net rasters to a per-block-per-day mean
and add it to the matching JSON record as "Irrigation_net".

For every irrigation_net_YYYY-MM-DD.tif:
  - compute the MEAN inside each block (shapefile).
Then, in the JSON, match on (Block_ID, Date) and set:
  - Irrigation_net = that block/day mean (null where no raster/overlap).

Requires: pandas, numpy, geopandas, rasterio, shapely
"""

import json
import os
import re
from datetime import datetime

import numpy as np

# ----------------------------- CONFIG ---------------------------------------
IRRIGATION_NET_DIR = r"D:\Hackathon\Hackathon\Output\Irrigation_net"

INPUT_JSON  = r"D:\Hackathon\Hackathon\Output\Final\Full_final_ksdiff.json"
OUTPUT_JSON = r"D:\Hackathon\Hackathon\Output\Final\Full_final_irrigation.json"

SHAPEFILE_PATH        = r"D:\Hackathon\Hackathon\Shapefiles\Tokara_Polygons.shp"
SHAPEFILE_BLOCK_FIELD = "BLOCK"

OUTPUT_FIELD = "Irrigation_net"
BAND = 1
ROUND_TO = 4
# -----------------------------------------------------------------------------

DATE_PATTERN = re.compile(r"(\d{4})[-_\.]?(\d{2})[-_\.]?(\d{2})")


def extract_date_str(text):
    for m in DATE_PATTERN.finditer(text):
        y, mo, d = m.groups()
        try:
            return datetime(int(y), int(mo), int(d)).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def list_tifs():
    if not os.path.isdir(IRRIGATION_NET_DIR):
        raise SystemExit(f"ERROR: folder not found: {IRRIGATION_NET_DIR}")
    out = []
    for name in sorted(os.listdir(IRRIGATION_NET_DIR)):
        if not name.lower().endswith((".tif", ".tiff")):
            continue
        ds = extract_date_str(name)
        if ds is None:
            print(f"  WARNING: no date in filename, skipped: {name}")
            continue
        out.append((ds, os.path.join(IRRIGATION_NET_DIR, name)))
    if not out:
        raise SystemExit(f"ERROR: no dated tifs in {IRRIGATION_NET_DIR}")
    print(f"Found {len(out)} irrigation_net rasters "
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
    """{(BLOCK_ID, 'YYYY-MM-DD'): mean}."""
    import rasterio
    import rasterio.mask
    from shapely.geometry import box

    means = {}
    reprojected = {}
    for i, (ds, path) in enumerate(tifs, 1):
        with rasterio.open(path) as src:
            crs_key = str(src.crs)
            if crs_key not in reprojected:
                reprojected[crs_key] = blocks.to_crs(src.crs)
            gdf = reprojected[crs_key]
            rbounds = box(*src.bounds)
            nodata = src.nodata
            for block, row in gdf.iterrows():
                geom = row.geometry
                if geom.is_empty or not geom.intersects(rbounds):
                    continue
                try:
                    data, _ = rasterio.mask.mask(
                        src, [geom], crop=True, filled=False, indexes=BAND)
                except ValueError:
                    continue
                arr = np.ma.masked_invalid(data.astype("float64"))
                if nodata is not None:
                    arr = np.ma.masked_equal(arr, nodata)
                if arr.count():
                    means[(block, ds)] = round(float(arr.mean()), ROUND_TO)
        if i % 50 == 0:
            print(f"  ...{i}/{len(tifs)} rasters processed")
    print(f"Computed {len(means)} block/day means.")
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
    tifs = list_tifs()
    blocks = load_block_geometries()
    means = compute_block_means(tifs, blocks)

    root, records = load_json(INPUT_JSON)
    stats = {"total": 0, "added": 0, "no_mean": 0}

    for rec in records:
        stats["total"] += 1
        block = str(rec.get("Block_ID", "")).strip().upper()
        ds = str(rec.get("Date", "")).strip()
        val = means.get((block, ds))
        rec[OUTPUT_FIELD] = val
        if val is None:
            stats["no_mean"] += 1
        else:
            stats["added"] += 1

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(root, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 55)
    print("Irrigation_net JSON REPORT")
    print("=" * 55)
    print(f"Total records:                       {stats['total']}")
    print(f"Records given {OUTPUT_FIELD}:      {stats['added']}")
    print(f"Records with no raster mean:         {stats['no_mean']}")
    print(f"\nSaved: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()