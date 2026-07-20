import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import MapFlyTo from './components/MapFlyTo';
import MapResizeHandler from './components/MapResizeHandler';
import WeatherWidget from './components/WeatherWidget';
import ForecastPanel from './components/ForecastPanel';
import DeficitEtChart from './components/DeficitEtChart';
import { netDeficitColor, evapotranspirationColor, ndviColor, ndwiColor, irrigationVolumeColor, gradientCss, NET_DEFICIT_LOW, NET_DEFICIT_HIGH, ET_LOW, ET_HIGH, NDVI_LOW, NDVI_HIGH, NDWI_LOW, NDWI_HIGH, IRRIGATION_LOW, IRRIGATION_HIGH } from './utils/colorScale';
import { findClosestDate, addDays } from './utils/dateLookup';
import { sumVRequiredByBlock } from './utils/vRequired';
import { formatSeason, ndviToHealth } from './utils/fieldMetrics';
import { deriveGrowthStage } from './utils/growthStage';
import HelpTip from './components/HelpTip';

// Stable reference for the 'forecast' mode, which has no backing dataset yet -
// a fresh [] literal on every render would break the useMemo hooks below.
const EMPTY_ARRAY = [];

export default function NowScreen({ field, fields = [], setSelectedField, studyAreaGeojson, weeklyIrrigation = [], ndviStats, ndwiSoilStats, vRequiredGeojson, phenoData = [], mlReadyData, mlReadyLoading, ensureMlReadyDataset, dailyStatistics, dailyStatisticsLoading, ensureDailyStatistics }) {
  const [dataMode, setDataMode] = useState('weekly');
  const [selectedDate, setSelectedDate] = useState(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  // 'selection' (yellow highlight), 'et' (Evapotranspiration), or 'deficit' (Net Deficit)
  const [colorMode, setColorMode] = useState('selection');

  // Daily mode reads from Full_final_deduped.json - a richer per-block/per-day
  // dataset (ETa, Net Deficit, Irrigation Net, Volume, NDVI, NDWI,
  // Ks_current_mean, Growth Stage, Season all together) rather than
  // stitching together several sources.
  const dailyForBlock = useMemo(() => {
    if (!field || !dailyStatistics) return [];
    return dailyStatistics
      .filter(d => d.Block_ID === field.BLOCK)
      .sort((a, b) => a.Date.localeCompare(b.Date));
  }, [dailyStatistics, field]);

  const weeklyForBlock = useMemo(() => {
    if (!field) return [];
    return weeklyIrrigation
      .filter(d => d.Block_ID === field.BLOCK)
      .sort((a, b) => a.Date.localeCompare(b.Date));
  }, [weeklyIrrigation, field]);

  // 'forecast' has no backing dataset yet - falls through to an empty series,
  // which naturally hides the date slider/picker and shows '—' in the KPIs below.
  const activeSeries = dataMode === 'daily' ? dailyForBlock : dataMode === 'weekly' ? weeklyForBlock : EMPTY_ARRAY;
  const availableDates = useMemo(() => activeSeries.map(d => d.Date), [activeSeries]);

  // Net Deficit/ET trend chart - the week either side of whatever date is selected.
  const chartSeries = useMemo(() => {
    if (!selectedDate) return EMPTY_ARRAY;
    const from = addDays(selectedDate, -7);
    const to = addDays(selectedDate, 7);
    return activeSeries.filter(d => d.Date >= from && d.Date <= to);
  }, [activeSeries, selectedDate]);

  // Every block's reading on the selected date, for the ET/Net Deficit map overlays.
  const activeFullSeries = dataMode === 'daily' ? (dailyStatistics || EMPTY_ARRAY) : dataMode === 'weekly' ? weeklyIrrigation : EMPTY_ARRAY;
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

  // Total required irrigation volume per block (static - no date dimension in this dataset).
  const vRequiredByBlock = useMemo(() => sumVRequiredByBlock(vRequiredGeojson), [vRequiredGeojson]);
  const vRequiredMaxAll = useMemo(() => Math.max(0, ...Object.values(vRequiredByBlock)), [vRequiredByBlock]);

  // Each block's most recently recorded Kc (crop coefficient) - the Forecast tab
  // holds this constant across the live 7-day Open-Meteo forecast.
  const kcByBlock = useMemo(() => {
    const latestByBlock = {};
    (mlReadyData || []).forEach(r => {
      const cur = latestByBlock[r.Block_ID];
      if (!cur || r.Date > cur.Date) latestByBlock[r.Block_ID] = r;
    });
    const map = {};
    Object.entries(latestByBlock).forEach(([block, r]) => {
      map[block] = { kc: r.Kc, date: r.Date };
    });
    return map;
  }, [mlReadyData]);

  // ml_ready_dataset.json is large, so it's only fetched once the user actually opens Forecast.
  useEffect(() => {
    if (dataMode === 'forecast') ensureMlReadyDataset();
  }, [dataMode, ensureMlReadyDataset]);

  // Full_final_deduped.json is even larger, so it's only fetched once Daily mode is opened.
  useEffect(() => {
    if (dataMode === 'daily') ensureDailyStatistics();
  }, [dataMode, ensureDailyStatistics]);

  // Whenever the block or the weekly/daily mode changes, snap to the most recent
  // available date unless the current selection is still valid for the new series.
  useEffect(() => {
    setSelectedDate(prev => (prev && availableDates.includes(prev)) ? prev : (availableDates[availableDates.length - 1] || null));
  }, [availableDates]);

  if (!field) return <div className="loading">Select a field to view data.</div>;

  const selectedIndex = Math.max(0, availableDates.indexOf(selectedDate));
  const currentRecord = activeSeries[selectedIndex] || null;
  // Both Full_final_deduped.json (daily) and Weekly_accumulated.json (weekly)
  // carry an exact Mean_NDVI/Mean_NDWI reading per record, so both modes
  // read straight from currentRecord rather than the sparse satellite-pass
  // lookup that was needed before Weekly_accumulated.json existed.
  const currentNdvi = currentRecord?.Mean_NDVI ?? null;
  const currentNdwi = currentRecord?.Mean_NDWI ?? null;
  const currentSeason = formatSeason(currentRecord?.Season) || field.season || null;
  const plantHealth = ndviToHealth(currentNdvi);
  // Real Ks_current_mean value (crop water-stress coefficient) from the
  // dataset, for both daily and weekly records.
  const stress = currentRecord?.Ks_current_mean != null ? { label: currentRecord.Ks_current_mean.toFixed(2), className: '' } : null;
  // The block's phenology record for whichever season is currently in view -
  // falls back to any record for the block if that exact season isn't found.
  const currentPheno = phenoData.find(r => r['Block ID'] === field.BLOCK && r.season === currentSeason)
    || phenoData.find(r => r['Block ID'] === field.BLOCK)
    || null;
  const growthStage = dataMode === 'daily'
    ? (currentRecord?.Growth_Stage || 'Unknown')
    : deriveGrowthStage(selectedDate, currentPheno);

  const handleDatePick = (dateStr) => {
    if (!dateStr || availableDates.length === 0) return;
    setSelectedDate(findClosestDate(availableDates, dateStr));
  };

  // Highlight the selected block in light yellow; other blocks just get a faint outline.
  // In ET/Net Deficit/NDVI/NDWI/Irrigation mode, fill shows the data instead and selection is a border only.
  const blockStyle = (feature) => {
    const isSelected = feature.properties.BLOCK === field.BLOCK;

    if (colorMode === 'et' || colorMode === 'deficit' || colorMode === 'ndvi' || colorMode === 'ndwi' || colorMode === 'irrigation') {
      let fillColor;
      if (colorMode === 'et' || colorMode === 'deficit') {
        const record = recordsForSelectedDate[feature.properties.BLOCK];
        fillColor = colorMode === 'et'
          ? evapotranspirationColor(record?.ETa_mm, etMaxAll)
          : netDeficitColor(record?.Net_Deficit_mm, deficitMaxAll);
      } else if (colorMode === 'ndvi') {
        fillColor = ndviColor(ndviByBlockAtDate[feature.properties.BLOCK]?.mean, ndviMinAll, ndviMaxAll);
      } else if (colorMode === 'ndwi') {
        fillColor = ndwiColor(ndwiByBlockAtDate[feature.properties.BLOCK]?.ndwi?.mean, ndwiMinAll, ndwiMaxAll);
      } else {
        fillColor = irrigationVolumeColor(vRequiredByBlock[feature.properties.BLOCK], vRequiredMaxAll);
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
                  <HelpTip text="View data totalled over each week.">
                    <button
                      type="button"
                      onClick={() => setDataMode('weekly')}
                      style={{ padding: '4px 10px', fontSize: '12px', border: 'none', cursor: 'pointer', background: dataMode === 'weekly' ? '#2ca25f' : '#f0f0f0', color: dataMode === 'weekly' ? 'white' : '#333' }}
                    >
                      Weekly
                    </button>
                  </HelpTip>
                  <HelpTip text="View data for a single day at a time.">
                    <button
                      type="button"
                      onClick={() => setDataMode('daily')}
                      style={{ padding: '4px 10px', fontSize: '12px', border: 'none', cursor: 'pointer', background: dataMode === 'daily' ? '#2ca25f' : '#f0f0f0', color: dataMode === 'daily' ? 'white' : '#333' }}
                    >
                      Daily
                    </button>
                  </HelpTip>
                  <HelpTip text="View a live 7-day irrigation forecast using weather data.">
                    <button
                      type="button"
                      onClick={() => setDataMode('forecast')}
                      style={{ padding: '4px 10px', fontSize: '12px', border: 'none', cursor: 'pointer', background: dataMode === 'forecast' ? '#2ca25f' : '#f0f0f0', color: dataMode === 'forecast' ? 'white' : '#333' }}
                    >
                      Forecast
                    </button>
                  </HelpTip>
                </div>

                <HelpTip text="Jump straight to a specific date.">
                  <input
                    type="date"
                    value={selectedDate || ''}
                    min={availableDates[0] || undefined}
                    max={availableDates[availableDates.length - 1] || undefined}
                    onChange={(e) => handleDatePick(e.target.value)}
                    style={{ fontSize: '12px', padding: '3px 6px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </HelpTip>
              </div>
            </div>

            {availableDates.length > 0 && (
              <div style={{ margin: '10px 0 4px' }}>
                <HelpTip text="Drag to scrub through the available dates." className="help-tip-block">
                  <input
                    type="range"
                    min={0}
                    max={availableDates.length - 1}
                    value={selectedIndex}
                    onChange={(e) => setSelectedDate(availableDates[Number(e.target.value)])}
                    style={{ width: '100%' }}
                  />
                </HelpTip>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' }}>
                  <span>{availableDates[0]}</span>
                  <span style={{ fontWeight: 'bold', color: '#333' }}>{selectedDate}</span>
                  <span>{availableDates[availableDates.length - 1]}</span>
                </div>
              </div>
            )}

            <table>
              <tbody>
                <tr><td><HelpTip text="Grape variety planted in this block.">Cultivar</HelpTip></td><td>{field.CULTIVAR}</td></tr>
                <tr><td><HelpTip text="Size of this block in hectares.">Area</HelpTip></td><td>{Number(field.Area).toFixed(3)} ha</td></tr>
                {/* New data from vineyard_STAR.csv */}
                <tr><td><HelpTip text="Growing season this record belongs to.">Season</HelpTip></td><td>{currentSeason || 'Current'}</td></tr>
                <tr><td><HelpTip text="Where this block is in its growing season, as of the date above.">Growth Stage</HelpTip></td><td>{growthStage}</td></tr>
                <tr>
                  <td><HelpTip text="Overall canopy health, from satellite NDVI.">Plant Health</HelpTip></td>
                  <td className={['Excellent', 'Good'].includes(plantHealth) ? 'status-good' : 'status-warning'}>
                    {plantHealth}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card map-container-card" style={{ height: mapExpanded ? '650px' : '300px', position: 'relative', transition: 'height 0.3s ease' }}>
            <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000, display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '160px' }}>
              {[
                { key: 'selection', label: 'Sel', help: 'Just highlight the selected block.' },
                { key: 'et', label: 'ET', help: 'Colour every block by evapotranspiration.' },
                { key: 'deficit', label: 'Deficit', help: 'Colour every block by net water deficit.' },
                { key: 'ndvi', label: 'NDVI', help: 'Colour every block by plant health.' },
                { key: 'ndwi', label: 'NDWI', help: 'Colour every block by soil moisture.' },
                { key: 'irrigation', label: 'Irr. Vol.', help: 'Colour every block by irrigation volume required.' }
              ].map(({ key, label, help }) => (
                <HelpTip key={key} text={help}>
                  <button
                    type="button"
                    onClick={() => setColorMode(key)}
                    style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: colorMode === key ? '#2ca25f' : 'white', color: colorMode === key ? 'white' : '#333', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
                  >
                    {label}
                  </button>
                </HelpTip>
              ))}
            </div>

            <HelpTip text="Make the map bigger and the stats smaller.">
              <button
                type="button"
                onClick={() => setMapExpanded(v => !v)}
                style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, background: 'white', border: '1px solid #ccc', borderRadius: '4px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
              >
                {mapExpanded ? 'Collapse Map' : 'Expand Map'}
              </button>
            </HelpTip>

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
                {colorMode === 'irrigation' && (
                  <>
                    <div style={{ color: '#666', marginBottom: '3px' }}>Irrigation Volume Required (m³)</div>
                    <div style={{ height: '8px', borderRadius: '3px', background: gradientCss(IRRIGATION_LOW, IRRIGATION_HIGH) }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', marginTop: '2px' }}>
                      <span>0</span>
                      <span>{Math.round(vRequiredMaxAll).toLocaleString()}</span>
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
                  key={`fields-tab-blocks-${field.BLOCK}-${colorMode}-${selectedDate}-${dataMode}-${indexDate}-${vRequiredMaxAll}`}
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

        {/* Right Column: KPIs & Weather (or the 7-day Forecast) */}
        <div className="col-right" style={{ overflow: 'hidden' }}>
          {dataMode === 'forecast' ? (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>
                <HelpTip text="Forecasted irrigation need for the next 7 days, using live weather data.">7-Day Irrigation Forecast</HelpTip>
              </h3>
              <ForecastPanel
                lat={lat}
                lng={lng}
                kcInfo={kcByBlock[field.BLOCK] || null}
                kcLoading={mlReadyLoading}
              />
            </div>
          ) : (
            <>
              {dataMode === 'daily' && dailyStatisticsLoading && !dailyStatistics && (
                <div className="card" style={{ marginBottom: '16px', fontSize: '0.9em', color: '#666' }}>
                  Loading daily statistics...
                </div>
              )}
              <div className="kpi-grid" style={{ gridTemplateColumns: mapExpanded ? '1fr' : 'repeat(3, 1fr)', transition: 'grid-template-columns 0.3s ease' }}>
                <div className="card kpi">
                  <HelpTip text={`Net irrigation needed for this ${dataMode === 'daily' ? 'day' : 'week'}.`} className="label"><span>Irrigation Net</span></HelpTip>
                  <span className="value">{currentRecord?.Irrigation_net != null ? currentRecord.Irrigation_net.toFixed(2) : '—'} <span className="unit">mm</span></span>
                </div>
                <div className="card kpi">
                  <HelpTip text="How much water this block's vines are losing to the air." className="label"><span>Evapotranspiration</span></HelpTip>
                  <span className="value">
                    {currentRecord ? currentRecord.ETa_mm : '—'} {currentRecord && <span className="unit">mm/{dataMode === 'daily' ? 'day' : 'week'}</span>}
                  </span>
                </div>
                <div className="card kpi">
                  <HelpTip text={`Total irrigation volume needed for this ${dataMode === 'daily' ? 'day' : 'week'}.`} className="label"><span>Volume (M3)</span></HelpTip>
                  <span className="value">{currentRecord?.Volume_m3 != null ? currentRecord.Volume_m3.toFixed(2) : '—'} <span className="unit">m³</span></span>
                </div>
                <div className="card kpi">
                  <HelpTip text="Satellite soil moisture index - higher means wetter soil." className="label"><span>NDWI</span></HelpTip>
                  <span className="value">{currentNdwi != null ? currentNdwi.toFixed(2) : '—'}</span>
                </div>
                <div className={`card kpi ${stress ? stress.className : ''}`}>
                  <HelpTip text="Crop water-stress coefficient (Ks) - closer to 1 means little to no water stress." className="label"><span>Environmental Stress</span></HelpTip>
                  <span className="value">{stress ? stress.label : '—'}</span>
                </div>
                <div className="card kpi">
                  <HelpTip text="Satellite plant health index - higher means healthier canopy." className="label"><span>NDVI Index</span></HelpTip>
                  <span className="value">{currentNdvi != null ? currentNdvi.toFixed(2) : '—'}</span>
                </div>
              </div>

              <div className="card weather-card">
                <WeatherWidget lat={lat} lng={lng} date={selectedDate} />
              </div>

              <div className="card">
                <h3 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1rem' }}>
                  <HelpTip text="Net water deficit and evapotranspiration for this block, one week before and one week after the selected date.">
                    Deficit &amp; Evapotranspiration Trend
                  </HelpTip>
                </h3>
                <DeficitEtChart series={chartSeries} selectedDate={selectedDate} unit={dataMode} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}