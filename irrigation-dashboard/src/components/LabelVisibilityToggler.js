import { useEffect, useCallback } from 'react';
import { useMap } from 'react-leaflet';

// Below this zoom, block labels are just clutter - the fill color already
// tells you what's selected. Above it, there's enough room to read "K13" etc.
const LABEL_ZOOM_THRESHOLD = 16;

export default function LabelVisibilityToggler() {
  const map = useMap();

  const applyLabelVisibility = useCallback(() => {
    map.getContainer().classList.toggle('labels-visible', map.getZoom() >= LABEL_ZOOM_THRESHOLD);
  }, [map]);

  useEffect(() => {
    applyLabelVisibility();
    map.on('zoomend', applyLabelVisibility);
    return () => map.off('zoomend', applyLabelVisibility);
  }, [map, applyLabelVisibility]);

  return null;
}
