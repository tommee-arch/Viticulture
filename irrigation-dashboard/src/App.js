import React, { useState, useEffect } from 'react';
import './App.css';

// Import Components
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';

// Import Screens/Tabs
import MapTab from './components/MapTab';       // The full screen map view
import NowScreen from './NowScreen';            // Your existing file, wrapped in the new UI
import PredictiveScreen from './PredictiveScreen'; // Your existing file, wrapped in the new UI

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('Fields'); 
  const [selectedField, setSelectedField] = useState(null);
  
  // Timeframe State (Toggled by TopBar)
  const [timeframe, setTimeframe] = useState('Now'); // 'Now' or 'Predictive'

  // Placeholder for your field data (ideally fetched from a CSV or JSON)
  const [fieldsData, setFieldsData] = useState([
    { FieldName: 'Block A2', AreaHA: 1.7, Lat: -33.9249, Lng: 18.8602 },
    { FieldName: 'Block A3', AreaHA: 1.0, Lat: -33.9255, Lng: 18.8610 }
  ]);

  useEffect(() => {
    // Set default selected field on load
    if (fieldsData.length > 0) {
      setSelectedField(fieldsData[0]);
    }
  }, [fieldsData]);

  return (
    <div className="app-container">
      {/* Sidebar handles the left menu and field selection */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        fieldsData={fieldsData}
        selectedField={selectedField}
        setSelectedField={setSelectedField}
      />
      
      <div className="main-content">
        {/* TopBar handles the Date toggles and Print button */}
        <TopBar timeframe={timeframe} setTimeframe={setTimeframe} />
        
        <div className="content-area">
          {/* Main Content Routing */}
          {activeTab === 'Home' && <MapTab />}
          
          {activeTab === 'Fields' && timeframe === 'Now' && (
             <NowScreen field={selectedField} />
          )}

          {activeTab === 'Fields' && timeframe === 'Predictive' && (
             <PredictiveScreen field={selectedField} />
          )}

          {(activeTab === 'Irrigation Manager' || activeTab === 'Fertigation Manager') && (
            <div className="placeholder-screen">
              <h2>{activeTab} Module</h2>
              <p>Decision support tools loading...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}