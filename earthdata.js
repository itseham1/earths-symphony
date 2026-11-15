// earthdata.js — reads the NASA night-lights values for all 12 years (2012 ... 2023)
//
// assets/grid12.png  is 480 px wide and (13 x 270) px tall: 13 tiles stacked
//   tiles 0..11  = light of 2012 ... 2023   (0 = dark, 255 = very bright)
//   tile  12     = land mask (255 = land)
// Light index = log-scaled brightness of NASA's lights-only frames (same scale for every year).
export const YEARS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
const N = YEARS.length, GW = 480, GH = 270;

let px = null;


// Load our new NASA-video brightness grid.
// Keep the last tile of the original grid as the land mask.
export async function loadGrid(url = 'assets/grid12.png') {
  function readImage(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext('2d', {
            willReadFrequently: true
          });

          ctx.drawImage(img, 0, 0);

          resolve({
            width: img.width,
            height: img.height,
            data: ctx.getImageData(
              0, 0, img.width, img.height
            ).data
          });
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(
        new Error('Could not load ' + path)
      );

      img.src = path;
    });
  }

  const [original, spatial] = await Promise.all([
    readImage(url),
    readImage('assets/nightlights_spatial_grid.png')
  ]);

  if (original.width !== GW ||
      original.height !== (N + 1) * GH) {
    throw new Error('Unexpected original grid dimensions');
  }

  if (spatial.width !== GW ||
      spatial.height !== N * GH) {
    throw new Error('Unexpected spatial grid dimensions');
  }

  // 12 new brightness layers, plus original land mask.
  px = original.data;
  px.set(spatial.data, 0);

  console.info(
    'SONOVA: New NASA spatial brightness loaded for',
    N, 'years'
  );
}

const lightAt = (yi, x, y) => px[((yi * GH + y) * GW + x) * 4] / 255;
const landAt = (x, y) => px[((N * GH + y) * GW + x) * 4] / 255;

// average light around a point, for every year  (radius r cells -> (2r+1)^2 cells)
//   yi = the year whose neighbouring cells are returned in `cells` (used for the arpeggio)
export function sample(lat, lon, yi = N - 1, r = 1) {
  let u = ((lon + 180) / 360) % 1; if (u < 0) u += 1;
  const cx = Math.floor(u * GW);
  const cy = Math.max(0, Math.min(GH - 1, Math.floor((90 - lat) / 180 * GH)));
  const series = new Array(N).fill(0), cells = [];
  let land = 0, n = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = (cx + dx + GW) % GW;
      const y = Math.max(0, Math.min(GH - 1, cy + dy));
      for (let k = 0; k < N; k++) series[k] += lightAt(k, x, y);
      cells.push(lightAt(yi, x, y));
      land += landAt(x, y); n++;
    }
  }
  for (let k = 0; k < N; k++) series[k] /= n;
  return {
    series, v: series[yi], cells,
    l12: series[0], l23: series[N - 1], delta: series[N - 1] - series[0],
    land: land / n > 0.5
  };
}

// ---- names: nearest well-known city (for sighted users AND screen readers) ----
export const CITIES = [
  ['Riyadh', 24.71, 46.68], ['Cairo', 30.04, 31.24], ['Istanbul', 41.01, 28.98], ['Moscow', 55.76, 37.62],
  ['Kyiv', 50.45, 30.52], ['London', 51.51, -0.13], ['Paris', 48.86, 2.35], ['Berlin', 52.52, 13.4],
  ['Madrid', 40.42, -3.7], ['Rome', 41.9, 12.5], ['Lagos', 6.52, 3.38], ['Nairobi', -1.29, 36.82],
  ['Johannesburg', -26.2, 28.05], ['Delhi', 28.61, 77.21], ['Mumbai', 19.08, 72.88], ['Dhaka', 23.81, 90.41],
  ['Beijing', 39.9, 116.4], ['Shanghai', 31.23, 121.47], ['Tokyo', 35.68, 139.69], ['Seoul', 37.57, 126.98],
  ['Bangkok', 13.76, 100.5], ['Jakarta', -6.2, 106.85], ['Sydney', -33.87, 151.21], ['New York', 40.71, -74.0],
  ['Los Angeles', 34.05, -118.24], ['Mexico City', 19.43, -99.13], ['São Paulo', -23.55, -46.63],
  ['Buenos Aires', -34.6, -58.38], ['Tehran', 35.69, 51.39], ['Baghdad', 33.31, 44.37], ['Karachi', 24.86, 67.0],
  ['Dubai', 25.2, 55.27], ['Kharkiv', 49.99, 36.23], ['Damascus', 33.51, 36.28], ['Addis Ababa', 9.03, 38.74],
  ['Kinshasa', -4.44, 15.27], ['Manila', 14.6, 120.98], ['Hanoi', 21.03, 105.85]
];
const rad = d => d * Math.PI / 180;
function distDeg(lat1, lon1, lat2, lon2) {
  const c = Math.sin(rad(lat1)) * Math.sin(rad(lat2)) +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon1 - lon2));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}
export function placeName(lat, lon, land) {
  let best = null, bd = 1e9;
  for (const c of CITIES) {
    const d = distDeg(lat, lon, c[1], c[2]);
    if (d < bd) { bd = d; best = c[0]; }
  }
  if (bd < 6) return 'Near ' + best;
  return land ? 'Remote land area' : 'Open ocean';
}

// the cities whose light changed the most 2012 -> 2023 (used by "Surprise me")
export function movers(n = 10) {
  return CITIES
    .map(([name, lat, lon]) => ({ name, lat, lon, delta: sample(lat, lon, N - 1, 1).delta }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, n);
}

export function coordText(lat, lon) {
  return Math.abs(lat).toFixed(2) + '°' + (lat >= 0 ? 'N' : 'S') + ', ' +
         Math.abs(lon).toFixed(2) + '°' + (lon >= 0 ? 'E' : 'W');
}

export const idx = v => Math.round(Math.max(0, Math.min(1, v)) * 100);   // 0..100 light index
export const THRESH = 0.06;                                              // below this = "unchanged"

export function trend(delta) {
  if (delta > THRESH) return 'up';
  if (delta < -THRESH) return 'down';
  return 'same';
}

// plain-language description (shown + read by screen readers)
export function describe(name, s) {
  const level = v => v < 0.05 ? 'almost dark' : v < 0.25 ? 'dimly lit' : v < 0.55 ? 'moderately lit' : 'brightly lit';
  const t = trend(s.delta);
  const pts = Math.abs(idx(s.l23) - idx(s.l12));
  const change = t === 'up'   ? `Between 2012 and 2023 it became brighter by ${pts} points, so you hear a rising tone.`
               : t === 'down' ? `Between 2012 and 2023 it became dimmer by ${pts} points, so you hear a falling tone.`
               :                'Between 2012 and 2023 it stayed about the same, so you hear a steady tone.';
  // the sharpest single-year step (if it is clearly visible)
  let big = 0, at = -1;
  for (let i = 1; i < N; i++) {
    const d = idx(s.series[i]) - idx(s.series[i - 1]);
    if (Math.abs(d) > Math.abs(big)) { big = d; at = i; }
  }
  const step = Math.abs(big) >= 8
    ? ` The sharpest change came in ${YEARS[at]}: ${big < 0 ? 'down' : 'up'} ${Math.abs(big)} points.` : '';
  return `${name} is ${level(s.l23)} in 2023 (light index ${idx(s.l23)}; in 2012 it was ${idx(s.l12)}). ${change}${step}`;
}
