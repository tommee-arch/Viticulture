import React from 'react';
import { ImageOverlay, LayersControl, Pane } from 'react-leaflet';

// The two uploaded GeoTIFFs (irrigation_net_2025-04-30.tif and
// Tokara_2025-04-24_tile_0001_S2.tif) are pre-rendered to positioned PNGs
// rather than decoded client-side. Both source tifs share the same UTM
// zone 34N (EPSG:32634) grid/extent, so both PNGs share the same bounds -
// computed once (from the tifs' embedded geotransform, reprojected to
// WGS84) by the offline conversion script that produced these PNGs; see
// public/data/tif_overlay_bounds.json for the raw figures.
//
// A live-decoding approach (georaster + georaster-layer-for-leaflet) was
// tried first, but that library's published build (v4.1.2) has cascading
// broken ESM imports several levels into its own dependency tree
// (geo-extent -> geography-markup-language) that aren't fixable without
// forking multiple third-party packages - not worth the fragility for two
// static, already-known rasters.
const IRRIGATION_NET_BOUNDS = [
  [-33.918685232245736, 18.906842444744665],
  [-33.89459458167451, 18.935629123161444]
];
const SAT_IMAGERY_BOUNDS = IRRIGATION_NET_BOUNDS;

const IRRIGATION_NET_PNG_URL = `${process.env.PUBLIC_URL}/data/irrigation_net_2025-04-30.png`;
const SAT_IMAGERY_PNG_URL = `${process.env.PUBLIC_URL}/data/Tokara_2025-04-24_tile_0001_S2.png`;

// Uploaded raster overlays, toggleable from the map's Layers control
// (checkboxes below the base layers, same as the other overlays). Rendered
// in their own pane so they always sit above the basemap tiles but below
// the vineyard-block GeoJSON, regardless of which order layers are
// toggled/added in.
export default function TifOverlays() {
  return (
    <Pane name="geotiff-overlays" style={{ zIndex: 350 }}>
      <LayersControl.Overlay checked name="Net Irrigation Required">
        <ImageOverlay url={IRRIGATION_NET_PNG_URL} bounds={IRRIGATION_NET_BOUNDS} opacity={0.85} />
      </LayersControl.Overlay>
      <LayersControl.Overlay checked name="Most recent Sat Imagery">
        <ImageOverlay url={SAT_IMAGERY_PNG_URL} bounds={SAT_IMAGERY_BOUNDS} opacity={0.85} />
      </LayersControl.Overlay>
    </Pane>
  );
}
