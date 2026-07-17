import React from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import MapFlyTo from './components/MapFlyTo';
import WeatherWidget from './components/WeatherWidget';

// Mock data generator for sensor metrics not in the CSV
const generateMockData = (blockName) => {
  let hash = 0;
  for (let i = 0; i < blockName.length; i++) {
    hash = blockName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);
  
  return {
    et: (3.0 + (absHash % 30) / 10).toFixed(1),
    ndvi: (0.55 + (absHash % 35) / 100).toFixed(2),
    soilMoisture: 25 + (absHash % 25),
    irrigationNet: 10 + (absHash % 15),
    health: (absHash % 100) > 80 ? 'Good' : 'Excellent',
    waterUse: 110000 + (absHash % 30000)
  };
};

export default function NowScreen({ field, studyAreaGeojson }) {
  if (!field) return <div className="loading">Select a field to view data.</div>;

  const mockData = generateMockData(field.BLOCK || 'default');

  // Highlight the selected block in light yellow; other blocks just get a faint outline.
  const blockStyle = (feature) => {
    const isSelected = feature.properties.BLOCK === field.BLOCK;
    return isSelected
      ? { color: '#fbc02d', weight: 3, fillColor: '#fff176', fillOpacity: 0.5 }
      : { color: '#ffea00', weight: 1, fillOpacity: 0, dashArray: '4, 4' };
  };

  // Pulling exact coordinates from vineyard_STAR.csv. Y = Lat, X = Lng
  const lat = field.Y || -33.9007;
  const lng = field.X || 18.9106;

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-grid">
        
        {/* Left Column: Metadata & Map */}
        <div className="col-left">
          <div className="card field-meta">
            <h2>{field.Farm || 'Farm'} - Block {field.BLOCK}</h2>
            <table>
              <tbody>
                <tr><td>Cultivar</td><td>{field.CULTIVAR}</td></tr>
                <tr><td>Area</td><td>{Number(field.Area).toFixed(3)} ha</td></tr>
                {/* New data from vineyard_STAR.csv */}
                <tr><td>Season</td><td>{field.season || 'Current'}</td></tr>
                <tr><td>Budbreak</td><td>{field.Budbreak || 'Pending'}</td></tr>
                <tr><td>Flowering</td><td>{field.Flowering || 'Pending'}</td></tr>
                <tr>
                  <td>Plant Health</td>
                  <td className={mockData.health === 'Excellent' ? 'status-good' : 'status-warning'}>
                    {mockData.health}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card map-container-card" style={{ height: '300px' }}>
            {/* The Fields Tab Map using the FlyTo Component */}
            <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              
              {/* Vineyard blocks - selected block highlighted in light yellow */}
              {studyAreaGeojson && (
                <GeoJSON
                  key={`fields-tab-blocks-${field.BLOCK}`}
                  data={studyAreaGeojson}
                  style={blockStyle}
                />
              )}
              <MapFlyTo selectedField={field} />
            </MapContainer>
          </div>
        </div>

        {/* Right Column: KPIs & Weather */}
        <div className="col-right">
          <div className="kpi-grid">
            <div className="card kpi">
              <span className="label">Irrigation Net</span>
              <span className="value">{mockData.irrigationNet} <span className="unit">mm</span></span>
            </div>
            <div className="card kpi">
              <span className="label">Evapotranspiration</span>
              <span className="value">{mockData.et} <span className="unit">mm/day</span></span>
            </div>
            <div className="card kpi">
              <span className="label">Soil Moisture</span>
              <span className="value">{mockData.soilMoisture} <span className="unit">%</span></span>
            </div>
            <div className={`card kpi ${mockData.soilMoisture < 30 ? 'warning' : ''}`}>
              <span className="label">Dehydration Risk</span>
              <span className="value">{mockData.soilMoisture < 30 ? 'Moderate' : 'Low'}</span>
            </div>
            <div className="card kpi">
              <span className="label">NDVI Index</span>
              <span className="value">{mockData.ndvi}</span>
            </div>
          </div>
          
          <div className="card weather-card">
            <WeatherWidget lat={lat} lng={lng} />
          </div>
        </div>
      </div>
    </div>
  );
}