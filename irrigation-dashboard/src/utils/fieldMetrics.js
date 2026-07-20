// Irrigation datasets store season as either 20222023 (daily) or "2022_2023"
// (weekly) - normalize both to "2022/2023" for display.
export function formatSeason(season) {
  if (season == null) return null;
  const str = String(season);
  if (/^\d{8}$/.test(str)) return `${str.slice(0, 4)}/${str.slice(4)}`;
  if (str.includes('_')) return str.replace('_', '/');
  return str;
}

// vineyard_STAR.csv's Area column is actually km² despite the dashboard
// always having labelled it "ha" - convert for display (1 km² = 100 ha).
export function areaKm2ToHa(areaKm2) {
  if (areaKm2 == null || !Number.isFinite(Number(areaKm2))) return null;
  return Number(areaKm2) * 100;
}

// Buckets a block's NDVI reading into a plant-health label.
export function ndviToHealth(ndvi) {
  if (ndvi == null || !Number.isFinite(ndvi)) return 'Unknown';
  if (ndvi >= 0.7) return 'Excellent';
  if (ndvi >= 0.55) return 'Good';
  if (ndvi >= 0.4) return 'Fair';
  return 'Poor';
}
