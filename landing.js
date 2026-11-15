// ---------- 1) the sequence ----------
//   0.3 s  the Earth appears
//   1.0 s  "What if you could hear the Earth ..."
//   3.2 s  EARTH'S SYMPHONY + tagline + "Enter the Jukebox" appear together
const body = document.body;
const timers = [];

function reveal() {
  timers.forEach(clearTimeout);
  body.classList.add('go', 'ask', 'reveal');
}

if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  reveal();
} else {
  timers.push(setTimeout(() => body.classList.add('go'), 300));
  timers.push(setTimeout(() => body.classList.add('ask'), 1000));
  timers.push(setTimeout(reveal, 3200));
}

// ---------- 2) the Earth: real NASA night lights on a turning sphere ----------
const W = 2048, H = 1024, LON0 = -180, S = 520;      // assets/y2023.jpg: standard world map
const canvas = document.getElementById('earth');
const ctx = canvas.getContext('2d');
canvas.width = canvas.height = S;

let src = null, rot = 0, last = 0, acc = 0, t0 = null;
const img = new Image();
img.onload = () => {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
  src = x.getImageData(0, 0, W, H).data;
};
img.src = 'assets/y2023.jpg';

function drawEarth() {
  if (!src) return;
  const d = ctx.createImageData(S, S), o = d.data, r = S / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = (x - r) / r, ny = (r - y) / r, q = nx * nx + ny * ny, k = (y * S + x) * 4;
      if (q > 1) continue;
      const z = Math.sqrt(1 - q);
      const lat = Math.asin(ny) * 180 / Math.PI;
      const lon = Math.atan2(nx, z) * 180 / Math.PI + rot;
      let u = ((lon - LON0) / 360) % 1; if (u < 0) u += 1;
      const sx = Math.min(W - 1, u * W | 0), sy = Math.min(H - 1, (90 - lat) / 180 * H | 0);
      const j = (sy * W + sx) * 4;
      const shade = (.3 + .7 * Math.pow(z, .6)) * 1.15;
      o[k] = Math.min(255, src[j] * shade);
      o[k + 1] = Math.min(255, src[j + 1] * shade);
      o[k + 2] = Math.min(255, src[j + 2] * shade);
      o[k + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
}

// The Earth makes ONE full 360° turn while the intro plays (it lands on Arabia,
// where the title appears), then keeps turning slowly and never stops.
const FULL_TURN_MS = 3600;          // duration of the first 360° turn
const SLOW = 0.012;                 // degrees per millisecond afterwards (~30 s per turn)
const END_LON = 45 - SLOW * FULL_TURN_MS;   // so the first turn ends facing Arabia (45°E)
const easeOut = (k) => 1 - Math.pow(1 - k, 3);

function frame(ts) {
  requestAnimationFrame(frame);
  if (!src) return;
  if (t0 === null) t0 = ts;                   // start the clock when the image is ready
  acc += ts - last; last = ts;
  if (acc < 33) return;                       // ~30 frames per second is enough
  acc = 0;
  const t = ts - t0;
  const turn = easeOut(Math.min(t / FULL_TURN_MS, 1));      // 0 -> 1
  rot = (END_LON - 360 + 360 * turn + SLOW * t) % 360;
  drawEarth();
}
requestAnimationFrame(frame);
