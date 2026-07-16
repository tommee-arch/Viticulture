import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';

export function PredictiveScreen() {
  const position = [-33.9345, 18.8644]; 

  return (
    <div>
      <h3 style={{ marginTop: 0, color: '#2c3e50' }}>7-Day Irrigation Forecast</h3>
      
      {/* Map Container */}
      <div style={{ height: '300px', width: '100%', marginBottom: '20px', zIndex: 1 }}>
        <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%', borderRadius: '8px' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {/* Using a Circle to represent a forecast zone rather than a pinpoint */}
          <Circle center={position} radius={800} pathOptions={{ color: 'orange', fillColor: 'orange', fillOpacity: 0.2 }}>
            <Popup>Irrigation deficit predicted in 4 days.</Popup>
          </Circle>
          <Marker position={position} />
        </MapContainer>
      </div>

      {/* Forecast Data Grid */}
      <div style={gridContainer}>
        <div style={forecastCard}>
          <h4>Tomorrow</h4>
          <p>Expected $GDD$: 15.1</p>
          <p>Projected $K_c$: 0.48</p>
          <p style={{color: 'gray'}}>No Action</p>
        </div>
        <div style={forecastCard}>
          <h4>Day 3</h4>
          <p>Expected $GDD$: 16.5</p>
          <p>Projected $K_c$: 0.52</p>
          <p style={{color: 'gray'}}>No Action</p>
        </div>
        <div style={{...forecastCard, borderColor: 'orange', backgroundColor: '#fff8eb'}}>
          <h4>Day 4</h4>
          <p>Expected $GDD$: 18.2</p>
          <p>Projected $K_c$: 0.60</p>
          <p style={{color: 'orange', fontWeight: 'bold'}}>Irrigation Cycle Required</p>
        </div>
      </div>
    </div>
  );
}

const gridContainer = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '15px'
};

const forecastCard = {
  padding: '15px',
  backgroundColor: '#fff',
  borderRadius: '8px',
  border: '1px solid #ddd',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
};