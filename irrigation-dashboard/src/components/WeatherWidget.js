import React, { useState, useEffect } from 'react';

export default function WeatherWidget({ lat, lng, date }) {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!date) return;

    // Default to Stellenbosch if coordinates are missing
    const queryLat = lat || -33.9249;
    const queryLng = lng || 18.8602;

    setWeather(null);

    // The dates we care about are all in the past, so pull from the historical
    // archive rather than the current/forecast endpoint - it lets us fetch
    // weather for whatever date is selected, not just "now".
    fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${queryLat}&longitude=${queryLng}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=auto`)
      .then(res => res.json())
      .then(data => {
        const high = data.daily?.temperature_2m_max?.[0];
        const low = data.daily?.temperature_2m_min?.[0];
        setWeather({
          temp: (high != null && low != null) ? Math.round(((high + low) / 2) * 10) / 10 : null,
          wind: data.daily?.windspeed_10m_max?.[0],
          high,
          low,
          precip: data.daily?.precipitation_sum?.[0]
        });
      })
      .catch(err => console.error("Weather fetch failed:", err));
  }, [lat, lng, date]);

  if (!date) return <div>Select a date to view weather.</div>;
  if (!weather) return <div>Loading weather for {date}...</div>;

  return (
    <div className="weather-widget">
      <h3>Microclimate Data - {date}</h3>
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