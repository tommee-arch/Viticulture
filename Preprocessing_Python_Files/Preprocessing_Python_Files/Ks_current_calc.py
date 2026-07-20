r"""
Create daily Ks_current rasters:

    Ks_current(pixel) = ETa(day, pixel) / ( ETo(day, pixel) * Kc(week, pixel) )

  - ETa: DAILY rasters in {BASE_DIR}\{season}\{ETA_SUBPATH}   (date in filename)
  - ETo: DAILY rasters in {BASE_DIR}\{season}\{ETO_SUBPATH}   (date in filename)
  - Kc:  WEEKLY rasters in {BASE_DIR}\{season}\{KC_SUBPATH};   each day uses the
         Kc raster CLOSEST in time (before or after), same logic as before.

Computed per pixel, restricted to the block polygons (shapefile). Pixels
outside the blocks are nodata; so are pixels where ETo*Kc <= 0 (undefined).
One output tif per day -> OUTPUT_DIR (Ks_current_YYYY-MM-DD.tif).

Requires: pandas, numpy, geopandas, rasterio, shapely
"""

import os
import re
from datetime import datetime

import numpy as np

# ----------------------------- CONFIG ---------------------------------------
OUTPUT_DIR = r"D:\Hackathon\Hackathon\Output\Ks_current"

BASE_DIR       = r"D:\Hackathon\Hackathon"
SEASON_FOLDERS = ["2022_2023", "2023_2024", "2024_2025"]
ETA_SUBPATH    = os.path.join("ETa", "10m")   # -> {season}\ETa\10m\*.tif
ETO_SUBPATH    = os.path.join("ETo", "10m")   # -> {season}\ETo\10m\*.tif
KC_SUBPATH     = os.path.join("Kc", "10m")    # -> {season}\Kc\10m\*.tif

SHAPEFILE_PATH        = r"D:\Hackathon\Hackathon\Shapefiles\Tokara_Polygons.shp"
SHAPEFILE_BLOCK_FIELD = "BLOCK"

# Kc matching: each day uses the Kc raster CLOSEST in time (before or after),
# no cap, so no day is left without one. Warn if the nearest is this far away.
KC_WARN_DAYS = 14

# Optionally clip Ks_current into a sensible range (crop stress coefficient is
# 0..1 in theory; values >1 happen when ETa exceeds ETo*Kc). Set to None to
# keep raw values, or e.g. (0.0, 1.0) to clip, or (0.0, 1.2) to allow slack.
CLIP_RANGE = None

ETA_BAND = 1
ETO_BAND = 1
KC_BAND  = 1
NODATA   = -9999.0
# -----------------------------------------------------------------------------


# ------------------------- date indexing -------------------------------------
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
    Returns {date: path}. Duplicate dates keep the first file found."""
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
                          f"({name} ignored)")
                else:
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
    """Kc raster closest in time to the day (before or after). kc_sorted is a
    list of (date, path) sorted by date. Returns (date, path) or None."""
    if not kc_sorted:
        return None
    return min(kc_sorted, key=lambda entry: abs((entry[0] - record_date).days))


# --------------------------- block geometries --------------------------------
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


# ----------------------------------- main ------------------------------------
def main():
    import rasterio
    from rasterio.features import geometry_mask
    from rasterio.warp import reproject, Resampling

    print("Indexing ETa rasters:")
    eta_index = build_index(ETA_SUBPATH, "ETa")
    print("Indexing ETo rasters:")
    eto_index = build_index(ETO_SUBPATH, "ETo")
    print("Indexing Kc rasters:")
    kc_index = build_index(KC_SUBPATH, "Kc")

    if not eta_index or not eto_index or not kc_index:
        raise SystemExit(
            "\nERROR: one or more raster sets are empty - check the paths above.\n"
            "Fix BASE_DIR / SEASON_FOLDERS / ETA_SUBPATH / ETO_SUBPATH / "
            "KC_SUBPATH in CONFIG."
        )

    kc_sorted = sorted(kc_index.items())
    blocks = load_block_geometries()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    reprojected_blocks = {}   # crs string -> gdf in that CRS
    kc_cache = {}             # (kc_path, crs, transform, shape) -> masked Kc array

    stats = {"days": 0, "written": 0, "no_eto": 0, "no_kc": 0, "kc_far": 0}

    for i, date in enumerate(sorted(eta_index), 1):
        stats["days"] += 1
        date_str = date.strftime("%Y-%m-%d")
        eta_path = eta_index[date]

        # ETo for the SAME day
        if date not in eto_index:
            stats["no_eto"] += 1
            print(f"  {date_str}: no matching ETo raster - skipped")
            continue
        eto_path = eto_index[date]

        # Kc closest in time
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

        # ---------- read ETa (defines the output grid) ----------
        with rasterio.open(eta_path) as src:
            eta = src.read(ETA_BAND, masked=True).astype("float64")
            eta = np.ma.masked_invalid(eta)
            transform, crs, shape = src.transform, src.crs, (src.height, src.width)
            profile = src.profile

        # ---------- read ETo onto the same grid ----------
        with rasterio.open(eto_path) as src:
            if (src.crs == crs and src.transform == transform
                    and (src.height, src.width) == shape):
                eto = np.ma.masked_invalid(src.read(ETO_BAND, masked=True)
                                           .astype("float64"))
            else:
                dst = np.full(shape, NODATA, dtype="float64")
                reproject(
                    source=rasterio.band(src, ETO_BAND), destination=dst,
                    src_transform=src.transform, src_crs=src.crs,
                    src_nodata=src.nodata, dst_transform=transform, dst_crs=crs,
                    dst_nodata=NODATA, resampling=Resampling.bilinear,
                )
                eto = np.ma.masked_invalid(np.ma.masked_equal(dst, NODATA))

        # ---------- Kc onto the same grid (cached per Kc file/grid) ----------
        grid_key = (kc_path, str(crs), tuple(transform)[:6], shape)
        if grid_key not in kc_cache:
            with rasterio.open(kc_path) as kc_src:
                if (kc_src.crs == crs and kc_src.transform == transform
                        and (kc_src.height, kc_src.width) == shape):
                    kc_arr = kc_src.read(KC_BAND, masked=True).astype("float64")
                    kc_cache[grid_key] = np.ma.masked_invalid(kc_arr)
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

        # ---------- block mask (cached per CRS) ----------
        crs_key = str(crs)
        if crs_key not in reprojected_blocks:
            gdf = blocks.to_crs(crs)
            inside = ~geometry_mask(gdf.geometry, out_shape=shape,
                                    transform=transform, invert=False)
            reprojected_blocks[crs_key] = inside
        inside = reprojected_blocks[crs_key]

        # ---------- Ks_current = ETa / (ETo * Kc) ----------
        denom = eto * kc
        denom = np.ma.masked_where(denom <= 0, denom)   # avoid /0 and negatives
        ks_current = eta / denom                        # masks propagate

        # restrict to blocks
        ks_current = np.ma.masked_array(
            ks_current, mask=np.ma.getmaskarray(ks_current) | ~inside)

        if CLIP_RANGE is not None:
            ks_current = np.ma.clip(ks_current, CLIP_RANGE[0], CLIP_RANGE[1])

        # ---------- write ----------
        profile.update(dtype="float32", count=1, nodata=NODATA, compress="lzw")
        out_path = os.path.join(OUTPUT_DIR, f"Ks_current_{date_str}.tif")
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(ks_current.filled(NODATA).astype("float32"), 1)
        stats["written"] += 1

        if i % 50 == 0:
            print(f"  ...{i}/{len(eta_index)} days processed")

    print("\n" + "=" * 55)
    print("Ks_current REPORT")
    print("=" * 55)
    print(f"ETa days found:                      {stats['days']}")
    print(f"Ks_current tifs written:             {stats['written']}")
    print(f"Days skipped - no matching ETo:      {stats['no_eto']}")
    print(f"Days skipped - no Kc rasters at all: {stats['no_kc']}")
    print(f"Days where nearest Kc was >{KC_WARN_DAYS}d away: {stats['kc_far']}")
    print(f"\nOutputs in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()