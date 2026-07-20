# IRRIGUIDE Advisor API

Small Flask API that answers irrigation questions for a vineyard block using
Gemini, grounded in this project's real data - the same latest-record-per-
block data and PWDI/priority calculation as the frontend's Irrigation
Planner table (see `block_context.py`), plus a live Open-Meteo forecast.
`GEMINI_KEY` lives only here, never in the React frontend.

## Endpoints

- `POST /api/ask` - body `{ "block_id": "K11", "question": "...", "history": [...] }`,
  returns `{ "answer": "...", "context": {...} }`. `history` is the frontend's
  chat log, `[{ "sender": "user" | "gemini", "text": "..." }, ...]`.
- `GET /api/health` - `{ "status": "ok", "gemini_configured": true|false }`.
- `GET /api/daily-statistics` - the live `Daily_Statistics.json` (per-block,
  per-day ETa/Net Deficit/Net Irrigation/NDVI/NDWI/Growth Stage/Season).
  Frontend falls back to its bundled static copy if this is unreachable.
- `POST /api/upload-daily-data` - multipart form:
  - `date` (YYYY-MM-DD) - required.
  - `mode` - `calculate` to preview without saving, or `upload` to persist.
  - `precip_mm`, `ks` - plain form fields (not files), single values applied
    to every block in this upload (not per-block).
  - Files, all optional: `ETa`, `ETo`, `Kc`, `NDVI` - single-band GeoTIFF
    rasters of already-computed values, reduced to a per-block mean via
    zonal statistics against `data/Tokara_Study_Area.json`. `Sentinel
    imagery` - a raw **4-band** GeoTIFF, assumed band order `[B4, B3, B2,
    B8]` (Red, Green, Blue, NIR); the backend computes
    `NDWI = (B3 - B8) / (B3 + B8)` per pixel and zonal-averages that.

  Per block, the backend computes and saves:
  - `Net_Irrigation_mm = ETa_mm - Precip_mm`, `Net_Deficit_mm = max(that, 0)`
  - `Pheno_Net_mm = (ETa_mm - Precip_mm) x Ks`
  - `Litres = Pheno_Net_mm x Area_m2`, `Volume_m3 = Litres / 1000`
    (`Area_m2` looked up from the block's existing rows, not recomputed
    from geometry)
  - `Growth_Stage`/`Season`/`Cultivar` the same way the rest of the app
    derives them (phenology CSV + the July-cutover season convention)

  **Band-order caveat**: no real Sentinel-2 file was available to confirm
  `[B4, B3, B2, B8]` against - if `Mean_NDWI` looks implausible (outside
  [-1, 1], or suspiciously uniform), check the actual band order first.
  **General caveat**: the raster/zonal-statistics path is verified against
  synthetic test rasters with known values (confirmed the NDWI formula,
  and the full `ETa -> Net_Irrigation_mm -> Pheno_Net_mm -> Volume_m3` chain,
  produce exactly the expected numbers) - but not against a real product.
  If a real upload comes back all-null, check CRS/nodata first.
  **Persistence caveat**: on a host with an ephemeral filesystem (e.g.
  Render's free tier), `mode: upload` updates the in-memory copy for the
  life of that process but does NOT survive a restart/redeploy - fine for a
  demo, but a real deployment needs a database or object storage here.

## Run locally

Requires Python 3.10+.

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env           # then paste your real key into .env
python app.py                  # serves on http://localhost:5000
```

Point the frontend at it by setting `REACT_APP_ADVISOR_API_URL=http://localhost:5000`
in `irrigation-dashboard/.env` (see that project's `.env.example`).

## Deploy (Render)

1. This repo is on GitHub at `tommee-arch/Viticulture`. Use the **`deploy`**
   branch, not `main` - `main` on GitHub is an old, unrelated flat-layout
   copy of the project with no common history with this one; `deploy` has
   everything (frontend under `irrigation-dashboard/`, backend here).
2. In Render: New -> Blueprint, point it at the repo/branch (`render.yaml` in
   this folder configures the service), or New -> Web Service with:
   - Branch: `deploy`
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app`
3. Set the `GEMINI_KEY` environment variable in Render's dashboard - never
   commit it.
4. Once deployed, add the Render URL to `ALLOWED_ORIGINS` in `app.py` if
   your frontend's origin isn't already `localhost:3000` or the GitHub
   Pages URL already listed there.
5. Set `REACT_APP_ADVISOR_API_URL` to the deployed URL before building/
   deploying the frontend - Create React App bakes `REACT_APP_*` vars in at
   build time, so this has to be set before `npm run build` / `npm run deploy`.

Railway and Fly.io work the same way (Python buildpack + `Procfile`).

## Data

`data/` is a static copy of the datasets the frontend reads from
`irrigation-dashboard/public/data/` (vineyard block metadata, weekly
irrigation readings, required irrigation volumes, block boundaries,
phenology dates, per-cultivar Ks/hydrology values, and the daily statistics
dataset). Re-copy the relevant file(s) here if the source data is ever
regenerated - except `Daily_Statistics.json`, which this backend now owns
and mutates via `/api/upload-daily-data`; don't overwrite the backend's copy
with the frontend's static one without checking which has newer uploads.

`block_context.py` (used by `/api/ask`) reads its own snapshot of
`Daily_Statistics.json` at process start to compute each block's PWDI/
priority/volume - if an upload lands while the process is already running,
the advisor won't see it until the process restarts (same restart caveat as
above).

## Geospatial dependencies

`geopandas`/`rasterio`/`rasterstats`/`shapely` (for the upload endpoint's
zonal statistics) pull in native GDAL bindings - confirmed installing and
importing cleanly on Python 3.10/Windows during development, but native
deps like these can behave differently on Render's Linux build image. If
the Render build fails on these, that's the first thing to check.
