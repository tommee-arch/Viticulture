import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import MapFlyTo from './components/MapFlyTo';
import MapResizeHandler from './components/MapResizeHandler';
import WeatherWidget from './components/WeatherWidget';
import { netDeficitColor, evapotranspirationColor, ndviColor, ndwiColor, gradientCss, NET_DEFICIT_LOW, NET_DEFICIT_HIGH, ET_LOW, ET_HIGH, NDVI_LOW, NDVI_HIGH, NDWI_LOW, NDWI_HIGH } from './utils/colorScale';
import { findClosestDate } from './utils/dateLookup';

// Mock data generator for sensor metrics not in the CSV
const generateMockData = (blockName) => {
  let hash = 0;
  for (let i = 0; i < blockName.length; i++) {
    hash = blockName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);

  return {
    et: (3.0 + (absHash % 30) / 10).toFixed(1),
    soilMoisture: 25 + (absHash % 25),
    irrigationNet: 10 + (absHash % 15),
    health: (absHash % 100) > 80 ? 'Good' : 'Excellent',
    waterUse: 110000 + (absHash % 30000)
  };
};

export default function NowScreen({ field, fields = [], setSelectedField, studyAreaGeojson, dailyIrrigation = [], weeklyIrrigation = [], ndviStats, ndwiSoilStats }) {
  const [dataMode, setDataMode] = useState('weekly');
  const [selectedDate, setSelectedDate] = useState(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  // 'selection' (yellow highlight), 'et' (Evapotranspiration), or 'deficit' (Net Deficit)
  const [colorMode, setColorMode] = useState('selection');

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

  // Every block's reading on the selected date, for the ET/Net Deficit map overlays.
  const activeFullSeries = dataMode === 'daily' ? dailyIrrigation : weeklyIrrigation;
  const recordsForSelectedDate = useMemo(() => {
    const map = {};
    if (!selectedDate) return map;
    activeFullSeries.forEach(r => {
      if (r.Date === selectedDate) map[r.Block_ID] = r;
    });
    return map;
  }, [activeFullSeries, selectedDate]);

  const etMaxAll = useMemo(() => Math.max(0, ...Object.values(recordsForSelectedDate).map(r => r.ETa_mm ?? 0)), [recordsForSelectedDate]);
  const deficitMaxAll = useMemo(() => Math.max(0, ...Object.values(recordsForSelectedDate).map(r => r.Net_Deficit_mm ?? 0)), [recordsForSelectedDate]);

  // NDVI/NDWI come from sparse satellite-pass dates, not the daily/weekly irrigation
  // calendar - so find whichever of those passes is closest to the date selected above.
  const indexDates = useMemo(() => ndviStats?.dates || ndwiSoilStats?.dates || [], [ndviStats, ndwiSoilStats]);
  const indexDate = useMemo(() => findClosestDate(indexDates, selectedDate), [indexDates, selectedDate]);

  const ndviByBlockAtDate = useMemo(() => ndviStats?.data?.[indexDate] || {}, [ndviStats, indexDate]);
  const ndviValues = useMemo(() => Object.values(ndviByBlockAtDate).map(b => b.mean).filter(Number.isFinite), [ndviByBlockAtDate]);
  const ndviMinAll = ndviValues.length ? Math.min(...ndviValues) : 0;
  const ndviMaxAll = ndviValues.length ? Math.max(...ndviValues) : 1;

  const ndwiByBlockAtDate = useMemo(() => ndwiSoilStats?.data?.[indexDate] || {}, [ndwiSoilStats, indexDate]);
  const ndwiValues = useMemo(() => Object.values(ndwiByBlockAtDate).map(b => b.ndwi?.mean).filter(Number.isFinite), [ndwiByBlockAtDate]);
  const ndwiMinAll = ndwiValues.length ? Math.min(...ndwiValues) : 0;
  const ndwiMaxAll = ndwiValues.length ? Math.max(...ndwiValues) : 1;

  // Whenever the block or the weekly/daily mode changes, snap to the most recent
  // available date unless the current selection is still valid for the new series.
  useEffect(() => {
    setSelectedDate(prev => (prev && availableDates.includes(prev)) ? prev : (availableDates[availableDates.length - 1] || null));
  }, [availableDates]);

  if (!field) return <div className="loading">Select a field to view data.</div>;

  const mockData = generateMockData(field.BLOCK || 'default');
  const selectedIndex = Math.max(0, availableDates.indexOf(selectedDate));
  const currentRecord = activeSeries[selectedIndex] || null;
  const currentNdvi = ndviByBlockAtDate[field.BLOCK]?.mean ?? null;
  const currentNdwi = ndwiByBlockAtDate[field.BLOCK]?.ndwi?.mean ?? null;

  const handleDatePick = (dateStr) => {
    if (!dateStr || availableDates.length === 0) return;
    setSelectedDate(findClosestDate(availableDates, dateStr));
  };

  // Highlight the selected block in light yellow; other blocks just get a faint outline.
  // In ET/Net Deficit/NDVI/NDWI mode, fill shows the data instead and selection is a border only.
  const blockStyle = (feature) => {
    const isSelected = feature.properties.BLOCK === field.BLOCK;

    if (colorMode === 'et' || colorMode === 'deficit' || colorMode === 'ndvi' || colorMode === 'ndwi') {
      let fillColor;
      if (colorMode === 'et' || colorMode === 'deficit') {
        const record = recordsForSelectedDate[feature.properties.BLOCK];
        fillColor = colorMode === 'et'
          ? evapotranspirationColor(record?.ETa_mm, etMaxAll)
          : netDeficitColor(record?.Net_Deficit_mm, deficitMaxAll);
      } else if (colorMode === 'ndvi') {
        fillColor = ndviColor(ndviByBlockAtDate[feature.properties.BLOCK]?.mean, ndviMinAll, ndviMaxAll);
      } else {
        fillColor = ndwiColor(ndwiByBlockAtDate[feature.properties.BLOCK]?.ndwi?.mean, ndwiMinAll, ndwiMaxAll);
      }
      return {
        color: isSelected ? '#fbc02d' : 'white',
        weight: isSelected ? 3 : 1,
        fillColor,
        fillOpacity: 0.6
      };
    }

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
            <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000, display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '160px' }}>
              {[
                { key: 'selection', label: 'Sel' },
                { key: 'et', label: 'ET' },
                { key: 'deficit', label: 'Deficit' },
                { key: 'ndvi', label: 'NDVI' },
                { key: 'ndwi', label: 'NDWI' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColorMode(key)}
                  style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: colorMode === key ? '#2ca25f' : 'white', color: colorMode === key ? 'white' : '#333', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMapExpanded(v => !v)}
              style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, background: 'white', border: '1px solid #ccc', borderRadius: '4px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
            >
              {mapExpanded ? 'Collapse Map' : 'Expand Map'}
            </button>

            {colorMode !== 'selection' && (
              <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 1000, background: 'white', padding: '6px 10px', borderRadius: '4px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', fontSize: '10px', minWidth: '140px' }}>
                {(colorMode === 'et' || colorMode === 'deficit') && (
                  <>
                    <div style={{ color: '#666', marginBottom: '3px' }}>
                      {colorMode === 'et' ? 'Evapotranspiration (mm)' : 'Net Deficit (mm)'} - {selectedDate}
                    </div>
                    <div style={{ height: '8px', borderRadius: '3px', background: colorMode === 'et' ? gradientCss(ET_LOW, ET_HIGH) : gradientCss(NET_DEFICIT_LOW, NET_DEFICIT_HIGH) }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', marginTop: '2px' }}>
                      <span>0</span>
                      <span>{(colorMode === 'et' ? etMaxAll : deficitMaxAll).toFixed(1)}</span>
                    </div>
                  </>
                )}
                {(colorMode === 'ndvi' || colorMode === 'ndwi') && (
                  <>
                    <div style={{ color: '#666', marginBottom: '3px' }}>
                      {colorMode === 'ndvi' ? 'NDVI' : 'NDWI'}{indexDate ? ` - ${indexDate}` : ''}
                    </div>
                    <div style={{ height: '8px', borderRadius: '3px', background: colorMode === 'ndvi' ? gradientCss(NDVI_LOW, NDVI_HIGH) : gradientCss(NDWI_LOW, NDWI_HIGH) }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', marginTop: '2px' }}>
                      <span>{(colorMode === 'ndvi' ? ndviMinAll : ndwiMinAll).toFixed(2)}</span>
                      <span>{(colorMode === 'ndvi' ? ndviMaxAll : ndwiMaxAll).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* The Fields Tab Map using the FlyTo Component */}
            <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />

              {/* Vineyard blocks - selected block highlighted in light yellow, others clickable to select */}
              {studyAreaGeojson && (
                <GeoJSON
                  key={`fields-tab-blocks-${field.BLOCK}-${colorMode}-${selectedDate}-${dataMode}-${indexDate}`}
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
              <span className="label">NDWI</span>
              <span className="value">{currentNdwi != null ? currentNdwi.toFixed(2) : '—'}</span>
            </div>
            <div className={`card kpi ${mockData.soilMoisture < 30 ? 'warning' : ''}`}>
              <span className="label">Dehydration Risk</span>
              <span className="value">{mockData.soilMoisture < 30 ? 'Moderate' : 'Low'}</span>
            </div>
            <div className="card kpi">
              <span className="label">NDVI Index</span>
              <span className="value">{currentNdvi != null ? currentNdvi.toFixed(2) : '—'}</span>
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