import React, { useState, useEffect } from 'react';

export default function WeatherWidget({ lat, lng }) {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    // Default to Stellenbosch if coordinates are missing
    const queryLat = lat || -33.9249;
    const queryLng = lng || 18.8602;

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${queryLat}&longitude=${queryLng}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`)
      .then(res => res.json())
      .then(data => {
        setWeather({
          temp: data.current_weather.temperature,
          wind: data.current_weather.windspeed,
          high: data.daily.temperature_2m_max[0],
          low: data.daily.temperature_2m_min[0],
          precip: data.daily.precipitation_sum[0]
        });
      })
      .catch(err => console.error("Weather fetch failed:", err));
  }, [lat, lng]);

  if (!weather) return <div>Loading local weather...</div>;

  return (
    <div className="weather-widget">
      <h3>Microclimate Data</h3>
      <div className="weather-stats">
        <div className="stat-group">
          <span className="huge-temp">{weather.temp}°C</span>
          <span className="sub-temp">H: {weather.high}° L: {weather.low}°</span>
        </div>
        <div className="stat-group">
          <p><strong>Wind:</strong> {weather.wind} km/h</p>
          <p><strong>Precipitation:</strong> {weather.precip} mm</p>
        </div>
      </div>
    </div>
  );
}