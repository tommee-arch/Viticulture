import React from 'react';

// Plain-SVG line chart (no charting library in this project) plotting Net
// Deficit and Evapotranspiration for a +/-1 week window around the selected
// date. viewBox + preserveAspectRatio="none" lets it stretch to fill
// whatever width the card gives it without needing a resize observer.
const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 22, left: 34 };

function buildPath(points, valueKey, xScale, yScale) {
  let path = '';
  let started = false;
  points.forEach((p, i) => {
    const v = p[valueKey];
    if (v == null || Number.isNaN(v)) {
      started = false;
      return;
    }
    const x = xScale(i);
    const y = yScale(v);
    path += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    started = true;
  });
  return path.trim();
}

export default function DeficitEtChart({ series = [], selectedDate, unit = 'daily' }) {
  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const values = series
    .flatMap(p => [p.Net_Deficit_mm, p.ETa_mm])
    .filter(v => v != null && !Number.isNaN(v));
  const minV = values.length ? Math.min(0, ...values) : 0;
  const maxV = values.length ? Math.max(1, ...values) : 1;
  const span = maxV - minV || 1;

  const xScale = (i) => PADDING.left + (series.length > 1 ? (i / (series.length - 1)) * innerWidth : innerWidth / 2);
  const yScale = (v) => PADDING.top + innerHeight - ((v - minV) / span) * innerHeight;

  const deficitPath = buildPath(series, 'Net_Deficit_mm', xScale, yScale);
  const etPath = buildPath(series, 'ETa_mm', xScale, yScale);
  const selectedIndex = series.findIndex(p => p.Date === selectedDate);
  const unitLabel = unit === 'weekly' ? 'mm/week' : 'mm/day';

  return (
    <div className="deficit-et-chart">
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#2563eb' }} />
          Net Deficit ({unitLabel})
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#f97316' }} />
          Evapotranspiration ({unitLabel})
        </span>
      </div>

      {series.length < 2 ? (
        <div className="chart-empty">Not enough data around this date to plot.</div>
      ) : (
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="chart-svg">
          <line x1={PADDING.left} y1={yScale(0)} x2={CHART_WIDTH - PADDING.right} y2={yScale(0)} stroke="#eee" strokeWidth="1" />

          {selectedIndex >= 0 && (
            <line
              x1={xScale(selectedIndex)}
              y1={PADDING.top}
              x2={xScale(selectedIndex)}
              y2={CHART_HEIGHT - PADDING.bottom}
              stroke="#fbc02d"
              strokeWidth="2"
              strokeDasharray="4,3"
            />
          )}

          <path d={deficitPath} fill="none" stroke="#2563eb" strokeWidth="2" />
          <path d={etPath} fill="none" stroke="#f97316" strokeWidth="2" />

          <text x={2} y={yScale(maxV) + 4} fontSize="9" fill="#666">{maxV.toFixed(1)}</text>
          <text x={2} y={yScale(minV) + 4} fontSize="9" fill="#666">{minV.toFixed(1)}</text>

          <text x={xScale(0)} y={CHART_HEIGHT - 6} fontSize="9" fill="#666" textAnchor="start">{series[0].Date}</text>
          <text x={xScale(series.length - 1)} y={CHART_HEIGHT - 6} fontSize="9" fill="#666" textAnchor="end">{series[series.length - 1].Date}</text>
        </svg>
      )}

      <div className="chart-caption">
        {selectedDate ? `1 week either side of ${selectedDate}` : 'Select a date to see the surrounding week on either side.'}
      </div>
    </div>
  );
}
