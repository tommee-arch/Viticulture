// Finds the entry in a date list closest to a target date. Used to match a
// sparse satellite-pass date list (NDVI/NDWI) or a picked calendar date to
// whatever's actually available in a dataset.
export function findClosestDate(dates, target) {
  if (!dates || !dates.length || !target) return null;
  const targetTime = new Date(target).getTime();
  return dates.reduce((closest, d) =>
    Math.abs(new Date(d).getTime() - targetTime) < Math.abs(new Date(closest).getTime() - targetTime) ? d : closest
  , dates[0]);
}
