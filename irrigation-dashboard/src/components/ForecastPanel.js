import React, { useState, useEffect } from 'react';

// Diverging pair (validated blue/red, neutral gray baseline) for a signed metric:
// positive = irrigation needed, negative = rainfall surplus covers demand.
const POSITIVE_COLOR = '#2a78d6';
const NEGATIVE_COLOR = '#e34948';
const BASELINE_COLOR = '#c3c2b7';
const PRIMARY_INK = '#0b0b0b';
const SECONDARY_INK = '#52514e';
const MUTED_INK = '#898781';

const shortDay = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });

export default function ForecastPanel({ lat, lng, kcInfo, kcLoading }) {
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForecast(null);
    setError(null);
    const queryLat = lat || -33.9249;
    const queryLng = lng || 18.8602;

    // forecast_days with no start/end date pulls the live 7-day forecast
    // starting from today - the "most recent, as to the actual date" window.
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${queryLat}&longitude=${queryLng}&daily=et0_fao_evapotranspiration,precipitation_sum&timezone=auto&forecast_days=7`)
      .then(res => res.json())
      .then(data => setForecast(data.daily))
      .catch(err => {
        console.error('Forecast fetch failed:', err);
        setError('Could not load the 7-day forecast.');
      });
  }, [lat, lng]);

  if (kcLoading) return <div className="loading">Loading crop coefficient data...</div>;
  if (!kcInfo) return <div className="loading">No Kc data available for this block yet.</div>;
  if (error) return <div className="loading">{error}</div>;
  if (!forecast) return <div className="loading">Loading 7-day forecast...</div>;

  const kc = kcInfo.kc;
  const days = forecast.time.map((date, i) => {
    const eto = forecast.et0_fao_evapotranspiration[i];
    const precip = forecast.precipitation_sum[i];
    const eta = eto * kc;
    const irrigationRequired = eta - precip;
    return { date, eto, precip, kc, eta, irrigationRequired };
  });

  const maxAbs = Math.max(1, ...days.map(d => Math.abs(d.irrigationRequired)));

  return (
    <div>
      <div style={{ fontSize: '12px', color: SECONDARY_INK, marginBottom: '12px' }}>
        Irrigation Required = (Forecasted ETo &times; Kc) &minus; Forecasted Precipitation. Using Kc = {kc.toFixed(3)}, the most recently recorded value (week of {kcInfo.date}), applied across this week's live Open-Meteo forecast.
      </div>

      {/* Legend - color carries sign, so it's named explicitly, not left to hue alone */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: SECONDARY_INK, marginBottom: '8px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: POSITIVE_COLOR, display: 'inline-block' }}></span>
          Irrigation needed
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: NEGATIVE_COLOR, display: 'inline-block' }}></span>
          Surplus (rain covers demand)
        </span>
      </div>

      {/* Diverging bar chart, baseline at zero */}
      <div style={{ display: 'flex', height: '150px', marginBottom: '18px' }}>
        {days.map(d => {
          const isPositive = d.irrigationRequired >= 0;
          const magnitude = Math.abs(d.irrigationRequired);
          const barHeightPct = (magnitude / maxAbs) * 100;
          return (
            <div
              key={d.date}
              title={`${d.date}: ${d.irrigationRequired.toFixed(1)} mm irrigation required (ETo ${d.eto.toFixed(2)} mm, Precip ${d.precip.toFixed(1)} mm, Kc ${d.kc.toFixed(3)})`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <div style={{ flex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
                {isPositive && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '65%', height: '100%' }}>
                    <span style={{ fontSize: '10px', color: PRIMARY_INK, marginBottom: '2px', fontVariantNumeric: 'tabular-nums' }}>{d.irrigationRequired.toFixed(1)}</span>
                    <div style={{ width: '100%', height: `${Math.max(barHeightPct, magnitude > 0 ? 3 : 0)}%`, background: POSITIVE_COLOR, borderRadius: '4px 4px 0 0' }} />
                  </div>
                )}
              </div>
              <div style={{ width: '100%', height: '1px', background: BASELINE_COLOR }} />
              <div style={{ flex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
                {!isPositive && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', width: '65%', height: '100%' }}>
                    <div style={{ width: '100%', height: `${Math.max(barHeightPct, magnitude > 0 ? 3 : 0)}%`, background: NEGATIVE_COLOR, borderRadius: '0 0 4px 4px' }} />
                    <span style={{ fontSize: '10px', color: PRIMARY_INK, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>{d.irrigationRequired.toFixed(1)}</span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: '10px', color: MUTED_INK, marginTop: '6px' }}>{shortDay(d.date)}</span>
            </div>
          );
        })}
      </div>

      {/* Table view - same data, for accessibility and precise values */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: SECONDARY_INK }}>
              <th style={{ padding: '4px 8px' }}>Date</th>
              <th style={{ padding: '4px 8px' }}>ETo (mm)</th>
              <th style={{ padding: '4px 8px' }}>Precip (mm)</th>
              <th style={{ padding: '4px 8px' }}>Kc</th>
              <th style={{ padding: '4px 8px' }}>Irrigation Req. (mm)</th>
            </tr>
          </thead>
          <tbody>
            {days.map(d => (
              <tr key={d.date} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px' }}>{d.date}</td>
                <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{d.eto.toFixed(2)}</td>
                <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{d.precip.toFixed(1)}</td>
                <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{d.kc.toFixed(3)}</td>
                <td style={{ padding: '4px 8px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: d.irrigationRequired >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>
                  {d.irrigationRequired.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
