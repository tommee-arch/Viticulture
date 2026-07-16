import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import L from 'leaflet';

// Fix for default Leaflet marker icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// 1. Define the VineyardLayer component inside or above this file
export function VineyardLayer() {
  const [vineyards, setVineyards] = useState(null);

  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/data/tokara_boundaries.geojson`)
      .then(response => response.json())
      .then(data => {
        console.log("GeoJSON loaded into state:", data); // Check console for this!
        setVineyards(data);
      })
      .catch(err => console.error("Error loading vineyard GeoJSON:", err));
  }, []);

  return vineyards ? (
    <GeoJSON 
      key="vineyard-layer-unique-key" 
      data={vineyards} 
      style={{ 
        color: '#ff0000', // Changed to bright red for testing
        weight: 5,        // Thicker lines
        fillOpacity: 0.8  // High opacity
      }} 
      onEachFeature={(feature, layer) => {
        console.log("Feature detected on map:", feature); // If this prints, Leaflet is reading the data!
        layer.bindPopup("Vineyard Block: " + feature.properties.BLOCK);
      }}
    />
  ) : null;
}

// 2. Use it inside your NowScreen
export function NowScreen() {
  const position = [-33.9345, 18.8644]; 

  return (
    <div>
      <h3 style={{ marginTop: 0, color: '#2c3e50' }}>Live Field Status</h3>
      
      <div style={{ height: '400px', width: '100%', marginBottom: '20px', zIndex: 1 }}>
        <MapContainer center={position} zoom={14} style={{ height: '100%', width: '100%', borderRadius: '8px' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          
          {/* This is where your new layer renders */}
          <VineyardLayer />
          
          <Marker position={position}>
            <Popup>
              <strong>Test Plot Alpha</strong><br/>
              Cultivar: Bophelo
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      <div style={dataCard}>
        <p><strong>System Status:</strong> <span style={{color: 'green'}}>Online</span></p>
        <p><strong>Today's GDD:</strong> 14.2</p>
        <p><strong>Action:</strong> Soil moisture adequate.</p>
      </div>
    </div>
  );
}

const dataCard = {
  padding: '20px', 
  backgroundColor: '#e8f4f8', 
  borderRadius: '8px',
  border: '1px solid #bce8f1',
  color: '#31708f'
};