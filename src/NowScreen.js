import React from 'react';
import ZoomableMap from './components/ZoomableMap';
import WeatherWidget from './components/WeatherWidget';

// A simple function to generate deterministic pseudo-random numbers based on the Block ID.
// This makes the UI prototype look fully dynamic and functional for presentations.
const generateMockData = (blockName) => {
  let hash = 0;
  for (let i = 0; i < blockName.length; i++) {
    hash = blockName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);
  
  return {
    et: (3.0 + (absHash % 30) / 10).toFixed(1), // Ranges from 3.0 to 5.9 mm/day
    ndvi: (0.55 + (absHash % 35) / 100).toFixed(2), // Ranges from 0.55 to 0.89
    soilMoisture: 25 + (absHash % 25), // Ranges from 25% to 49%
    irrigationNet: 10 + (absHash % 15), // Ranges from 10 to 24 mm
    health: (absHash % 100) > 80 ? 'Good' : 'Excellent',
    slope: 2 + (absHash % 8), // Ranges from 2% to 9%
    waterUse: 110000 + (absHash % 30000)
  };
};

export default function NowScreen({ field }) {
  if (!field) return <div className="loading">Select a field to view data.</div>;

  // Generate the dynamic metrics based on the specific block name clicked
  const mockData = generateMockData(field.BLOCK || 'default');

  // Fallback coordinates since they aren't in Vineyard_Areas.csv
  const lat = field.Lat || -33.9321;
  const lng = field.Lng || 18.8602;

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-grid">
        
        {/* Left Column: Metadata & Map */}
        <div className="col-left">
          <div className="card field-meta">
            <h2>Block {field.BLOCK}</h2>
            <table>
              <tbody>
                <tr><td>Cultivar Type</td><td>{field.CULTIVAR}</td></tr>
                <tr><td>Area</td><td>{Number(field.Area).toFixed(3)} ha</td></tr>
                <tr><td>Growth Stage</td><td>Veraison</td></tr>
                <tr>
                  <td>Plant Health</td>
                  <td className={mockData.health === 'Excellent' ? 'status-good' : 'status-warning'}>
                    {mockData.health}
                  </td>
                </tr>
                <tr><td>Slope Aspect</td><td>NW</td></tr>
                <tr><td>Average Slope</td><td>{mockData.slope}%</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card map-container-card">
            <ZoomableMap lat={lat} lng={lng} />
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
            <div className="card kpi">
              <span className="label">Water Use Target</span>
              <span className="value">{mockData.waterUse.toLocaleString()} <span className="unit">L/ha</span></span>
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