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
irrigation readings, required irrigation volumes). Re-copy those three files
here if the source data is ever regenerated.
