import React, { useState, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import NowScreen from './NowScreen';
import MapTab from './components/MapTab'; // Assuming you have a full-screen map component
import IrrigationPlanner from './Irrigation_Planner';
import LoginScreen from './components/LoginScreen';
import { isLoggedIn, signOut } from './utils/auth';
import './App.css';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [activeTab, setActiveTab] = useState('Fields');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fieldsData, setFieldsData] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [studyAreaGeojson, setStudyAreaGeojson] = useState(null);
  const [weeklyIrrigation, setWeeklyIrrigation] = useState([]);
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

  // Full_final_deduped.json is the enriched per-block/per-day dataset -
  // ETa, Net Deficit, Irrigation Net, Volume, NDVI, NDWI, Ks_current_mean,
  // Growth Stage, Season - only fetched the first time the Fields tab's
  // Daily mode is opened. Always read straight from the bundled static
  // file in public/data - the backend's /api/daily-statistics and
  // /api/upload-daily-data are a separate proof-of-concept path (see the
  // Upload Data popup) and don't feed this dashboard.
  const [dailyStatistics, setDailyStatistics] = useState(null);
  const [dailyStatisticsLoading, setDailyStatisticsLoading] = useState(false);
  const ensureDailyStatistics = useCallback(() => {
    if (dailyStatistics || dailyStatisticsLoading) return;
    setDailyStatisticsLoading(true);
    fetch(`${process.env.PUBLIC_URL}/data/Full_final_deduped.json`)
      .then(response => response.json())
      .then(data => setDailyStatistics(data))
      .catch(error => console.error("Error loading daily statistics dataset:", error))
      .finally(() => setDailyStatisticsLoading(false));
  }, [dailyStatistics, dailyStatisticsLoading]);

  useEffect(() => {
    // process.env.PUBLIC_URL ensures the path resolves correctly on GitHub Pages
    const csvUrl = process.env.PUBLIC_URL + '/data/vineyard_STAR.csv';

    fetch(`${process.env.PUBLIC_URL}/data/Tokara_Study_Area.json`)
    .then(response => response.json())
    .then(data => setStudyAreaGeojson(data))
    .catch(error => console.error("Error loading Study Area:", error));

    // Weekly_accumulated.json is keyed by Week_Start/Week_End rather than a
    // single Date - aliased to Date here so the rest of the app (date
    // slider, closest-date lookups) can treat it the same as daily records.
    fetch(`${process.env.PUBLIC_URL}/data/Weekly_accumulated.json`)
    .then(response => response.json())
    .then(data => setWeeklyIrrigation(data.map(r => ({ ...r, Date: r.Week_Start }))))
    .catch(error => console.error("Error loading weekly irrigation data:", error));

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

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

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
          onLogout={() => { signOut(); setLoggedIn(false); }}
        />

        <main className="content-area">
          {activeTab === 'Home' && (
            <MapTab
              fields={fieldsData}
              studyAreaGeojson={studyAreaGeojson}
              selectedField={selectedField}
              setSelectedField={setSelectedField}
              dailyStatistics={dailyStatistics}
              ensureDailyStatistics={ensureDailyStatistics}
            />
          )}

          {activeTab === 'Fields' && (
            <NowScreen
              field={selectedField}
              fields={fieldsData}
              setSelectedField={setSelectedField}
              studyAreaGeojson={studyAreaGeojson}
              weeklyIrrigation={weeklyIrrigation}
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
              ksValues={ksValues}
              dailyStatistics={dailyStatistics}
              dailyStatisticsLoading={dailyStatisticsLoading}
              ensureDailyStatistics={ensureDailyStatistics}
            />
          )}
        </main>
      </div>
    </div>
  );
}