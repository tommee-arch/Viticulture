import React from 'react';
import ZoomableMap from './components/ZoomableMap';
import WeatherWidget from './components/WeatherWidget';

export default function NowScreen({ field }) {
  if (!field) return <div className="loading">Select a field to view data.</div>;

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-grid">
        
        {/* Left Column: Metadata & Map */}
        <div className="col-left">
          <div className="card field-meta">
            <h2>{field.FieldName}</h2>
            <table>
              <tbody>
                <tr><td>Cultivar Type</td><td>{field.Cultivar || 'Cabernet Sauvignon'}</td></tr>
                <tr><td>Growth Stage</td><td>{field.GrowthStage || 'Veraison'}</td></tr>
                <tr><td>Plant Health</td><td className="status-good">{field.HealthStatus || 'Excellent'}</td></tr>
                <tr><td>Slope Aspect</td><td>{field.Aspect || 'NW'}</td></tr>
                <tr><td>Average Slope</td><td>{field.Slope || '5'}%</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card map-container-card">
            <ZoomableMap lat={field.Lat} lng={field.Lng} />
          </div>
        </div>

        {/* Right Column: KPIs & Weather */}
        <div className="col-right">
          <div className="kpi-grid">
            <div className="card kpi">
              <span className="label">Irrigation Net</span>
              <span className="value">{field.IrrigationNet || 18} <span className="unit">mm</span></span>
            </div>
            <div className="card kpi">
              <span className="label">Evapotranspiration</span>
              <span className="value">{field.ET || 4.2} <span className="unit">mm/day</span></span>
            </div>
            <div className="card kpi">
              <span className="label">Soil Moisture</span>
              <span className="value">{field.SoilMoisture || 32} <span className="unit">%</span></span>
            </div>
            <div className="card kpi warning">
              <span className="label">Dehydration Risk</span>
              <span className="value">{field.RiskLevel || 'Low'}</span>
            </div>
            <div className="card kpi">
              <span className="label">NDVI Index</span>
              <span className="value">{field.NDVI || 0.72}</span>
            </div>
            <div className="card kpi">
              <span className="label">Water Use Target</span>
              <span className="value">{(field.WaterUse || 125000).toLocaleString()} <span className="unit">L/ha</span></span>
            </div>
          </div>
          
          <div className="card weather-card">
            <WeatherWidget lat={field.Lat} lng={field.Lng} />
          </div>
        </div>
      </div>
    </div>
  );
}