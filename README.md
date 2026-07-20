Water Chommie!

Project Overview

Water Chommie is a decision-support dashboard for Tokara vineyard, built to help a farm manager see which blocks need irrigation and by how much. 
It has three main views. 
The Home view is a full vineyard map, colour-coded by whichever metric you pick (ET, Irrigation Net, NDVI, NDWI, Irrigation Volume), plus toggleable satellite imagery and irrigation-need overlays. All colours shown for visulisation are colourblind proofed. 
The Fields view lets you drill into a single block's water, weather and canopy-health data, in both daily and weekly views, with a date slider and trend chart. 
The Irrigation Planner shows every block ranked by irrigation priority, with a map, priority breakdown chart, and an AI chat assistant (Gemini) you can ask about any block.

Regarding the architecture, a static React frontend (Create React App plus Leaflet for maps) does almost all the work client-side, reading vineyard data from bundled static JSON, CSV, and GeoJSON files. There is no database. A small optional Flask backend exists purely for two extras: the Gemini-powered chat advisor (which keeps the API key off the client) and a raster-upload proof-of-concept. If the backend is down, the rest of the dashboard still works fine. The frontend is in the irrigation-dashboard folder and is deployed to GitHub Pages, while the backend is in the backend folder and is deployed to Render.

Environment Variables

For the frontend environment variables (located in irrigation-dashboard/.env), you will use REACT_APP_ADVISOR_API_URL. The purpose of this variable is to provide the URL of the Flask backend, used by the Gemini chat and the Upload Data popup. An example for live use is your deployed Render URL, such as [https://viticulture-q19m.onrender.com](https://viticulture-q19m.onrender.com). For local-only testing, you would use http://localhost:5000. Be aware that React bakes these variables in at build time. For the live site, set this before running the deploy command; editing the .env file afterwards has no effect until you deploy again.

For the backend environment variables (located in backend/.env), you will use GEMINI_KEY. The purpose of this variable is to hold your Google Gemini API key, which powers the chat advisor. Without it, the chat endpoint returns a 503 error but everything else still runs. For the live backend, this is set on Render's dashboard under the Environment tab for the irriguide-advisor service. You only need a local copy of this file if you are running the backend on your own machine for testing.

Setup and Start Instructions

The app is already live, meaning you do not need to run anything locally to use it. Just open https://tommee-arch.github.io/Viticulture/ in a browser. That is it. This goes for anyone viewing it on a phone, iPad, laptop, or whatever device. Nobody needs Node, Python, or any command at all just to use the dashboard. Everything below is only for you, the developer, if you want to either test a change on your own machine before publishing it, or publish a change so the live site updates.

To publish a frontend change, which is the part that actually matters day-to-day, change your directory to irrigation-dashboard. Run "npm install", which is only needed once or after pulling dependency changes. Then run "npm run deploy", which builds the app and publishes it to the live GitHub Pages URL above. That single command is all it takes to get a change live; no separate start step is needed for that.

To publish a backend change, note that the backend is set up to auto-deploy on Render whenever the deploy branch on GitHub updates. Simply run "git push origin main:deploy" (or whatever branch you committed to, pushed onto the deploy branch). Render picks up the push, builds, and redeploys automatically, leaving nothing to run on your machine.

Running it locally is entirely optional and meant for development or testing only. Nobody needs this to use the app; it is only useful if you want to try out a change yourself before publishing it. For the frontend, change your directory to irrigation-dashboard and run "npm install". Next, copy the .env.example file to a new .env file and set your REACT_APP_ADVISOR_API_URL (for example, use http://localhost:5000 if also running the backend locally, or use the live Render URL). Finally, run "npm start", which opens a local-only copy at
