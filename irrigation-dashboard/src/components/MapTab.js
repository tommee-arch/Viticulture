import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, LayersControl, ScaleControl, GeoJSON } from 'react-leaflet';
import MapFlyTo from './MapFlyTo';
import LabelVisibilityToggler from './LabelVisibilityToggler';
import CursorPosition from './CursorPosition';
import TifOverlays from './TifOverlays';
import OrderedOverlaysControl from './OrderedOverlaysControl';
import { irrigationNetColor, evapotranspirationColor, ndviColor, ndwiColor, irrigationVolumeColor, gradientCss, IRRIGATION_NET_LOW, IRRIGATION_NET_HIGH, ET_LOW, ET_HIGH, NDVI_LOW, NDVI_HIGH, NDWI_LOW, NDWI_HIGH, IRRIGATION_LOW, IRRIGATION_HIGH } from '../utils/colorScale';
import { areaKm2ToHa, formatSeason } from '../utils/fieldMetrics';
import HelpTip from './HelpTip';

export default function MapTab({ studyAreaGeojson, selectedField, setSelectedField, fields, dailyStatistics, ensureDailyStatistics }) {
  // State for the fill opacity slider (0 to 1) - also drives the ET/Irrigation Net/NDVI/NDWI/Irrigation overlays
  const [fillOpacity, setFillOpacity] = useState(0.5);
  // 'selection' (green/orange), 'et', 'irrigationNet', 'ndvi', 'ndwi', or 'irrigation'
  const [colorMode, setColorMode] = useState('selection');

  // Full_final_deduped.json is only fetched once something needs it - the
  // Home tab map's ET/Irrigation Net/NDVI/NDWI/Irrigation Vol. overlays are
  // one of those things.
  useEffect(() => {
    ensureDailyStatistics();
  }, [ensureDailyStatistics]);

  // Each block's most recent record in Full_final_deduped.json - ET,
  // Irrigation Net, NDVI, NDWI and Volume are all read straight from here
  // (ETa_mm, Irrigation_net, Mean_NDVI, Mean_NDWI, Volume_m3 respectively).
  const latestByBlock = useMemo(() => {
    const map = {};
    (dailyStatistics || []).forEach(r => {
      const cur = map[r.Block_ID];
      if (!cur || r.Date > cur.Date) map[r.Block_ID] = r;
    });
    return map;
  }, [dailyStatistics]);

  const latestDate = useMemo(() => {
    const dates = Object.values(latestByBlock).map(r => r.Date);
    return dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null;
  }, [latestByBlock]);

  const etMax = useMemo(() => Math.max(0, ...Object.values(latestByBlock).map(r => r.ETa_mm ?? 0)), [latestByBlock]);

  const irrigationNetValues = useMemo(() => Object.values(latestByBlock).map(r => r.Irrigation_net).filter(Number.isFinite), [latestByBlock]);
  const irrigationNetMin = irrigationNetValues.length ? Math.min(...irrigationNetValues) : 0;
  const irrigationNetMax = irrigationNetValues.length ? Math.max(...irrigationNetValues) : 1;

  const ndviValues = useMemo(() => Object.values(latestByBlock).map(r => r.Mean_NDVI).filter(Number.isFinite), [latestByBlock]);
  const ndviMin = ndviValues.length ? Math.min(...ndviValues) : 0;
  const ndviMax = ndviValues.length ? Math.max(...ndviValues) : 1;

  const ndwiValues = useMemo(() => Object.values(latestByBlock).map(r => r.Mean_NDWI).filter(Number.isFinite), [latestByBlock]);
  const ndwiMin = ndwiValues.length ? Math.min(...ndwiValues) : 0;
  const ndwiMax = ndwiValues.length ? Math.max(...ndwiValues) : 1;

  const volumeValues = useMemo(() => Object.values(latestByBlock).map(r => r.Volume_m3).filter(Number.isFinite), [latestByBlock]);
  const volumeMin = volumeValues.length ? Math.min(...volumeValues) : 0;
  const volumeMax = volumeValues.length ? Math.max(...volumeValues) : 1;

  // Most recent season for the selected block, from Full_final_deduped.json -
  // falls back to vineyard_STAR.csv's static season if no daily record exists yet.
  const selectedFieldSeason = selectedField
    ? formatSeason(latestByBlock[selectedField.BLOCK]?.Season) || selectedField.season || null
    : null;

  // Dynamic style application for the GeoJSON polygons
  const styleGeoJSON = (feature) => {
    const isSelected = selectedField && selectedField.BLOCK === feature.properties.BLOCK;

    if (colorMode === 'et' || colorMode === 'irrigationNet' || colorMode === 'ndvi' || colorMode === 'ndwi' || colorMode === 'irrigation') {
      const record = latestByBlock[feature.properties.BLOCK];
      let fillColor;
      if (colorMode === 'et') {
        fillColor = evapotranspirationColor(record?.ETa_mm, etMax);
      } else if (colorMode === 'irrigationNet') {
        fillColor = irrigationNetColor(record?.Irrigation_net, irrigationNetMin, irrigationNetMax);
      } else if (colorMode === 'ndvi') {
        fillColor = ndviColor(record?.Mean_NDVI, ndviMin, ndviMax);
      } else if (colorMode === 'ndwi') {
        fillColor = ndwiColor(record?.Mean_NDWI, ndwiMin, ndwiMax);
      } else {
        fillColor = irrigationVolumeColor(record?.Volume_m3, volumeMin, volumeMax);
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
            { key: 'irrigationNet', label: 'Irrigation Net', help: 'Colour every block by net irrigation required.' },
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
              {selectedFieldSeason && (
                <tr><td style={{ color: '#666', paddingRight: '10px' }}>Season</td><td>{selectedFieldSeason}</td></tr>
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

        {colorMode === 'irrigationNet' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Irrigation Net (mm){latestDate ? ` - ${latestDate}` : ''}</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(IRRIGATION_NET_LOW, IRRIGATION_NET_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>{irrigationNetMin.toFixed(1)}</span>
              <span>{irrigationNetMax.toFixed(1)}</span>
            </div>
          </>
        )}

        {colorMode === 'ndvi' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>NDVI{latestDate ? ` - ${latestDate}` : ''}</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(NDVI_LOW, NDVI_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>{ndviMin.toFixed(2)}</span>
              <span>{ndviMax.toFixed(2)}</span>
            </div>
          </>
        )}

        {colorMode === 'ndwi' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>NDWI{latestDate ? ` - ${latestDate}` : ''}</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(NDWI_LOW, NDWI_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>{ndwiMin.toFixed(2)}</span>
              <span>{ndwiMax.toFixed(2)}</span>
            </div>
          </>
        )}

        {colorMode === 'irrigation' && (
          <>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Irrigation Volume Required (m³){latestDate ? ` - ${latestDate}` : ''}</div>
            <div style={{ height: '10px', borderRadius: '3px', background: gradientCss(IRRIGATION_LOW, IRRIGATION_HIGH), opacity: fillOpacity + 0.3 > 1 ? 1 : fillOpacity + 0.3 }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>{Math.round(volumeMin).toLocaleString()}</span>
              <span>{Math.round(volumeMax).toLocaleString()}</span>
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

          {/* Uploaded GeoTIFF overlays - above the basemap, below the GeoJSON blocks */}
          <TifOverlays />

          {/* Vineyard Blocks - green by default, orange when selected, opacity controlled by the slider */}
          <LayersControl.Overlay checked name="Vineyard Blocks">
          {studyAreaGeojson && (
            <GeoJSON
              // Remounts the layer whenever the selection or opacity changes so Leaflet
              // actually repaints - a stale style prop alone doesn't force a redraw.
              key={`blocks-${selectedField?.BLOCK}-${fillOpacity}-${colorMode}-${latestDate}-${etMax}-${irrigationNetMax}-${ndviMax}-${ndwiMax}-${volumeMax}`}
              data={studyAreaGeojson}
              style={styleGeoJSON}
              onEachFeature={onEachFeature}
            />
          )}
          </LayersControl.Overlay>
        </LayersControl>

        {/* Forces the overlay checkboxes into a fixed order (see component
            for why this can't just be JSX declaration order) */}
        <OrderedOverlaysControl order={['Vineyard Blocks', 'Most recent Sat Imagery', 'Net Irrigation Required']} />

        {/* This silently listens for selectedField changes and zooms the map */}
        <MapFlyTo selectedField={selectedField} />

      </MapContainer>
    </div>
  );
}
