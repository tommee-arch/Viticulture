import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix for default Leaflet marker icons not loading correctly in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export function NowScreen() {
  // Coordinates for the test site
  const position = [-33.9345, 18.8644]; 

  return (
    <div>
      <h3 style={{ marginTop: 0, color: '#2c3e50' }}>Live Field Status</h3>
      
      {/* Map Container */}
      <div style={{ height: '400px', width: '100%', marginBottom: '20px', zIndex: 1 }}>
        <MapContainer center={position} zoom={14} style={{ height: '100%', width: '100%', borderRadius: '8px' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <Marker position={position}>
            <Popup>
              <strong>Test Plot Alpha</strong><br/>
              Cultivar: Bophelo<br/>
              Status: Active Monitoring
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* Data Readout */}
      <div style={dataCard}>
        <p><strong>System Status:</strong> <span style={{color: 'green'}}>Online</span></p>
        <p><strong>Today's $GDD$:</strong> 14.2</p>
        <p><strong>Current $K_c$:</strong> 0.45</p>
        <p><strong>Action:</strong> Soil moisture adequate. No irrigation required today.</p>
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