import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Leaflet doesn't notice when its container is resized by a CSS/layout change
// (e.g. the Fields tab map expanding) - this nudges it to recalculate after
// the resize transition finishes so tiles fill the new size correctly.
export default function MapResizeHandler({ trigger }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 320);
    return () => clearTimeout(timer);
  }, [trigger, map]);

  return null;
}
