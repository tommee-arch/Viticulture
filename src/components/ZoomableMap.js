import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Required fix for React-Leaflet missing default marker icons in production builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

function MapFlyToController({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], 16, { animate: true, duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
}

export default function ZoomableMap({ lat, lng }) {
  // Defaults to Stellenbosch if no coordinates are provided in the CSV
  const defaultCenter = lat && lng ? [lat, lng] : [-33.9249, 18.8602]; 

  return (
    <MapContainer center={defaultCenter} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%', borderRadius: '6px' }}>
      <TileLayer 
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
      />
      <MapFlyToController lat={lat} lng={lng} />
      {lat && lng && <Marker position={[lat, lng]} />}
    </MapContainer>
  );
}