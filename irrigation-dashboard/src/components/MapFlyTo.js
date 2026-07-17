import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function MapFlyTo({ selectedField }) {
  const map = useMap();

  useEffect(() => {
    // Check if we have a field and if it contains the new X and Y coordinates from vineyard_STAR.csv
    if (selectedField && selectedField.Y && selectedField.X) {
      // Y = Latitude, X = Longitude. The '17' is the zoom level.
      map.flyTo([selectedField.Y, selectedField.X], 17, {
        duration: 1.5 // Smooth flying animation in seconds
      });
    }
  }, [selectedField, map]);

  return null;
}