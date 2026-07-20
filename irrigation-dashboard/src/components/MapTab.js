import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, LayersControl, ScaleControl, GeoJSON } from 'react-leaflet';
import MapFlyTo from './MapFlyTo';
import LabelVisibilityToggler from './LabelVisibilityToggler';
import CursorPosition from './CursorPosition';
import { netDeficitColor, evapotranspirationColor, ndviColor, ndwiColor, irrigationVolumeColor, gradientCss, NET_DEFICIT_LOW, NET_DEFICIT_HIGH, ET_LOW, ET_HIGH, NDVI_LOW, NDVI_HIGH, NDWI_LOW, NDWI_HIGH, IRRIGATION_LOW, IRRIGATION_HIGH } from '../utils/colorScale';
import { sumVRequiredByBlock } from '../utils/vRequired';
import { areaKm2ToHa } from '../utils/fieldMetrics';
import HelpTip from './HelpTip';

export default function MapTab({ studyAreaGeojson, selectedField, setSelectedField, fields, dailyIrrigation = [], ndviStats, ndwiSoilStats, vRequiredGeojson }) {
  // State for the fill opacity slider (0 to 1) - also drives the ET/Net Deficit/NDVI/NDWI/Irrigation overlays
  const [fillOpacity, setFillOpacity] = useState(0.5);
  // 'selection' (green/orange), 'et', 'deficit', 'ndvi', 'ndwi', or 'irrigation'
  const [colorMode, setColorMode] = useState('selection');

  // Most recent date present in the daily dataset, and each block's reading on that date.
  const latestDate = useMemo(() => {
    if (!dailyIrrigation.length) return null;
    return dailyIrrigation.reduce((max, r) => (r.Date > max ? r.Date : max), dailyIrrigation[0].Date);
  }, [dailyIrrigation]);

  const latestByBlock = useMemo(() => {
    const map = {};
    if (!latestDate) return map;
    dailyIrrigation.forEach(r => {
      if (r.Date === latestDate) map[r.Block_ID] = r;
    });
    return map;
  }, [dailyIrrigation, latestDate]);

  const etMax = useMemo(() => Math.max(0, ...Object.values(latestByBlock).map(r => r.ETa_mm ?? 0)), [latestByBlock]);
  const deficitMax = useMemo(() => Math.max(0, ...Object.values(latestByBlock).map(r => r.Net_Deficit_mm ?? 0)), [latestByBlock]);

  // Most recent satellite-pass date in the NDVI / NDWI datasets, and each block's reading on it.
  const latestNdviDate = useMemo(() => {
    if (!ndviStats?.dates?.length) return null;
    return ndviStats.dates.reduce((max, d) => (d > max ? d : max), ndviStats.dates[0]);
  }, [ndviStats]);
  const ndviByBlock = useMemo(() => ndviStats?.data?.[latestNdviDate] || {}, [ndviStats, latestNdviDate]);
  const ndviValues = useMemo(() => Object.values(ndviByBlock).map(b => b.mean).filter(Number.isFinite), [ndviByBlock]);
  const ndviMin = ndviValues.length ? Math.min(...ndviValues) : 0;
  const ndviMax = ndviValues.length ? Math.max(...ndviValues) : 1;

  const latestNdwiDate = useMemo(() => {
    if (!ndwiSoilStats?.dates?.length) return null;
    return ndwiSoilStats.dates.reduce((max, d) => (d > max ? d : max), ndwiSoilStats.dates[0]);
  }, [ndwiSoilStats]);
  const ndwiByBlock = useMemo(() => ndwiSoilStats?.data?.[latestNdwiDate] || {}, [ndwiSoilStats, latestNdwiDate]);
  const ndwiValues = useMemo(() => Object.values(ndwiByBlock).map(b => b.ndwi?.mean).filter(Number.isFinite), [ndwiByBlock]);
  const ndwiMin = ndwiValues.length ? Math.min(...ndwiValues) : 0;
  const ndwiMax = ndwiValues.length ? Math.max(...ndwiValues) : 1;

  // Total required irrigation volume per block (static - no date dimension in this dataset).
  const vRequiredByBlock = useMemo(() => sumVRequiredByBlock(vRequiredGeojson), [vRequiredGeojson]);
  const vRequiredMax = useMemo(() => Math.max(0, ...Object.values(vRequiredByBlock)), [vRequiredByBlock]);

  // Dynamic style application for the GeoJSON polygons
  const styleGeoJSON = (feature) => {
    const isSelected = selectedField && selectedField.BLOCK === feature.properties.BLOCK;

    if (colorMode === 'et' || colorMode === 'deficit' || colorMode === 'ndvi' || colorMode === 'ndwi' || colorMode === 'irrigation') {
      let fillColor;
      if (colorMode === 'et' || colorMode === 'deficit') {
        const record = latestByBlock[feature.properties.BLOCK];
        fillColor = colorMode === 'et'
          ? evapotranspirationColor(record?.ETa_mm, etMax)
          : netDeficitColor(record?.Net_Deficit_mm, deficitMax);
      } else if (colorMode === 'ndvi') {
        fillColor = ndviColor(ndviByBlock[feature.properties.BLOCK]?.mean, ndviMin, ndviMax);
      } else if (colorMode === 'ndwi') {
        fillColor = ndwiColor(ndwiByBlock[feature.properties.BLOCK]?.ndwi?.mean, ndwiMin, ndwiMax);
      } else {
        fillColor = irrigationVolumeColor(vRequiredByBlock[feature.properties.BLOCK], vRequiredMax);
      }
      return {
        fillColor,
        weight: isSelected ? 4 : 1,   // selection now shown via border, since fill carries data
        opacity: 1,
        color: isSelected ? '#ff7800' : 'white',
        fillOpacity
      };
    }

    return {
      fillColor: isSelected ? '#ff7800' : '#2ca25f', // Highlight color if selected
      weight: 2,         // Outline thickness (remains constant)
      opacity: 1,        // Outline opacity (remains solid)
      color: 'white',    // Outline color
      fillOpacity: fillOpacity // Dynamic fill opacity controlled by the slider
    };
  };

  // Handle clicking directly on a map shape
  const onEachFeature = (feature, layer) => {
    // Block number label - hidden/shown by LabelVisibilityToggler based on zoom.
    layer.bindTooltip(feature.properties.BLOCK, {
      permanent: true,
      direction: 'center',
      className: 'block-label'
    });

    layer.on({
      click: () => {
        // Merge in the full CSV record (Area, Farm, season, etc.) when we have one,
        // so the info box below shows more than just what's in the GeoJSON properties.
        const fullRecord = fields?.find(f => f.BLOCK === feature.properties.BLOCK);
        const clickedRecord = fullRecord || feature.properties;
        // Clicking the already-selected block deselects it instead of adding a
        // separate "clear" button - keeps the map uncluttered.
        setSelectedField(prev => (prev && prev.BLOCK === clickedRecord.BLOCK) ? null : clickedRecord);
      }
    });
  };

  return (
    <div className="map-wrapper" style={{ position: 'relative', height: '100%', width: '100%' }}>
      
      {/* Opacity Slider + Symbology UI Overlay */}
      <div className="opacity-slider-control" style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000, background: 'white', padding: '10px', borderRadius: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', minWidth: '190px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
          {[
            { key: 'selection', label: 'Selection', help: 'Just highlight the selected block.' },
            { key: 'et', label: 'ET', help: 'Colour every block by evapotranspiration.' },
            { key: 'deficit', label: 'Net Deficit', help: 'Colour every block by net water deficit.' },
            { key: 'ndvi', label: 'NDVI', help: 'Colour every block by plant health.' },
            { key: 'ndwi', label: 'NDWI', help: 'Colour every block by soil moisture.' },
            { key: 'irrigation', label: 'Irrigation Vol.', help: 'Colour every block by irrigation volume required.' }
          ].map(({ key, label, help }) => (
            <HelpTip key={key} text={help} style={{ flex: '1 1 40%' }}>
              <button
                type="button"
                onClick={() => setColorMode(key)}
                style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: colorMode === key ? '#2ca25f' : '#f0f0f0', color: colorMode === key ? 'white' : '#333' }}
              >
                {label}
              </button>
            </HelpTip>
          ))}
        </div>
        <HelpTip text="How solid the colour overlay looks on the map." className="help-tip-block">
          <label htmlFor="opacity">Fill Opacity: {Math.round(fillOpacity * 100)}%</label>
        </HelpTip>
        <input
          id="opacity"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={fillOpacity}
          onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
          style={{ width: '100%', display: 'block', marginTop: '5px' }}
        />
      </div>

      {/* Attribute Info Box - shows details for the clicked/selected block */}
      {selectedField && (
        <div className="field-info-box" style={{ position: 'absolute', top: '20px', left: '70px', zIndex: 1000, background: 'white', padding: '10px 14px', borderRadius: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', minWidth: '190px' }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Block {selectedField.BLOCK}</h4>
          <table style={{ fontSize: '12px', width: '100%' }}>
            <tbody>
              {selectedField.Farm && (
                <tr><td style={{ color: '#666', paddingRight: '10px' }}>Farm</td><td>{selectedField.Farm}</td></tr>
              )}
              <tr><td style={{ color: '#666', paddingRight: '10px' }}>Cultivar</td><td>{selectedField.CULTIVAR}</td></tr>
              {selectedField.Area != null && (
                <tr><td style={{ color: '#666', paddingRight: '10px' }}>Area</td><td>{areaKm2ToHa(selectedField.Area)?.toFixed(3)} ha</td></tr>
              )}
              {selectedField.season && (
                <tr><td style={{ color: '#666', paddingRight: '10px' }}>Season</td><td>{selectedField.season}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Dynamic Legend Overlay */}
      <div className="map-legend" style={{ position: 'absolute', bottom: '30px', right: '20px', zIndex: 1000, background: 'white', padding: '10px', borderRadius: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', minWidth: '170px' }}>
        <h4 style={{ margin: '0 0 5px 0', fontSize: '14px' }}>Legend</h4>

        {colorMode === 'selection' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
              <div style={{ width: '15px', height: '15px', background: `rgba(44, 162, 95, ${fillOpacity})`, border: '2px solid white' }}></div>
              <span>Vineyard Blocks</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', marginTop: '5px' }}>
              <div style={{ width: '15px', height: '15px', background: `rgba(255, 120, 0, ${fillOpacity})`, border: '2px solid white' }}></div>
              <span>Selected Block</span>
            </div>
          </>
        )}

        {colorMode === 'et' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Evapotranspiration (mm){latestDate ? ` - ${latestDate}` : ''}</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(ET_LOW, ET_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>0</span>
              <span>{etMax.toFixed(1)}</span>
            </div>
          </>
        )}

        {colorMode === 'deficit' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Net Deficit (mm){latestDate ? ` - ${latestDate}` : ''}</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(NET_DEFICIT_LOW, NET_DEFICIT_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>0</span>
              <span>{deficitMax.toFixed(1)}</span>
            </div>
          </>
        )}

        {colorMode === 'ndvi' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>NDVI{latestNdviDate ? ` - ${latestNdviDate}` : ''}</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(NDVI_LOW, NDVI_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>{ndviMin.toFixed(2)}</span>
              <span>{ndviMax.toFixed(2)}</span>
            </div>
          </>
        )}

        {colorMode === 'ndwi' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>NDWI{latestNdwiDate ? ` - ${latestNdwiDate}` : ''}</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(NDWI_LOW, NDWI_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>{ndwiMin.toFixed(2)}</span>
              <span>{ndwiMax.toFixed(2)}</span>
            </div>
          </>
        )}

        {colorMode === 'irrigation' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Irrigation Volume Required (m³)</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(IRRIGATION_LOW, IRRIGATION_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>0</span>
              <span>{Math.round(vRequiredMax).toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      <MapContainer center={[-33.92, 18.86]} zoom={14} style={{ height: '100%', width: '100%' }}>
        
        {/* Dynamic Scale Bar */}
        <ScaleControl position="bottomleft" imperial={false} />

        {/* Live lat/lng readout, docked next to the scale bar */}
        <CursorPosition />

        {/* Shows/hides the block-number labels depending on how zoomed in we are */}
        <LabelVisibilityToggler />

        {/* 2 Basemaps to choose from */}
        <LayersControl position="topleft">
          <LayersControl.BaseLayer checked name="Satellite Imagery (Esri)">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Street Map (OSM)">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
          </LayersControl.BaseLayer>

          {/* Vineyard Blocks - green by default, orange when selected, opacity controlled by the slider */}
          <LayersControl.Overlay checked name="Vineyard Blocks">
          {studyAreaGeojson && (
            <GeoJSON
              // Remounts the layer whenever the selection or opacity changes so Leaflet
              // actually repaints - a stale style prop alone doesn't force a redraw.
              key={`blocks-${selectedField?.BLOCK}-${fillOpacity}-${colorMode}-${latestDate}-${latestNdviDate}-${latestNdwiDate}-${vRequiredMax}`}
              data={studyAreaGeojson}
              style={styleGeoJSON}
              onEachFeature={onEachFeature}
            />
          )}
          </LayersControl.Overlay>
        </LayersControl>

        {/* This silently listens for selectedField changes and zooms the map */}
        <MapFlyTo selectedField={selectedField} />

      </MapContainer>
    </div>
  );
}