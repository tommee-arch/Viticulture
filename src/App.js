import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import NowScreen from './NowScreen';
import PredictiveScreen from './PredictiveScreen';
import MapTab from './components/MapTab'; // Assuming you have a full-screen map component
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('Fields');
  const [timeframe, setTimeframe] = useState('Now');
  const [fieldsData, setFieldsData] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [studyAreaGeojson, setStudyAreaGeojson] = useState(null);
  useEffect(() => {
    // process.env.PUBLIC_URL ensures the path resolves correctly on GitHub Pages
    const csvUrl = process.env.PUBLIC_URL + '/data/vineyard_STAR.csv';
    
    fetch(`${process.env.PUBLIC_URL}/data/Tokara_Study_Area.json`)
    .then(response => response.json())
    .then(data => setStudyAreaGeojson(data))
    .catch(error => console.error("Error loading Study Area:", error));


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
      />
      <div className="main-content">
        <TopBar timeframe={timeframe} setTimeframe={setTimeframe} />
        
        <main className="content-area">
          {activeTab === 'Home' && <MapTab fields={fieldsData} />}
          
          {activeTab === 'Fields' && timeframe === 'Now' && (
            <NowScreen field={selectedField} />
          )}
          
          {activeTab === 'Fields' && timeframe === 'Predictive' && (
            <PredictiveScreen field={selectedField} />
          )}

          {(activeTab === 'Irrigation Manager' || activeTab === 'Fertigation Manager') && (
            <div className="module-placeholder">
              <h2>{activeTab} Workspace</h2>
              <p>Select a field and input parameters to generate application rates.</p>
            </div>
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