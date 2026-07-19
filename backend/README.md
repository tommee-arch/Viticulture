# IRRIGUIDE Advisor API

Small Flask API that answers irrigation questions for a vineyard block using
Gemini, grounded in this project's real data (weekly ETa/deficit, required
irrigation volume, growth stage from the CSV's Budbreak/Flowering dates, and
a live Open-Meteo forecast). `GEMINI_KEY` lives only here, never in the React
frontend.

## Endpoints

- `POST /api/ask` - body `{ "block_id": "K11", "question": "...", "history": [...] }`,
  returns `{ "answer": "...", "context": {...} }`. `history` is the frontend's
  chat log, `[{ "sender": "user" | "gemini", "text": "..." }, ...]`.
- `GET /api/health` - `{ "status": "ok", "gemini_configured": true|false }`.
- `GET /api/daily-statistics` - the live `Daily_Statistics.json` (per-block,
  per-day ETa/Net Deficit/Net Irrigation/NDVI/NDWI/Growth Stage/Season).
  Frontend falls back to its bundled static copy if this is unreachable.
- `POST /api/upload-daily-data` - multipart form: `date` (YYYY-MM-DD),
  `mode` (`calculate` to preview without saving, or `upload` to persist),
  and up to 5 files keyed `ETa`, `ETo`, `Kc`, `NDVI` (single-band GeoTIFF
  rasters - reduced to a per-block mean via zonal statistics against
  `data/Tokara_Study_Area.json`) and `Sentinel imagery` (a CSV of
  already-computed per-block NDVI/NDWI, columns like `Block_ID`/`Mean_NDVI`/
  `Mean_NDWI`). Precipitation (needed to derive `Net_Irrigation_mm` /
  `Net_Deficit_mm` - none of the 5 uploads carry it) comes from the same
  Open-Meteo historical archive the frontend's weather widget uses, fetched
  once per upload for the vineyard's centroid.
  **Caveat**: built and tested against a synthetic raster (no real
  ETa/NDVI/Sentinel-2 sample file was available) - the zonal-statistics
  and CRS-reprojection logic works correctly in that test, but hasn't been
  verified against a real product. If real uploads come back all-null,
  check the raster's CRS/nodata value first.
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
phenology dates, and the daily statistics dataset). Re-copy the relevant
file(s) here if the source data is ever regenerated - except
`Daily_Statistics.json`, which this backend now owns and mutates via
`/api/upload-daily-data`; don't overwrite the backend's copy with the
frontend's static one without checking which has newer uploads.

## Geospatial dependencies

`geopandas`/`rasterio`/`rasterstats`/`shapely` (for the upload endpoint's
zonal statistics) pull in native GDAL bindings - confirmed installing and
importing cleanly on Python 3.10/Windows during development, but native
deps like these can behave differently on Render's Linux build image. If
the Render build fails on these, that's the first thing to check.
