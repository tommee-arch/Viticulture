import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import MapFlyTo from './components/MapFlyTo';
import MapResizeHandler from './components/MapResizeHandler';
import { sumVRequiredByBlock } from './utils/vRequired';
import { formatSeason } from './utils/fieldMetrics';
import './IrrigationPlanner.css';

const PRIORITY_LEVELS = [
  { key: 'critical', label: 'Critical', color: '#e74c3c', min: 0.75 },
  { key: 'high', label: 'High', color: '#f39c12', min: 0.5 },
  { key: 'medium', label: 'Medium', color: '#27ae60', min: 0.25 },
  { key: 'low', label: 'Low', color: '#bdc3c7', min: 0 },
];

function priorityFor(ratio) {
  return PRIORITY_LEVELS.find(p => ratio >= p.min) || PRIORITY_LEVELS[PRIORITY_LEVELS.length - 1];
}

const IrrigationPlanner = ({
  fields = [],
  studyAreaGeojson,
  selectedField,
  setSelectedField,
  weeklyIrrigation = [],
  ndwiSoilStats,
  vRequiredGeojson
}) => {
  const [sortBy, setSortBy] = useState('deficit');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'gemini', text: 'Hello! I am your IRRIGUIDE assistant. Select a block or ask me about deficit, volume or priority - I read it straight off the live irrigation data.' }
  ]);

  // Each block's most recently recorded weekly reading.
  const latestByBlock = useMemo(() => {
    const map = {};
    weeklyIrrigation.forEach(r => {
      const cur = map[r.Block_ID];
      if (!cur || r.Date > cur.Date) map[r.Block_ID] = r;
    });
    return map;
  }, [weeklyIrrigation]);

  const vRequiredByBlock = useMemo(() => sumVRequiredByBlock(vRequiredGeojson), [vRequiredGeojson]);

  // vineyard_STAR.csv has one row per block, but guard against dupes anyway.
  const uniqueBlocks = useMemo(() => {
    const seen = new Set();
    return fields.filter(f => {
      if (!f.BLOCK || seen.has(f.BLOCK)) return false;
      seen.add(f.BLOCK);
      return true;
    });
  }, [fields]);

  const deficitMax = useMemo(
    () => Math.max(0, ...Object.values(latestByBlock).map(r => r.Net_Deficit_mm ?? 0)),
    [latestByBlock]
  );

  const priorityRows = useMemo(() => {
    const rows = uniqueBlocks.map(f => {
      const record = latestByBlock[f.BLOCK];
      const deficit = record?.Net_Deficit_mm ?? 0;
      const ratio = deficitMax > 0 ? deficit / deficitMax : 0;
      const priority = priorityFor(ratio);
      return {
        block: f.BLOCK,
        cultivar: f.CULTIVAR,
        season: formatSeason(record?.Season) || 'Current',
        deficit,
        ratio,
        volume: Math.round(vRequiredByBlock[f.BLOCK] ?? 0),
        priority: priority.label,
        color: priority.color
      };
    });

    const sorters = {
      deficit: (a, b) => b.deficit - a.deficit,
      volume: (a, b) => b.volume - a.volume,
      priority: (a, b) =>
        PRIORITY_LEVELS.findIndex(p => p.label === a.priority) - PRIORITY_LEVELS.findIndex(p => p.label === b.priority)
    };
    return rows.sort(sorters[sortBy]);
  }, [uniqueBlocks, latestByBlock, deficitMax, vRequiredByBlock, sortBy]);

  const topPriority = priorityRows[0] || null;

  // 7-day soil moisture trend for the selected block, from the NDWI/soil dataset.
  const soilTrend = useMemo(() => {
    if (!selectedField || !ndwiSoilStats?.dates) return [];
    return ndwiSoilStats.dates
      .slice(-7)
      .map(date => ({ date, value: ndwiSoilStats.data?.[date]?.[selectedField.BLOCK]?.soil_moisture }))
      .filter(d => Number.isFinite(d.value));
  }, [ndwiSoilStats, selectedField]);

  const latestSoilMoisture = soilTrend.length ? soilTrend[soilTrend.length - 1].value : null;

  // Same highlight styling as the Fields tab map: selected block in yellow, others faint.
  const blockStyle = (feature) => {
    const isSelected = selectedField && feature.properties.BLOCK === selectedField.BLOCK;
    return isSelected
      ? { color: '#fbc02d', weight: 3, fillColor: '#fff176', fillOpacity: 0.5 }
      : { color: '#ffea00', weight: 1, fillOpacity: 0.05, fillColor: '#2ca25f', dashArray: '4, 4' };
  };

  const onEachFeature = (feature, layer) => {
    layer.on({
      click: () => {
        const match = fields.find(f => f.BLOCK === feature.properties.BLOCK);
        if (match) setSelectedField(match);
      }
    });
  };

  const lat = selectedField?.Y || -33.9007;
  const lng = selectedField?.X || 18.9106;

  const answerFromData = () => {
    if (!topPriority) return "I don't have irrigation data loaded yet.";
    const target = selectedField
      ? priorityRows.find(r => r.block === selectedField.BLOCK) || topPriority
      : topPriority;
    const otherHighest = target.block === topPriority.block
      ? "It's currently the highest priority block."
      : `${topPriority.block} is the highest priority block right now, needing ${topPriority.volume.toLocaleString()} m³.`;
    return `Block ${target.block} (${target.cultivar}) has a net deficit of ${target.deficit.toFixed(1)}mm and needs ${target.volume.toLocaleString()} m³ - that's ${target.priority} priority. ${otherHighest}`;
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setChatHistory(prev => [...prev, { sender: 'user', text: chatInput }]);
    setChatInput('');

    const responseText = answerFromData();
    setTimeout(() => {
      setChatHistory(prev => [...prev, { sender: 'gemini', text: responseText }]);
    }, 400);
  };

  return (
    <div className="planner-container">

      {/* Header & Controls */}
      <div className="planner-header">
        <div className="header-tabs">
          <button className="tab active">Irrigation priority</button>
          <button className="tab">All stages</button>
        </div>
        <div className="header-filters">
          <select className="sort-dropdown" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="deficit">Sort: Water Deficit</option>
            <option value="volume">Sort: Volume</option>
            <option value="priority">Sort: Priority</option>
          </select>
        </div>
      </div>

      {/* Priority Table */}
      <div className="table-card">
        <table className="priority-table">
          <thead>
            <tr>
              <th>Block</th>
              <th>Cultivar</th>
              <th>Season</th>
              <th>Water Deficit (mm)</th>
              <th>Volume</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {priorityRows.map((row) => (
              <tr
                key={row.block}
                className={selectedField?.BLOCK === row.block ? 'selected-row' : ''}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  const match = fields.find(f => f.BLOCK === row.block);
                  if (match) setSelectedField(match);
                }}
              >
                <td><strong>{row.block}</strong></td>
                <td>{row.cultivar}</td>
                <td>{row.season}</td>
                <td className="bar-cell">
                  <span className="deficit-value">{row.deficit.toFixed(1)}</span>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(100, row.ratio * 100)}%`, backgroundColor: row.color }}
                    ></div>
                  </div>
                </td>
                <td><strong>{row.volume.toLocaleString()} m³</strong></td>
                <td>
                  <span className={`priority-badge ${row.priority.toLowerCase()}`}>
                    {row.priority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Dashboard Grid: Map -> Graph -> AI Assistant */}
      <div className="dashboard-grid">

        {/* 1. Map Widget - same vineyard block map as the Fields tab */}
        <div className="widget-card map-widget">
          <h3>Field View{selectedField ? ` - ${selectedField.BLOCK}` : ''}</h3>
          <div className="map-inner">
            <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              {studyAreaGeojson && (
                <GeoJSON
                  key={`irrigation-planner-blocks-${selectedField?.BLOCK}`}
                  data={studyAreaGeojson}
                  style={blockStyle}
                  onEachFeature={onEachFeature}
                />
              )}
              <MapFlyTo selectedField={selectedField} />
              <MapResizeHandler trigger={selectedField?.BLOCK} />
            </MapContainer>
          </div>
        </div>

        {/* 2. Graph Widget - real 7-day soil moisture trend for the selected block */}
        <div className="widget-card graph-widget">
          <h3>Soil Moisture Trend (7 Days){selectedField ? ` - ${selectedField.BLOCK}` : ''}</h3>
          {soilTrend.length > 0 ? (
            <>
              <div className="mock-graph-container">
                {soilTrend.map((point) => (
                  <div
                    key={point.date}
                    className="mock-bar"
                    title={`${point.date}: ${point.value.toFixed(0)}%`}
                    style={{
                      height: `${Math.max(4, point.value)}%`,
                      backgroundColor: point.value < 30 ? '#e74c3c' : '#009E60'
                    }}
                  ></div>
                ))}
              </div>
              <p className="graph-caption">
                {latestSoilMoisture < 30
                  ? 'Depletion nearing critical threshold'
                  : `Latest reading: ${latestSoilMoisture.toFixed(0)}%`}
              </p>
            </>
          ) : (
            <div className="map-placeholder">
              <p>{selectedField ? 'No soil moisture data for this block yet' : 'Select a block to view its trend'}</p>
            </div>
          )}
        </div>

        {/* 3. Gemini AI Widget - answers are computed from the priority table above */}
        <div className="widget-card ai-widget">
          <div className="ai-header">
            <span className="ai-icon">✨</span>
            <h3>Gemini Assistant</h3>
          </div>
          <div className="chat-window">
            {chatHistory.map((msg, index) => (
              <div key={index} className={`chat-bubble ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="Ask about irrigation..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit">Send</button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default IrrigationPlanner;
