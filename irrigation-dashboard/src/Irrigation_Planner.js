import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import MapFlyTo from './components/MapFlyTo';
import MapResizeHandler from './components/MapResizeHandler';
import { sumVRequiredByBlock } from './utils/vRequired';
import { deriveGrowthStage } from './utils/growthStage';
import HelpTip from './components/HelpTip';
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

// Managerial_Ks_Value.csv's "Harvest" stage column is spelled "Harvesting".
const STAGE_TO_KS_COLUMN = { Budbreak: 'Budbreak', Flowering: 'Flowering', PreVeraison: 'PreVeraison', Harvest: 'Harvesting' };

// A block that hasn't reached Budbreak yet (or has no phenology data at all)
// has no defined coefficient in the table - fall back to the Budbreak
// column, the closest defined value, rather than leaving it blank.
function ksFor(ksValues, cultivar, stage) {
  const row = ksValues.find(r => r.Cultivars === cultivar);
  if (!row) return null;
  const column = STAGE_TO_KS_COLUMN[stage] || STAGE_TO_KS_COLUMN.Budbreak;
  const value = row[column];
  return typeof value === 'number' ? value : null;
}

const IrrigationPlanner = ({
  fields = [],
  studyAreaGeojson,
  selectedField,
  setSelectedField,
  ndwiSoilStats,
  vRequiredGeojson,
  phenoData = [],
  ksValues = [],
  mlReadyData,
  mlReadyLoading,
  ensureMlReadyDataset
}) => {
  const [sortBy, setSortBy] = useState('deficit');
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { sender: 'gemini', text: 'Howzit! Your Smart Water Chommie here. Click on a block and ask me for the latest on its deficit, ETa, stage, or recommended volume.' }
  ]);
  const chatWindowRef = useRef(null);

  // Keep the newest message in view - the chat log scrolls internally
  // rather than growing the whole card taller.
  useEffect(() => {
    const el = chatWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatHistory]);

  // ml_ready_dataset.json is large and only fetched once something needs it -
  // this table is one of those things.
  useEffect(() => {
    ensureMlReadyDataset();
  }, [ensureMlReadyDataset]);

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

  // Most recent season present in the phenology dataset.
  const latestPhenoSeason = useMemo(() => {
    const seasons = phenoData.map(r => r.season).filter(Boolean).sort();
    return seasons.length ? seasons[seasons.length - 1] : null;
  }, [phenoData]);

  // Each block's phenology record for the latest season - falling back to
  // that block's own most recent season if it has no record for
  // latestPhenoSeason (a few blocks are missing their newest season's data).
  const phenoByBlock = useMemo(() => {
    const map = {};
    uniqueBlocks.forEach(f => {
      const blockRows = phenoData.filter(r => r['Block ID'] === f.BLOCK);
      const exact = blockRows.find(r => r.season === latestPhenoSeason);
      if (exact) {
        map[f.BLOCK] = exact;
        return;
      }
      const withSeason = blockRows.filter(r => r.season).sort((a, b) => String(a.season).localeCompare(String(b.season)));
      map[f.BLOCK] = withSeason[withSeason.length - 1] || blockRows[0] || null;
    });
    return map;
  }, [phenoData, uniqueBlocks, latestPhenoSeason]);

  // Each block's most recent daily reading - the water deficit source.
  const latestMlByBlock = useMemo(() => {
    const map = {};
    (mlReadyData || []).forEach(r => {
      const cur = map[r.Block_ID];
      if (!cur || r.Date > cur.Date) map[r.Block_ID] = r;
    });
    return map;
  }, [mlReadyData]);

  const priorityRows = useMemo(() => {
    const withoutRank = uniqueBlocks.map(f => {
      const pheno = phenoByBlock[f.BLOCK];
      const mlRecord = latestMlByBlock[f.BLOCK];
      const cultivar = pheno?.Cultivar || f.CULTIVAR;
      const stage = deriveGrowthStage(mlRecord?.Date, pheno);
      const ks = ksFor(ksValues, cultivar, stage);
      const waterDeficit = mlRecord?.Net_Deficit_mm;
      // Net irrigation requirement = Ks x water deficit.
      const netIrrigationReq = (ks != null && waterDeficit != null) ? ks * waterDeficit : null;
      // Required volume = recommended volume x Ks.
      const requiredVolume = ks != null ? (vRequiredByBlock[f.BLOCK] ?? 0) * ks : null;
      return { block: f.BLOCK, cultivar, stage, netIrrigationReq, requiredVolume };
    });

    const reqMax = Math.max(0, ...withoutRank.map(r => r.netIrrigationReq ?? 0));
    const rows = withoutRank.map(r => {
      const ratio = (r.netIrrigationReq != null && reqMax > 0) ? r.netIrrigationReq / reqMax : 0;
      const priority = priorityFor(ratio);
      return { ...r, ratio, priority: priority.label, color: priority.color };
    });

    const sorters = {
      deficit: (a, b) => (b.netIrrigationReq ?? -1) - (a.netIrrigationReq ?? -1),
      volume: (a, b) => (b.requiredVolume ?? -1) - (a.requiredVolume ?? -1),
      priority: (a, b) =>
        PRIORITY_LEVELS.findIndex(p => p.label === a.priority) - PRIORITY_LEVELS.findIndex(p => p.label === b.priority)
    };
    return rows.sort(sorters[sortBy]);
  }, [uniqueBlocks, phenoByBlock, latestMlByBlock, ksValues, vRequiredByBlock, sortBy]);

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
    const reqText = target.netIrrigationReq != null ? `${target.netIrrigationReq.toFixed(1)}mm` : 'an unknown amount';
    const volText = target.requiredVolume != null ? `${Math.round(target.requiredVolume).toLocaleString()} m³` : 'an unknown volume';
    const topVolText = topPriority.requiredVolume != null ? `${Math.round(topPriority.requiredVolume).toLocaleString()} m³` : 'an unknown volume';
    const otherHighest = target.block === topPriority.block
      ? "It's currently the highest priority block."
      : `${topPriority.block} is the highest priority block right now, needing ${topVolText}.`;
    return `Block ${target.block} (${target.cultivar}) has a net irrigation requirement of ${reqText} and needs ${volText} - that's ${target.priority} priority. ${otherHighest}`;
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
          <HelpTip text="Change which column ranks the blocks below." className="help-tip-block">
            <select className="sort-dropdown" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="deficit">Sort: Net Irrigation Req.</option>
              <option value="volume">Sort: Required Volume</option>
              <option value="priority">Sort: Priority</option>
            </select>
          </HelpTip>
        </div>
      </div>

      {mlReadyLoading && !mlReadyData && (
        <div className="table-card" style={{ padding: '12px 15px', fontSize: '0.85em', color: '#666' }}>
          Loading irrigation model data...
        </div>
      )}

      {/* Priority Table - condensed to 4 visible rows, scroll for the rest */}
      <div className="table-card">
        <div className="priority-table-scroll">
          <table className="priority-table">
            <thead>
              <tr>
                <th><HelpTip text="Vineyard block identifier.">Block</HelpTip></th>
                <th><HelpTip text="Grape variety planted in this block.">Cultivar</HelpTip></th>
                <th><HelpTip text="Current growth stage of the vines in this block.">Stage</HelpTip></th>
                <th><HelpTip text="How much water this block needs, adjusted for growth stage (Ks x deficit).">Net Irrigation Req. (mm)</HelpTip></th>
                <th><HelpTip text="Total irrigation volume recommended for this block, adjusted for growth stage.">Required Volume</HelpTip></th>
                <th><HelpTip text="How urgently this block needs irrigation compared to the rest of the vineyard.">Priority</HelpTip></th>
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
                    <span className="deficit-value">{row.netIrrigationReq != null ? row.netIrrigationReq.toFixed(1) : '—'}</span>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(100, row.ratio * 100)}%`, backgroundColor: row.color }}
                      ></div>
                    </div>
                  </td>
                  <td><strong>{row.requiredVolume != null ? `${Math.round(row.requiredVolume).toLocaleString()} m³` : '—'}</strong></td>
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
          <h3><HelpTip text="Map of the selected block's boundary.">Field View{selectedField ? ` - ${selectedField.BLOCK}` : ''}</HelpTip></h3>
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
          <h3><HelpTip text="Satellite-estimated soil moisture over the last 7 days.">Soil Moisture (7d){selectedField ? ` - ${selectedField.BLOCK}` : ''}</HelpTip></h3>
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
            <h3><HelpTip text="Ask about any block's irrigation status - answered live using real data.">Gemini Assistant</HelpTip></h3>
          </div>
          <div className="chat-window" ref={chatWindowRef}>
            {chatHistory.map((msg, index) => (
              <div key={index} className={`chat-bubble ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <HelpTip text="Try: 'How much water does this block need?' or 'Which block is highest priority?'" style={{ flexGrow: 1 }}>
              <input
                type="text"
                placeholder="Ask about irrigation..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isSending}
              />
            </HelpTip>
            <button type="submit" disabled={isSending}>{isSending ? '...' : 'Send'}</button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default IrrigationPlanner;
