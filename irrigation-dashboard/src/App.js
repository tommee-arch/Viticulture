import React, { useState } from 'react';
import NowScreen from './NowScreen';
import PredictiveScreen from './PredictiveScreen';
import 'leaflet/dist/leaflet.css';

export default function App() {
  // State to track which dashboard is currently visible
  const [activeTab, setActiveTab] = useState('now');

  return (
    <div style={pageStyle}>
      
      {/* Header & Toggle UI */}
      <div style={headerContainer}>
        <h2 style={{ margin: 0, color: '#2c3e50' }}>Irrigation Management System</h2>
        
        {/* The Toggle Switch */}
        <div style={toggleContainer}>
          <button 
            onClick={() => setActiveTab('now')}
            style={activeTab === 'now' ? activeStyle : inactiveStyle}
          >
            Now (Today)
          </button>
          <button 
            onClick={() => setActiveTab('forecast')}
            style={activeTab === 'forecast' ? activeStyle : inactiveStyle}
          >
            Forecast (Next Week)
          </button>
        </div>
      </div>

      {/* Dynamic Content Rendering */}
      <div style={contentCard}>
        {activeTab === 'now' ? <NowScreen /> : <PredictiveScreen />}
      </div>
      
    </div>
  );
}

// Clean, modern inline styling
const pageStyle = {
  fontFamily: 'sans-serif', 
  backgroundColor: '#f4f6f8', 
  minHeight: '100vh', 
  padding: '20px'
};

const headerContainer = {
  display: 'flex', 
  justifyContent: 'space-between', 
  alignItems: 'center', 
  marginBottom: '20px'
};

const toggleContainer = {
  display: 'flex', 
  backgroundColor: '#e0e4e8', 
  borderRadius: '30px', 
  overflow: 'hidden',
  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
};

const activeStyle = {
  padding: '10px 20px',
  backgroundColor: '#3498db',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.3s ease'
};

const inactiveStyle = {
  padding: '10px 20px',
  backgroundColor: 'transparent',
  color: '#555',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.3s ease'
};

const contentCard = {
  backgroundColor: '#fff', 
  padding: '20px', 
  borderRadius: '8px', 
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
};