// Shared color ramps for the irrigation-data map overlays (Home tab + Fields tab).
// Built entirely from the Okabe-Ito colorblind-safe palette (every pair below
// remains distinguishable under protanopia, deuteranopia and tritanopia) -
// deliberately avoiding red/green pairings, which is the single most common
// failure mode for the map's original color scheme.
// Irrigation Net: sky blue (no irrigation needed) -> orange (high irrigation need).
// Evapotranspiration: white (low) -> blue (high).
// NDVI: vermillion (low vegetation vigor) -> bluish green (high vigor).
// NDWI: orange (dry) -> sky blue (wet).
// Irrigation Volume Required: yellow (low) -> reddish purple (high).

export const IRRIGATION_NET_LOW = [86, 180, 233]; // Okabe-Ito sky blue
export const IRRIGATION_NET_HIGH = [230, 159, 0]; // Okabe-Ito orange
export const ET_LOW = [255, 255, 255];
export const ET_HIGH = [0, 114, 178]; // Okabe-Ito blue
export const NDVI_LOW = [213, 94, 0]; // Okabe-Ito vermillion
export const NDVI_HIGH = [0, 158, 115]; // Okabe-Ito bluish green
export const NDWI_LOW = [230, 159, 0]; // Okabe-Ito orange
export const NDWI_HIGH = [86, 180, 233]; // Okabe-Ito sky blue
export const IRRIGATION_LOW = [240, 228, 66]; // Okabe-Ito yellow
export const IRRIGATION_HIGH = [204, 121, 167]; // Okabe-Ito reddish purple

const NO_DATA_COLOR = '#9e9e9e';

const lerpChannel = (a, b, t) => Math.round(a + (b - a) * t);

const lerpColor = (c1, c2, t) => {
  const clamped = Math.min(1, Math.max(0, t));
  return `rgb(${lerpChannel(c1[0], c2[0], clamped)}, ${lerpChannel(c1[1], c2[1], clamped)}, ${lerpChannel(c1[2], c2[2], clamped)})`;
};

// Generic min-max interpolation, used by indices (like NDWI) whose domain isn't 0-based.
export function valueToColor(value, min, max, colorLow, colorHigh) {
  if (value == null || !Number.isFinite(value) || !(max > min)) return NO_DATA_COLOR;
  return lerpColor(colorLow, colorHigh, (value - min) / (max - min));
}

// Irrigation_net can be negative (a surplus day, no irrigation needed), so
// this takes an explicit min rather than assuming a 0 floor.
export function irrigationNetColor(value, min, max) {
  return valueToColor(value, min, max, IRRIGATION_NET_LOW, IRRIGATION_NET_HIGH);
}

export function evapotranspirationColor(value, max) {
  return valueToColor(value, 0, max, ET_LOW, ET_HIGH);
}

export function ndviColor(value, min, max) {
  return valueToColor(value, min, max, NDVI_LOW, NDVI_HIGH);
}

export function ndwiColor(value, min, max) {
  return valueToColor(value, min, max, NDWI_LOW, NDWI_HIGH);
}

// Volume_m3 can be negative too (surplus days), same reasoning as above.
export function irrigationVolumeColor(value, min, max) {
  return valueToColor(value, min, max, IRRIGATION_LOW, IRRIGATION_HIGH);
}

export function gradientCss(c1, c2) {
  return `linear-gradient(to right, rgb(${c1.join(',')}), rgb(${c2.join(',')}))`;
}
