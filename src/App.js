import React, { useState, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import NowScreen from './NowScreen';
import MapTab from './components/MapTab'; // Assuming you have a full-screen map component
import IrrigationPlanner from './Irrigation_Planner';
import './App.css';

// Same Flask backend as the Gemini advisor and the data-upload popup.
const ADVISOR_API_URL = process.env.REACT_APP_ADVISOR_API_URL || 'http://localhost:5000';

export default function App() {
  const [activeTab, setActiveTab] = useState('Fields');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fieldsData, setFieldsData] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [studyAreaGeojson, setStudyAreaGeojson] = useState(null);
  const [dailyIrrigation, setDailyIrrigation] = useState([]);
  const [weeklyIrrigation, setWeeklyIrrigation] = useState([]);
  const [ndviStats, setNdviStats] = useState(null);
  const [ndwiSoilStats, setNdwiSoilStats] = useState(null);
  const [vRequiredGeojson, setVRequiredGeojson] = useState(null);
  const [phenoData, setPhenoData] = useState([]);
  const [ksValues, setKsValues] = useState([]);
  // ml_ready_dataset.json is ~20MB (it's the source for the Kc/crop-coefficient
  // values used by the Forecast feature) - too big to fetch eagerly on every
  // load, so it's only fetched the first time something actually needs it.
  const [mlReadyData, setMlReadyData] = useState(null);
  const [mlReadyLoading, setMlReadyLoading] = useState(false);
  const ensureMlReadyDataset = useCallback(() => {
    if (mlReadyData || mlReadyLoading) return;
    setMlReadyLoading(true);
    fetch(`${process.env.PUBLIC_URL}/data/ml_ready_dataset.json`)
      .then(response => response.json())
      .then(data => setMlReadyData(data))
      .catch(error => console.error("Error loading ML-ready dataset:", error))
      .finally(() => setMlReadyLoading(false));
  }, [mlReadyData, mlReadyLoading]);

  // Daily_Statistics.json is ~57MB (the enriched per-block/per-day dataset -
  // ETa, Net Deficit, Net Irrigation, NDVI, NDWI, Growth Stage, Season) -
  // only fetched the first time the Fields tab's Daily mode is opened.
  // The backend keeps the live copy (uploads update it there), so that's
  // tried first; the static bundled copy is a fallback if the backend is
  // unreachable (e.g. not running locally, or asleep on Render's free tier).
  const [dailyStatistics, setDailyStatistics] = useState(null);
  const [dailyStatisticsLoading, setDailyStatisticsLoading] = useState(false);
  const ensureDailyStatistics = useCallback(() => {
    if (dailyStatistics || dailyStatisticsLoading) return;
    setDailyStatisticsLoading(true);
    fetch(`${ADVISOR_API_URL}/api/daily-statistics`)
      .then(response => {
        if (!response.ok) throw new Error(`Backend returned ${response.status}`);
        return response.json();
      })
      .then(data => setDailyStatistics(data))
      .catch(error => {
        console.error("Backend daily statistics unavailable, falling back to the static file:", error);
        return fetch(`${process.env.PUBLIC_URL}/data/Daily_Statistics.json`)
          .then(response => response.json())
          .then(data => setDailyStatistics(data))
          .catch(fallbackError => console.error("Error loading daily statistics dataset:", fallbackError));
      })
      .finally(() => setDailyStatisticsLoading(false));
  }, [dailyStatistics, dailyStatisticsLoading]);

  useEffect(() => {
    // process.env.PUBLIC_URL ensures the path resolves correctly on GitHub Pages
    const csvUrl = process.env.PUBLIC_URL + '/data/vineyard_STAR.csv';

    fetch(`${process.env.PUBLIC_URL}/data/Tokara_Study_Area.json`)
    .then(response => response.json())
    .then(data => setStudyAreaGeojson(data))
    .catch(error => console.error("Error loading Study Area:", error));

    fetch(`${process.env.PUBLIC_URL}/data/daily_irrigation_final.json`)
    .then(response => response.json())
    .then(data => setDailyIrrigation(data))
    .catch(error => console.error("Error loading daily irrigation data:", error));

    fetch(`${process.env.PUBLIC_URL}/data/weekly_irrigation_final.json`)
    .then(response => response.json())
    .then(data => setWeeklyIrrigation(data))
    .catch(error => console.error("Error loading weekly irrigation data:", error));

    fetch(`${process.env.PUBLIC_URL}/data/ndvi_stats.json`)
    .then(response => response.json())
    .then(data => setNdviStats(data))
    .catch(error => console.error("Error loading NDVI stats:", error));

    fetch(`${process.env.PUBLIC_URL}/data/tokara_indices_NDWI_SOIL.json`)
    .then(response => response.json())
    .then(data => setNdwiSoilStats(data))
    .catch(error => console.error("Error loading NDWI/soil moisture stats:", error));

    fetch(`${process.env.PUBLIC_URL}/data/Tokara_V_Required.json`)
    .then(response => response.json())
    .then(data => setVRequiredGeojson(data))
    .catch(error => console.error("Error loading irrigation volume required data:", error));

    Papa.parse(`${process.env.PUBLIC_URL}/data/Tokara_Pheno_Data.csv`, {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (results) => setPhenoData((results.data || []).filter(row => row['Block ID'])),
      error: (err) => console.error("Error loading phenology data:", err)
    });

    // Managerial_Ks_Value.csv has a title row before the real header
    // ("Cultivars,Type of hydrology mech,Budbreak,Flowering,PreVeraison,Harvesting"),
    // so it's fetched as text and that first line is dropped before parsing.
    fetch(`${process.env.PUBLIC_URL}/data/Managerial_Ks_Value.csv`)
      .then(response => response.text())
      .then(text => {
        const withoutTitleRow = text.split('\n').slice(1).join('\n');
        Papa.parse(withoutTitleRow, {
          header: true,
          dynamicTyping: true,
          complete: (results) => setKsValues((results.data || []).filter(row => row.Cultivars))
        });
      })
      .catch(error => console.error("Error loading managerial Ks values:", error));

    Papa.parse(csvUrl, {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          // Filter out any empty rows
          const validData = results.data.filter(row => row.BLOCK);
          setFieldsData(validData);
          setSelectedField(validData[0]);
        }
      },
      error: (err) => console.error("Error parsing CSV:", err)
    });
  }, []);

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        fieldsData={fieldsData}
        selectedField={selectedField}
        setSelectedField={setSelectedField}
        collapsed={sidebarCollapsed}
      />
      <div className="main-content">
        <TopBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
        />

        <main className="content-area">
          {activeTab === 'Home' && (
            <MapTab
              fields={fieldsData}
              studyAreaGeojson={studyAreaGeojson}
              selectedField={selectedField}
              setSelectedField={setSelectedField}
              dailyIrrigation={dailyIrrigation}
              ndviStats={ndviStats}
              ndwiSoilStats={ndwiSoilStats}
              vRequiredGeojson={vRequiredGeojson}
            />
          )}

          {activeTab === 'Fields' && (
            <NowScreen
              field={selectedField}
              fields={fieldsData}
              setSelectedField={setSelectedField}
              studyAreaGeojson={studyAreaGeojson}
              weeklyIrrigation={weeklyIrrigation}
              ndviStats={ndviStats}
              ndwiSoilStats={ndwiSoilStats}
              vRequiredGeojson={vRequiredGeojson}
              phenoData={phenoData}
              mlReadyData={mlReadyData}
              mlReadyLoading={mlReadyLoading}
              ensureMlReadyDataset={ensureMlReadyDataset}
              dailyStatistics={dailyStatistics}
              dailyStatisticsLoading={dailyStatisticsLoading}
              ensureDailyStatistics={ensureDailyStatistics}
            />
          )}

          {activeTab === 'Irrigation Planner' && (
            <IrrigationPlanner
              fields={fieldsData}
              studyAreaGeojson={studyAreaGeojson}
              selectedField={selectedField}
              setSelectedField={setSelectedField}
              phenoData={phenoData}
              dailyStatistics={dailyStatistics}
              dailyStatisticsLoading={dailyStatisticsLoading}
              ensureDailyStatistics={ensureDailyStatistics}
            />
          )}

          {activeTab === 'Weather' && (
            <div className="module-placeholder">
              <h2>Regional Weather Radar</h2>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}