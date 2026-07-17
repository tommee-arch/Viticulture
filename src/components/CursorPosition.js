import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// Adds a small readout to the bottom-left corner (next to the scale bar) showing
// the lat/lng under the cursor. Updates the DOM node directly on mousemove instead
// of going through React state, since that event fires far too often to re-render on.
export default function CursorPosition() {
  const map = useMap();
  const nodeRef = useRef(null);

  useEffect(() => {
    const control = L.control({ position: 'bottomleft' });

    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'cursor-position-control');
      div.textContent = '';
      nodeRef.current = div;
      return div;
    };
    control.addTo(map);

    const updateCoords = (e) => {
      if (nodeRef.current) {
        nodeRef.current.textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
      }
    };
    const clearCoords = () => {
      if (nodeRef.current) nodeRef.current.textContent = '';
    };

    map.on('mousemove', updateCoords);
    map.on('mouseout', clearCoords);

    return () => {
      map.off('mousemove', updateCoords);
      map.off('mouseout', clearCoords);
      control.remove();
    };
  }, [map]);

  return null;
}
