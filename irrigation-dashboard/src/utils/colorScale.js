// Shared color ramps for the irrigation-data map overlays (Home tab + Fields tab).
// Net Deficit: green (no deficit) -> red (high deficit).
// Evapotranspiration: white (low) -> blue (high).
// NDVI: brown/red (low vegetation vigor) -> green (high vigor).
// NDWI: dry brown/tan (low water content) -> teal-blue (high water content).
// Irrigation Volume Required: pale yellow (low) -> deep purple (high).

export const NET_DEFICIT_LOW = [46, 204, 113];
export const NET_DEFICIT_HIGH = [231, 76, 60];
export const ET_LOW = [255, 255, 255];
export const ET_HIGH = [21, 101, 192];
export const NDVI_LOW = [165, 42, 42];
export const NDVI_HIGH = [34, 139, 34];
export const NDWI_LOW = [140, 100, 40];
export const NDWI_HIGH = [0, 150, 200];
export const IRRIGATION_LOW = [255, 247, 188];
export const IRRIGATION_HIGH = [106, 27, 154];

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

export function netDeficitColor(value, max) {
  return valueToColor(value, 0, max, NET_DEFICIT_LOW, NET_DEFICIT_HIGH);
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

export function irrigationVolumeColor(value, max) {
  return valueToColor(value, 0, max, IRRIGATION_LOW, IRRIGATION_HIGH);
}

export function gradientCss(c1, c2) {
  return `linear-gradient(to right, rgb(${c1.join(',')}), rgb(${c2.join(',')}))`;
}
