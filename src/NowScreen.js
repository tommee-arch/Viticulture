import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import MapFlyTo from './components/MapFlyTo';
import MapResizeHandler from './components/MapResizeHandler';
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

// Finds the entry in a sorted date list closest to a target date (used when the
// calendar picker is set to a day that isn't in the dataset).
const findClosestDate = (dates, target) => {
  const targetTime = new Date(target).getTime();
  return dates.reduce((closest, d) =>
    Math.abs(new Date(d).getTime() - targetTime) < Math.abs(new Date(closest).getTime() - targetTime) ? d : closest
  , dates[0]);
};

export default function NowScreen({ field, fields = [], setSelectedField, studyAreaGeojson, dailyIrrigation = [], weeklyIrrigation = [] }) {
  const [dataMode, setDataMode] = useState('weekly');
  const [selectedDate, setSelectedDate] = useState(null);
  const [mapExpanded, setMapExpanded] = useState(false);

  const dailyForBlock = useMemo(() => {
    if (!field) return [];
    return dailyIrrigation
      .filter(d => d.Block_ID === field.BLOCK)
      .sort((a, b) => a.Date.localeCompare(b.Date));
  }, [dailyIrrigation, field]);

  const weeklyForBlock = useMemo(() => {
    if (!field) return [];
    return weeklyIrrigation
      .filter(d => d.Block_ID === field.BLOCK)
      .sort((a, b) => a.Date.localeCompare(b.Date));
  }, [weeklyIrrigation, field]);

  const activeSeries = dataMode === 'daily' ? dailyForBlock : weeklyForBlock;
  const availableDates = useMemo(() => activeSeries.map(d => d.Date), [activeSeries]);

  // Whenever the block or the weekly/daily mode changes, snap to the most recent
  // available date unless the current selection is still valid for the new series.
  useEffect(() => {
    setSelectedDate(prev => (prev && availableDates.includes(prev)) ? prev : (availableDates[availableDates.length - 1] || null));
  }, [availableDates]);

  if (!field) return <div className="loading">Select a field to view data.</div>;

  const mockData = generateMockData(field.BLOCK || 'default');
  const selectedIndex = Math.max(0, availableDates.indexOf(selectedDate));
  const currentRecord = activeSeries[selectedIndex] || null;

  const handleDatePick = (dateStr) => {
    if (!dateStr || availableDates.length === 0) return;
    setSelectedDate(findClosestDate(availableDates, dateStr));
  };

  // Highlight the selected block in light yellow; other blocks just get a faint outline.
  const blockStyle = (feature) => {
    const isSelected = feature.properties.BLOCK === field.BLOCK;
    return isSelected
      ? { color: '#fbc02d', weight: 3, fillColor: '#fff176', fillOpacity: 0.5 }
      : { color: '#ffea00', weight: 1, fillOpacity: 0.05, fillColor: '#2ca25f', dashArray: '4, 4' };
  };

  // Lets you pick a vineyard block by clicking it on this map too, not just via the sidebar.
  const onEachFeature = (feature, layer) => {
    layer.on({
      click: () => {
        const fullRecord = fields.find(f => f.BLOCK === feature.properties.BLOCK);
        if (fullRecord) setSelectedField(fullRecord);
      }
    });
  };

  // Pulling exact coordinates from vineyard_STAR.csv. Y = Lat, X = Lng
  const lat = field.Y || -33.9007;
  const lng = field.X || 18.9106;

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-grid" style={{ gridTemplateColumns: mapExpanded ? '2.6fr 0.8fr' : '1.2fr 2fr', transition: 'grid-template-columns 0.3s ease' }}>
        
        {/* Left Column: Metadata & Map */}
        <div className="col-left">
          <div className="card field-meta">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ margin: 0 }}>{field.Farm || 'Farm'} - Block {field.BLOCK}</h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setDataMode('weekly')}
                    style={{ padding: '4px 10px', fontSize: '12px', border: 'none', cursor: 'pointer', background: dataMode === 'weekly' ? '#2ca25f' : '#f0f0f0', color: dataMode === 'weekly' ? 'white' : '#333' }}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    onClick={() => setDataMode('daily')}
                    style={{ padding: '4px 10px', fontSize: '12px', border: 'none', cursor: 'pointer', background: dataMode === 'daily' ? '#2ca25f' : '#f0f0f0', color: dataMode === 'daily' ? 'white' : '#333' }}
                  >
                    Daily
                  </button>
                </div>

                <input
                  type="date"
                  value={selectedDate || ''}
                  min={availableDates[0] || undefined}
                  max={availableDates[availableDates.length - 1] || undefined}
                  onChange={(e) => handleDatePick(e.target.value)}
                  style={{ fontSize: '12px', padding: '3px 6px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>
            </div>

            {availableDates.length > 0 && (
              <div style={{ margin: '10px 0 4px' }}>
                <input
                  type="range"
                  min={0}
                  max={availableDates.length - 1}
                  value={selectedIndex}
                  onChange={(e) => setSelectedDate(availableDates[Number(e.target.value)])}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' }}>
                  <span>{availableDates[0]}</span>
                  <span style={{ fontWeight: 'bold', color: '#333' }}>{selectedDate}</span>
                  <span>{availableDates[availableDates.length - 1]}</span>
                </div>
              </div>
            )}

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
          <div className="card map-container-card" style={{ height: mapExpanded ? '650px' : '300px', position: 'relative', transition: 'height 0.3s ease' }}>
            <button
              type="button"
              onClick={() => setMapExpanded(v => !v)}
              style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, background: 'white', border: '1px solid #ccc', borderRadius: '4px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
            >
              {mapExpanded ? 'Collapse Map' : 'Expand Map'}
            </button>

            {/* The Fields Tab Map using the FlyTo Component */}
            <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />

              {/* Vineyard blocks - selected block highlighted in light yellow, others clickable to select */}
              {studyAreaGeojson && (
                <GeoJSON
                  key={`fields-tab-blocks-${field.BLOCK}`}
                  data={studyAreaGeojson}
                  style={blockStyle}
                  onEachFeature={onEachFeature}
                />
              )}
              <MapFlyTo selectedField={field} />
              <MapResizeHandler trigger={mapExpanded} />
            </MapContainer>
          </div>
        </div>

        {/* Right Column: KPIs & Weather */}
        <div className="col-right" style={{ overflow: 'hidden' }}>
          <div className="kpi-grid" style={{ gridTemplateColumns: mapExpanded ? '1fr' : 'repeat(3, 1fr)', transition: 'grid-template-columns 0.3s ease' }}>
            <div className="card kpi">
              <span className="label">Irrigation Net</span>
              <span className="value">{mockData.irrigationNet} <span className="unit">mm</span></span>
            </div>
            <div className="card kpi">
              <span className="label">Evapotranspiration</span>
              <span className="value">
                {currentRecord ? currentRecord.ETa_mm : mockData.et} <span className="unit">mm/{dataMode === 'daily' ? 'day' : 'week'}</span>
              </span>
            </div>
            <div className="card kpi">
              <span className="label">Net Deficit</span>
              <span className="value">
                {currentRecord ? currentRecord.Net_Deficit_mm : '—'} <span className="unit">mm/{dataMode === 'daily' ? 'day' : 'week'}</span>
              </span>
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
            <WeatherWidget lat={lat} lng={lng} date={selectedDate} />
          </div>
        </div>
      </div>
    </div>
  );
}