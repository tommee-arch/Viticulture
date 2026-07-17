// Shared color ramps for the irrigation-data map overlays (Home tab + Fields tab).
// Net Deficit: green (no deficit) -> red (high deficit).
// Evapotranspiration: white (low) -> blue (high).

export const NET_DEFICIT_LOW = [46, 204, 113];
export const NET_DEFICIT_HIGH = [231, 76, 60];
export const ET_LOW = [255, 255, 255];
export const ET_HIGH = [21, 101, 192];

const NO_DATA_COLOR = '#9e9e9e';

const lerpChannel = (a, b, t) => Math.round(a + (b - a) * t);

const lerpColor = (c1, c2, t) => {
  const clamped = Math.min(1, Math.max(0, t));
  return `rgb(${lerpChannel(c1[0], c2[0], clamped)}, ${lerpChannel(c1[1], c2[1], clamped)}, ${lerpChannel(c1[2], c2[2], clamped)})`;
};

export function netDeficitColor(value, max) {
  if (value == null || !Number.isFinite(value) || !(max > 0)) return NO_DATA_COLOR;
  return lerpColor(NET_DEFICIT_LOW, NET_DEFICIT_HIGH, value / max);
}

export function evapotranspirationColor(value, max) {
  if (value == null || !Number.isFinite(value) || !(max > 0)) return NO_DATA_COLOR;
  return lerpColor(ET_LOW, ET_HIGH, value / max);
}

export function gradientCss(c1, c2) {
  return `linear-gradient(to right, rgb(${c1.join(',')}), rgb(${c2.join(',')}))`;
}
