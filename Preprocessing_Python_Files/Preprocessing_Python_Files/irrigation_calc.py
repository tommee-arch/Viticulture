r"""
STAGE 1: build daily irrigation_net rasters.

    irrigation_net(pixel) = ETtarget(day, pixel)
                            - Precip_mm(block of pixel, day)
                            + correction(day, pixel)

  - ETtarget:   daily rasters from make_ettarget.py  ({date} in filename)
  - correction: daily rasters from make_correction.py ({date} in filename)
  - Precip_mm:  one value per block per day, read from the JSON, painted onto
                the block polygons (shapefile).

Restricted to the block polygons. One output tif per day ->
OUTPUT_DIR (irrigation_net_YYYY-MM-DD.tif). A day is written only when BOTH an
ETtarget and a correction raster exist for it.

STAGE 2 lives in add_irrigation_net.py (means back into the JSON).

Requires: pandas, numpy, geopandas, rasterio
"""

import json
import os
import re
from datetime import datetime

import numpy as np

# ----------------------------- CONFIG ---------------------------------------
ETTARGET_DIR   = r"D:\Hackathon\Hackathon\Output\ETtarget"
CORRECTION_DIR = r"D:\Hackathon\Hackathon\Output\Correction"
OUTPUT_DIR     = r"D:\Hackathon\Hackathon\Output\Irrigation_net"

INPUT_JSON = r"D:\Hackathon\Hackathon\Output\Final\Full_final_ksdiff.json"

SHAPEFILE_PATH        = r"D:\Hackathon\Hackathon\Shapefiles\Tokara_Polygons.shp"
SHAPEFILE_BLOCK_FIELD = "BLOCK"

PRECIP_FIELD = "Precip_mm"
NODATA = -9999.0
BAND   = 1
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


def index_dir(folder, label):
    """{ 'YYYY-MM-DD': path } for dated tifs in a flat folder."""
    if not os.path.isdir(folder):
        raise SystemExit(f"ERROR: {label} folder not found: {folder}")
    out = {}
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith((".tif", ".tiff")):
            continue
        ds = extract_date_str(name)
        if ds is None:
            print(f"  WARNING: no date in {label} filename: {name}")
        elif ds not in out:
            out[ds] = os.path.join(folder, name)
    if not out:
        raise SystemExit(f"ERROR: no dated tifs in {label} folder: {folder}")
    keys = sorted(out)
    print(f"{label}: {len(out)} rasters ({keys[0]} to {keys[-1]}).")
    return out


def load_precip_lookup():
    """{(BLOCK_ID, 'YYYY-MM-DD'): precip_mm or None} from the JSON."""
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    records = data if isinstance(data, list) else next(
        v for v in data.values() if isinstance(v, list))
    if records and PRECIP_FIELD not in records[0]:
        raise SystemExit(f"ERROR: '{PRECIP_FIELD}' not in {INPUT_JSON}.")

    lookup = {}
    for rec in records:
        block = str(rec.get("Block_ID", "")).strip().upper()
        date = str(rec.get("Date", "")).strip()
        key = (block, date)
        val = rec.get(PRECIP_FIELD)
        # prefer a non-null value if duplicate records disagree
        if key not in lookup or (lookup[key] is None and val is not None):
            lookup[key] = val
    print(f"Precip lookup: {len(lookup)} block/date entries "
          f"from {len(records)} records.")
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


def read_aligned(path, band, ref_transform, ref_crs, ref_shape):
    """Read a raster band, reprojecting onto the reference grid if needed."""
    import rasterio
    from rasterio.warp import reproject, Resampling
    with rasterio.open(path) as src:
        if (src.crs == ref_crs and src.transform == ref_transform
                and (src.height, src.width) == ref_shape):
            return np.ma.masked_invalid(src.read(band, masked=True)
                                        .astype("float64"))
        dst = np.full(ref_shape, NODATA, dtype="float64")
        reproject(
            source=rasterio.band(src, band), destination=dst,
            src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
            dst_transform=ref_transform, dst_crs=ref_crs, dst_nodata=NODATA,
            resampling=Resampling.bilinear,
        )
        return np.ma.masked_invalid(np.ma.masked_equal(dst, NODATA))


def main():
    import rasterio
    from rasterio.features import rasterize

    ettarget = index_dir(ETTARGET_DIR, "ETtarget")
    correction = index_dir(CORRECTION_DIR, "correction")
    precip = load_precip_lookup()
    blocks = load_block_geometries()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    common = sorted(set(ettarget) & set(correction))
    print(f"Days with BOTH ETtarget and correction: {len(common)}")

    reprojected = {}
    stats = {"days": 0, "written": 0,
             "block_null_precip": 0, "block_not_in_json": 0}

    for i, ds in enumerate(common, 1):
        stats["days"] += 1

        with rasterio.open(ettarget[ds]) as src:
            et = np.ma.masked_invalid(src.read(BAND, masked=True).astype("float64"))
            transform, crs, shape = src.transform, src.crs, (src.height, src.width)
            profile = src.profile

        corr = read_aligned(correction[ds], BAND, transform, crs, shape)

        # ---- precip painted onto blocks; missing/null precip = 0 (no rain
        #      subtracted) so the block still gets its full ETtarget ----
        crs_key = str(crs)
        if crs_key not in reprojected:
            reprojected[crs_key] = blocks.to_crs(crs)
        gdf = reprojected[crs_key]

        shapes = []
        for block, row in gdf.iterrows():
            key = (block, ds)
            if key not in precip:
                stats["block_not_in_json"] += 1
                val = None
            else:
                val = precip[key]
                if val is None:
                    stats["block_null_precip"] += 1
            shapes.append((row.geometry, float(val) if val is not None else 0.0))

        # Paint precip over ALL blocks (fill 0 outside blocks); pixels with no
        # block stay 0 but are masked back out by ETtarget's own mask below.
        precip_r = rasterize(shapes, out_shape=shape, transform=transform,
                             fill=0.0, dtype="float64")

        # Missing correction pixels -> 0 (add nothing), so a block with no
        # correction data still yields ETtarget - Precip.
        corr_filled = corr.filled(0.0)

        # ---- irrigation_net = ETtarget - Precip + correction ----
        # Base is ETtarget; precip and correction default to 0 where absent,
        # so no block is dropped for missing rain/correction. The result keeps
        # ETtarget's mask, so pixels outside the blocks remain nodata.
        irrigation_net = et - precip_r + corr_filled
        irrigation_net = np.ma.masked_array(
            irrigation_net, mask=np.ma.getmaskarray(et))

        profile.update(dtype="float32", count=1, nodata=NODATA, compress="lzw")
        out_path = os.path.join(OUTPUT_DIR, f"irrigation_net_{ds}.tif")
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(irrigation_net.filled(NODATA).astype("float32"), 1)
        stats["written"] += 1

        if i % 50 == 0:
            print(f"  ...{i}/{len(common)} days processed")

    print("\n" + "=" * 55)
    print("irrigation_net RASTER REPORT")
    print("=" * 55)
    print(f"Days with both inputs:               {stats['days']}")
    print(f"irrigation_net tifs written:         {stats['written']}")
    print(f"Block-days: precip missing -> used 0: {stats['block_not_in_json']}")
    print(f"Block-days: precip null    -> used 0: {stats['block_null_precip']}")
    print("(Blocks are no longer dropped for missing precip/correction; they")
    print(" fall back to the ETtarget value. A block only stays absent if the")
    print(" ETtarget raster itself has no data there, e.g. pre-budbreak days")
    print(" when ETtarget was built with DEFAULT_KS=None.)")
    print(f"\nOutputs in: {OUTPUT_DIR}")
    print("Next: run add_irrigation_net.py to add the per-block means to the JSON.")


if __name__ == "__main__":
    main()