import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, LayersControl } from 'react-leaflet';
import MapFlyTo from './components/MapFlyTo';
import MapResizeHandler from './components/MapResizeHandler';
import HelpTip from './components/HelpTip';
import TifOverlays from './components/TifOverlays';
import OrderedOverlaysControl from './components/OrderedOverlaysControl';
import './IrrigationPlanner.css';

// Flask advisor API (see backend/README.md) - GEMINI_KEY lives there, never here.
// CRA bakes REACT_APP_* vars in at build time, so this has to be set before `npm run build`.
const ADVISOR_API_URL = process.env.REACT_APP_ADVISOR_API_URL || 'http://localhost:5000';

// PWDI (Plant Water Deficit Index) priority buckets - a HIGH PWDI means
// CRITICAL water need. Buckets are relative (quartiles of today's PWDI
// spread across the vineyard), not fixed PWDI cutoffs - see priorityRows.
// Colors are from the Okabe-Ito colorblind-safe palette - blue for "low"
// rather than the conventional green, so it stays distinguishable from
// "critical" under red-green color blindness.
const PRIORITY_LEVELS = [
  { key: 'critical', label: 'critical', color: '#d55e00' },
  { key: 'high', label: 'high', color: '#e69f00' },
  { key: 'moderate', label: 'moderate', color: '#f0e442' },
  { key: 'low', label: 'low', color: '#0072b2' },
];

// Growth stage -> water-demand score (1-5, 5 = highest demand). PreVeraison
// is peak canopy/berry expansion; Harvest is when water is intentionally
// withheld. Pre-Budbreak/Unknown aren't in the original spec (dormant vines
// or missing phenology data for a few blocks) - treated as low demand (1),
// same as Harvest, rather than left unscored.
const GROWTH_STAGE_SCORE = {
  'PreVeraison': 5,
  'Flowering': 4,
  'Budbreak': 2,
  'Harvest': 1,
  'Pre-Budbreak': 1,
  'Unknown': 1
};

// Hydrology strategy (Managerial_Ks_Value.csv's "Type of hydrology mech")
// -> water-sensitivity score (1-5). Isohydric vines close stomata early and
// are more water-sensitive; Anisohydric vines tolerate more deficit.
const GRAPE_TYPE_SCORE = {
  'Isohydric': 5,
  'Anisohydric-Isohydric': 3,
  'Anisohydric': 1
};

// A cultivar not found in Managerial_Ks_Value.csv gets a neutral mid score
// rather than being excluded from the index entirely.
const DEFAULT_GRAPE_TYPE_SCORE = 3;

// --- Irrigation Time (frontend-only, not part of any dataset) ---
// Follows the "Drip Irrigation Fundamentals" method (Univ. of Arkansas
// Division of Agriculture, FSA6174): Drip Rate (in/hour) = (emitter flow
// rate (gph) x 231.1) / (emitter spacing (in) x bed width (in)) - i.e. the
// emitter's output spread over the ground area it wets, giving a depth
// applied per hour. The metric equivalent (1 L over 1 m2 = 1 mm of depth)
// is simpler: Application Rate (mm/hour) = emitter flow rate (L/hour) /
// (emitter spacing (m) x row spacing (m)).
//
// We don't have Tokara's actual emitter/spacing spec, so these are generic
// values typical of a vineyard drip system - adjust here if the real specs
// become available:
//   - 2.3 L/hour per emitter (a common standard inline dripper rating)
//   - emitters spaced 0.5m apart along the row (roughly one per vine)
//   - rows spaced 2.4m apart (typical vineyard inter-row spacing)
const DRIP_EMITTER_FLOW_RATE_L_PER_HOUR = 2.3;
const DRIP_EMITTER_SPACING_M = 0.5;
const DRIP_ROW_SPACING_M = 2.4;
const DRIP_APPLICATION_RATE_MM_PER_HOUR =
  DRIP_EMITTER_FLOW_RATE_L_PER_HOUR / (DRIP_EMITTER_SPACING_M * DRIP_ROW_SPACING_M);

function hydrologyTypeFor(ksValues, cultivar) {
  const row = ksValues.find(r => r.Cultivars === cultivar);
  return row ? row['Type of hydrology mech'] : null;
}

const IrrigationPlanner = ({
  fields = [],
  studyAreaGeojson,
  selectedField,
  setSelectedField,
  ksValues = [],
  dailyStatistics,
  dailyStatisticsLoading,
  ensureDailyStatistics
}) => {
  const [sortBy, setSortBy] = useState('deficit');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { sender: 'gemini', text: 'Howzit! Your Smart Water Chommie here. Click on a block and ask me for the latest on its deficit, ETa, stage, or recommended volume.' }
  ]);
  const chatWindowRef = useRef(null);
  const tableScrollRef = useRef(null);

  // Keep the newest message in view - the chat log scrolls internally
  // rather than growing the whole card taller.
  useEffect(() => {
    const el = chatWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatHistory]);

  // Whenever a block is selected - whether from this table, the map, or the
  // sidebar - scroll its row into view here too.
  useEffect(() => {
    if (!selectedField || !tableScrollRef.current) return;
    const el = tableScrollRef.current.querySelector(`[data-block="${selectedField.BLOCK}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedField]);

  // Full_final_deduped.json is large and only fetched once something needs it -
  // this table is one of those things.
  useEffect(() => {
    ensureDailyStatistics();
  }, [ensureDailyStatistics]);

  // vineyard_STAR.csv has one row per block, but guard against dupes anyway.
  const uniqueBlocks = useMemo(() => {
    const seen = new Set();
    return fields.filter(f => {
      if (!f.BLOCK || seen.has(f.BLOCK)) return false;
      seen.add(f.BLOCK);
      return true;
    });
  }, [fields]);

  // Each block's most recent record in Full_final_deduped.json - Net
  // Irrigation Req, Required Volume, Stage and Cultivar are all read
  // straight from here now (Irrigation_net, Volume_m3, Growth_Stage,
  // Cultivar respectively).
  const latestDailyByBlock = useMemo(() => {
    const map = {};
    (dailyStatistics || []).forEach(r => {
      const cur = map[r.Block_ID];
      if (!cur || r.Date > cur.Date) map[r.Block_ID] = r;
    });
    return map;
  }, [dailyStatistics]);

  const priorityRows = useMemo(() => {
    const withoutRank = uniqueBlocks.map(f => {
      const dailyRecord = latestDailyByBlock[f.BLOCK];
      const cultivar = dailyRecord?.Cultivar || f.CULTIVAR;
      const stage = dailyRecord?.Growth_Stage || 'Unknown';
      const netIrrigationReq = dailyRecord?.Irrigation_net ?? null;
      const requiredVolume = dailyRecord?.Volume_m3 ?? null;
      // Irrigation Time (minutes) = depth needed (mm) / drip application rate
      // (mm/hour) x 60 - a surplus day (netIrrigationReq <= 0) needs no run time.
      const irrigationTimeMinutes = netIrrigationReq != null
        ? (Math.max(0, netIrrigationReq) / DRIP_APPLICATION_RATE_MM_PER_HOUR) * 60
        : null;
      const hydrologyType = hydrologyTypeFor(ksValues, cultivar);
      return { block: f.BLOCK, cultivar, stage, netIrrigationReq, requiredVolume, irrigationTimeMinutes, hydrologyType };
    });

    // --- PWDI (Plant Water Deficit Index) ---
    // Each input scaled 1-5 (5 = highest water need), combined as:
    // PWDI = 0.4 x Irrigation_net score + 0.4 x growth-stage score + 0.2 x grape-type score.
    const irrigationNetValues = withoutRank.map(r => r.netIrrigationReq).filter(v => v != null);
    const irrigationNetMin = irrigationNetValues.length ? Math.min(...irrigationNetValues) : 0;
    const irrigationNetMax = irrigationNetValues.length ? Math.max(...irrigationNetValues) : 0;

    const scored = withoutRank.map(r => {
      let scaledIrrigationNet = null;
      if (r.netIrrigationReq != null) {
        scaledIrrigationNet = irrigationNetMax === irrigationNetMin
          ? 3 // no spread across blocks today - neutral mid score rather than a divide-by-zero
          : 1 + 4 * ((r.netIrrigationReq - irrigationNetMin) / (irrigationNetMax - irrigationNetMin));
      }
      const scaledStage = GROWTH_STAGE_SCORE[r.stage] ?? 1;
      const scaledGrapeType = GRAPE_TYPE_SCORE[r.hydrologyType] ?? DEFAULT_GRAPE_TYPE_SCORE;
      const pwdi = scaledIrrigationNet == null
        ? null
        : (0.4 * scaledIrrigationNet) + (0.4 * scaledStage) + (0.2 * scaledGrapeType);
      return { ...r, pwdi };
    });

    // Relative scoring: rank blocks with a PWDI and split into quartiles -
    // "critical" is the top 25% of blocks by water need today, not a fixed
    // PWDI cutoff (need is relative across the farm, not absolute). Blocks
    // with an unknown growth stage are excluded from this ranking pool
    // entirely (see below, they're forced to 'low' regardless of PWDI) so
    // they don't skew the quartile cutoffs for blocks with real stage data.
    const ranked = [...scored]
      .filter(r => r.pwdi != null && r.stage !== 'Unknown')
      .sort((a, b) => b.pwdi - a.pwdi);
    const bucketByBlock = {};
    const n = ranked.length;
    ranked.forEach((r, i) => {
      const percentile = n > 1 ? i / (n - 1) : 0;
      bucketByBlock[r.block] =
        percentile <= 0.25 ? 'critical' :
        percentile <= 0.5 ? 'high' :
        percentile <= 0.75 ? 'moderate' : 'low';
    });

    // The Net Irrigation Req progress bar's width is its own magnitude
    // relative to the highest block, independent of the PWDI priority bucket.
    const reqMax = Math.max(0, ...scored.map(r => r.netIrrigationReq ?? 0));
    const rows = scored.map(r => {
      const ratio = (r.netIrrigationReq != null && reqMax > 0) ? r.netIrrigationReq / reqMax : 0;
      // Unknown growth stage means we can't reliably judge this block's
      // water demand - default it to low priority rather than let a high
      // PWDI (from irrigation need/grape type alone) rank it urgent.
      const priorityKey = r.stage === 'Unknown' ? 'low' : (r.pwdi != null ? bucketByBlock[r.block] : 'low');
      const priorityMeta = PRIORITY_LEVELS.find(p => p.key === priorityKey) || PRIORITY_LEVELS[PRIORITY_LEVELS.length - 1];
      return { ...r, ratio, priority: priorityMeta.label, color: priorityMeta.color };
    });

    const sorters = {
      deficit: (a, b) => (b.netIrrigationReq ?? -1) - (a.netIrrigationReq ?? -1),
      volume: (a, b) => (b.requiredVolume ?? -1) - (a.requiredVolume ?? -1),
      priority: (a, b) => (b.pwdi ?? -1) - (a.pwdi ?? -1)
    };
    return rows.sort(sorters[sortBy]);
  }, [uniqueBlocks, latestDailyByBlock, ksValues, sortBy]);

  const topPriority = priorityRows[0] || null;

  // How many blocks currently fall into each priority level - a
  // vineyard-wide "how urgent is today" view, from the same priority
  // ranking the table above already computes.
  const priorityBreakdown = useMemo(() => {
    return PRIORITY_LEVELS.map(level => ({
      label: level.label,
      color: level.color,
      count: priorityRows.filter(r => r.priority === level.label).length
    }));
  }, [priorityRows]);
  const breakdownMax = Math.max(1, ...priorityBreakdown.map(b => b.count));

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

      {dailyStatisticsLoading && !dailyStatistics && (
        <div className="table-card" style={{ padding: '12px 15px', fontSize: '0.85em', color: '#666' }}>
          Loading daily statistics...
        </div>
      )}

      {/* Priority Table - fills the space above the map/chart/chat row, scrolls internally if needed */}
      <div className="table-card">
        <div className="priority-table-scroll" ref={tableScrollRef}>
          <table className="priority-table">
            <thead>
              <tr>
                <th><HelpTip text="Vineyard block identifier.">Block</HelpTip></th>
                <th><HelpTip text="Grape variety planted in this block.">Cultivar</HelpTip></th>
                <th><HelpTip text="Current growth stage of the vines in this block.">Stage</HelpTip></th>
                <th><HelpTip text="How much water this block needs, from the latest Irrigation_net reading.">Net Irrigation Req. (mm)</HelpTip></th>
                <th><HelpTip text="Total irrigation volume recommended for this block, adjusted for growth stage.">Required Volume</HelpTip></th>
                <th><HelpTip text={`How long the drip system needs to run to deliver the Net Irrigation Req., assuming a generic vineyard drip setup (${DRIP_EMITTER_FLOW_RATE_L_PER_HOUR} L/hour emitters, ${DRIP_EMITTER_SPACING_M}m apart, ${DRIP_ROW_SPACING_M}m row spacing) - exact specs for this farm aren't available.`}>Irrigation Time</HelpTip></th>
                <th><HelpTip text="Plant Water Deficit Index (PWDI) - combines water need, growth stage and grape variety, ranked relative to the rest of the vineyard.">Priority</HelpTip></th>
              </tr>
            </thead>
            <tbody>
              {priorityRows.map((row) => (
                <tr
                  key={row.block}
                  data-block={row.block}
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
                  <td>{row.irrigationTimeMinutes != null ? `${row.irrigationTimeMinutes.toFixed(1)} min` : '—'}</td>
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
      <div
        className="planner-dashboard-grid"
        style={{
          // minmax() keeps the graph/chat columns from squeezing so thin
          // their own content (bars, chat bubbles) becomes unreadable.
          gridTemplateColumns: mapExpanded ? 'minmax(0, 2fr) minmax(170px, 0.5fr) minmax(220px, 0.7fr)' : '1.1fr 0.8fr 1.3fr',
          height: mapExpanded ? '650px' : '380px',
          transition: 'grid-template-columns 0.3s ease, height 0.3s ease'
        }}
      >

        {/* 1. Map Widget - same vineyard block map as the Fields tab */}
        <div className="widget-card map-widget">
          <h3><HelpTip text="Map of the selected block's boundary.">Field View{selectedField ? ` - ${selectedField.BLOCK}` : ''}</HelpTip></h3>
          <div className="map-inner" style={{ position: 'relative' }}>
            <HelpTip
              text={mapExpanded ? 'Shrink the map back down.' : 'Make the map bigger and the other panels smaller.'}
              style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}
            >
              <button
                type="button"
                onClick={() => setMapExpanded(v => !v)}
                aria-label={mapExpanded ? 'Collapse map' : 'Expand map'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: 'white', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
              >
                {mapExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </HelpTip>
            <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <LayersControl position="topleft">
                <LayersControl.BaseLayer checked name="Satellite Imagery (Esri)">
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                </LayersControl.BaseLayer>

                {/* Uploaded GeoTIFF overlays - above the basemap, below the GeoJSON blocks */}
                <TifOverlays />

                <LayersControl.Overlay checked name="Vineyard Blocks">
                  {studyAreaGeojson && (
                    <GeoJSON
                      key={`irrigation-planner-blocks-${selectedField?.BLOCK}`}
                      data={studyAreaGeojson}
                      style={blockStyle}
                      onEachFeature={onEachFeature}
                    />
                  )}
                </LayersControl.Overlay>
              </LayersControl>

              {/* Forces the overlay checkboxes into a fixed order (see component
                  for why this can't just be JSX declaration order) */}
              <OrderedOverlaysControl order={['Vineyard Blocks', 'Most recent Sat Imagery', 'Net Irrigation Required']} />

              <MapFlyTo selectedField={selectedField} />
              <MapResizeHandler trigger={`${selectedField?.BLOCK}-${mapExpanded}`} />
            </MapContainer>
          </div>
        </div>

        {/* 2. Graph Widget - vineyard-wide priority breakdown, from the table above */}
        <div className="widget-card graph-widget">
          <h3><HelpTip text="How many blocks currently fall into each priority level.">Priority Breakdown</HelpTip></h3>
          <div className="h-bar-graph">
            {priorityBreakdown.map((level) => (
              <div key={level.label} className="h-bar-row">
                <span className="h-bar-label">{level.label}</span>
                <div className="h-bar-track">
                  <div
                    className="h-bar-fill"
                    style={{ width: `${(level.count / breakdownMax) * 100}%`, backgroundColor: level.color }}
                  ></div>
                </div>
                <span className="h-bar-value">{level.count}</span>
              </div>
            ))}
          </div>
          <p className="graph-caption">
            {priorityRows.length} block{priorityRows.length === 1 ? '' : 's'} total
          </p>
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
