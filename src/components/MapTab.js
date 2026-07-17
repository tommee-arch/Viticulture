import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from 'react-leaflet';
import MapWidgets from './MapWidgets';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default function MapTab({ fields }) {
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    // Load the GeoJSON file for the study area
    // Using process.env.PUBLIC_URL ensures the path resolves correctly on GitHub Pages
    fetch(process.env.PUBLIC_URL + '/data/Tokara_Study_Area.json')
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(err => console.error("Could not load GeoJSON. Ensure the file is in public/data/: ", err));
  }, []);

  // Default coordinate center
  const center = [-33.9249, 18.8602]; 

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {/* Overlay the widgets on top of the map */}
      <MapWidgets />
      
      <MapContainer center={center} zoom={14} zoomControl={false} style={{ height: '100%', width: '100%', zIndex: 1 }}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
        />
        
        {/* Render the vineyard block polygons if the JSON loads */}
        {geoData && (
          <GeoJSON 
            data={geoData} 
            style={{ color: '#059669', weight: 2, fillColor: '#34d399', fillOpacity: 0.4 }} 
          />
        )}

        {/* Render markers for each field loaded from the CSV */}
        {fields && fields.map((field, idx) => (
          field.Lat && field.Lng ? (
            <Marker key={idx} position={[field.Lat, field.Lng]}>
              <Popup>
                <strong>{field.FieldName}</strong><br/>
                Cultivar: {field.Cultivar || 'Unknown'}<br/>
                Area: {field.AreaHA} ha
              </Popup>
            </Marker>
          ) : null
        ))}
      </MapContainer>
    </div>
  );
}