import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import MapFlyTo from './components/MapFlyTo';
import MapResizeHandler from './components/MapResizeHandler';
import { sumVRequiredByBlock } from './utils/vRequired';
import './IrrigationPlanner.css';

// Flask advisor API (see backend/README.md) - GEMINI_KEY lives there, never here.
// CRA bakes REACT_APP_* vars in at build time, so this has to be set before `npm run build`.
const ADVISOR_API_URL = process.env.REACT_APP_ADVISOR_API_URL || 'http://localhost:5000';

const PRIORITY_LEVELS = [
  { key: 'critical', label: 'Critical', color: '#e74c3c', min: 0.75 },
  { key: 'high', label: 'High', color: '#f39c12', min: 0.5 },
  { key: 'medium', label: 'Medium', color: '#27ae60', min: 0.25 },
  { key: 'low', label: 'Low', color: '#bdc3c7', min: 0 },
];

function priorityFor(ratio) {
  return PRIORITY_LEVELS.find(p => ratio >= p.min) || PRIORITY_LEVELS[PRIORITY_LEVELS.length - 1];
}

// vineyard_STAR.csv stores Budbreak/Flowering as US-format dates (M/D/YYYY).
function parseUsDate(str) {
  if (!str) return null;
  const [m, d, y] = String(str).split('/').map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

// vineyard_STAR.csv only records Budbreak/Flowering for the 2022/2023 season,
// but weeklyIrrigation spans three seasons - re-anchor the month/day onto
// whichever season the reading actually falls in, since phenology recurs
// annually rather than only ever happening in 2022.
function anchorToSeason(day, seasonStartYear) {
  if (!day || !seasonStartYear) return day;
  return new Date(seasonStartYear, day.getMonth(), day.getDate());
}

// Growth stage as of a block's latest irrigation reading, from the real
// Budbreak/Flowering dates in the CSV - there's no Veraison/Harvest date
// on record, so "Flowering" is as far as this can resolve.
function deriveStage(recordDateIso, recordSeason, budbreakStr, floweringStr) {
  if (!recordDateIso) return 'Unknown';
  const recordDate = new Date(recordDateIso);
  const seasonStartYear = recordSeason ? parseInt(String(recordSeason).slice(0, 4), 10) : null;
  const budbreak = anchorToSeason(parseUsDate(budbreakStr), seasonStartYear);
  const flowering = anchorToSeason(parseUsDate(floweringStr), seasonStartYear);
  if (flowering && recordDate >= flowering) return 'Flowering';
  if (budbreak && recordDate >= budbreak) return 'Budbreak';
  return 'Pre-Budbreak';
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
  const [isSending, setIsSending] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { sender: 'gemini', text: 'Hello! I am your IRRIGUIDE assistant, backed by Gemini. Select a block and ask me about its deficit, ETa, stage or recommended volume.' }
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
        stage: deriveStage(record?.Date, record?.Season, f.Budbreak, f.Flowering),
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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question || isSending) return;

    const blockId = selectedField?.BLOCK || topPriority?.block;
    const historyForRequest = chatHistory;

    setChatHistory(prev => [...prev, { sender: 'user', text: question }]);
    setChatInput('');

    if (!blockId) {
      setChatHistory(prev => [...prev, { sender: 'gemini', text: 'Select a block first so I know what data to look at.' }]);
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch(`${ADVISOR_API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_id: blockId, question, history: historyForRequest })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Advisor API returned ${res.status}`);
      }
      const data = await res.json();
      setChatHistory(prev => [...prev, { sender: 'gemini', text: data.answer }]);
    } catch (err) {
      // Advisor service unreachable/misconfigured (e.g. not running locally yet) -
      // fall back to the same numbers, computed client-side, so the chat still answers.
      console.error('Advisor API unavailable, falling back to local summary:', err);
      setChatHistory(prev => [...prev, { sender: 'gemini', text: `(offline) ${answerFromData()}` }]);
    } finally {
      setIsSending(false);
    }
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
            <option value="deficit">Sort: PWDI</option>
            <option value="volume">Sort: Volume</option>
            <option value="priority">Sort: Priority</option>
          </select>
        </div>
      </div>

      {/* Priority Table - condensed to 4 visible rows, scroll for the rest */}
      <div className="table-card">
        <div className="priority-table-scroll">
          <table className="priority-table">
            <thead>
              <tr>
                <th>Block</th>
                <th>Cultivar</th>
                <th>Stage</th>
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
                  <td>{row.stage}</td>
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
      </div>

      {/* Bottom row: Map, Graph and AI Assistant side by side on one line */}
      <div className="planner-dashboard-grid">

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

        {/* 2. Graph Widget - real 7-day soil moisture trend for the selected block, as horizontal bars */}
        <div className="widget-card graph-widget">
          <h3>Soil Moisture (7d){selectedField ? ` - ${selectedField.BLOCK}` : ''}</h3>
          {soilTrend.length > 0 ? (
            <>
              <div className="h-bar-graph">
                {soilTrend.map((point) => (
                  <div key={point.date} className="h-bar-row">
                    <span className="h-bar-label">{point.date.slice(5).replace('-', '/')}</span>
                    <div className="h-bar-track">
                      <div
                        className="h-bar-fill"
                        style={{
                          width: `${Math.max(2, point.value)}%`,
                          backgroundColor: point.value < 30 ? '#e74c3c' : '#009E60'
                        }}
                      ></div>
                    </div>
                    <span className="h-bar-value">{point.value.toFixed(0)}%</span>
                  </div>
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
              disabled={isSending}
            />
            <button type="submit" disabled={isSending}>{isSending ? '...' : 'Send'}</button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default IrrigationPlanner;
