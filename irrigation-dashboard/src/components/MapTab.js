import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, LayersControl, ScaleControl, GeoJSON } from 'react-leaflet';
import MapFlyTo from './MapFlyTo';
import LabelVisibilityToggler from './LabelVisibilityToggler';
import CursorPosition from './CursorPosition';
import { netDeficitColor, evapotranspirationColor, gradientCss, NET_DEFICIT_LOW, NET_DEFICIT_HIGH, ET_LOW, ET_HIGH } from '../utils/colorScale';

export default function MapTab({ studyAreaGeojson, selectedField, setSelectedField, fields, dailyIrrigation = [] }) {
  // State for the fill opacity slider (0 to 1) - also drives the ET/Net Deficit overlays
  const [fillOpacity, setFillOpacity] = useState(0.5);
  // 'selection' (green/orange), 'et' (Evapotranspiration), or 'deficit' (Net Deficit)
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

  // Dynamic style application for the GeoJSON polygons
  const styleGeoJSON = (feature) => {
    const isSelected = selectedField && selectedField.BLOCK === feature.properties.BLOCK;

    if (colorMode === 'et' || colorMode === 'deficit') {
      const record = latestByBlock[feature.properties.BLOCK];
      const fillColor = colorMode === 'et'
        ? evapotranspirationColor(record?.ETa_mm, etMax)
        : netDeficitColor(record?.Net_Deficit_mm, deficitMax);
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
        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
          {[
            { key: 'selection', label: 'Selection' },
            { key: 'et', label: 'ET' },
            { key: 'deficit', label: 'Net Deficit' }
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setColorMode(key)}
              style={{ flex: 1, padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: colorMode === key ? '#2ca25f' : '#f0f0f0', color: colorMode === key ? 'white' : '#333' }}
            >
              {label}
            </button>
          ))}
        </div>
        <label htmlFor="opacity">Fill Opacity: {Math.round(fillOpacity * 100)}%</label>
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
                <tr><td style={{ color: '#666', paddingRight: '10px' }}>Area</td><td>{Number(selectedField.Area).toFixed(3)} ha</td></tr>
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
              key={`blocks-${selectedField?.BLOCK}-${fillOpacity}-${colorMode}-${latestDate}`}
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