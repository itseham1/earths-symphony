import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { YEARS, loadGrid, sample, placeName, coordText, describe, idx, trend } from "./earthdata.js";
import * as sound from "./sonify.js";

const $ = (id) => document.getElementById(id);
const container = $("globeCanvas");
const say = (msg) => { $("globeStatus").textContent = msg; };
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LAST = YEARS.length - 1;

/* ------------------------------------------------------------------ *
 *  1) 3D scene
 * ------------------------------------------------------------------ */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0.2, 3.3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.setAttribute("aria-hidden", "true");
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.6;
controls.maxDistance = 5;
controls.autoRotate = !reducedMotion;
controls.autoRotateSpeed = 0.45;

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 96, 64),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
scene.add(globe);

// soft blue atmosphere
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(1.14, 64, 48),
  new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: `varying vec3 n;
      void main(){ n = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 n;
      void main(){ float i = pow(max(0.0, 0.62 - dot(n, vec3(0.0, 0.0, 1.0))), 2.6);
        gl_FragColor = vec4(0.25, 0.78, 0.95, 1.0) * i * 1.5; }`
  })
));

// a few stars
{
  const pts = [];
  for (let i = 0; i < 500; i++) {
    const v = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar(30);
    pts.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbcd4ff, size: 0.05, transparent: true, opacity: .6 })));
}

/* ------------------------------------------------------------------ *
 *  2) NASA textures: 12 yearly frames + the change map
 * ------------------------------------------------------------------ */
const textures = [];            // textures[0..11] = 2012..2023
let changeTexture = null;
let yi = LAST;                  // current year index
let changeMode = false;

function loadImage(src) {
  return new Promise((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error("Missing " + src));
    i.src = src;
  });
}
function makeTexture(img) {
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.needsUpdate = true;
  return t;
}

function applyView() {
  const t = changeMode ? changeTexture : textures[yi];
  if (t) { globe.material.map = t; globe.material.needsUpdate = true; }
  $("year").value = yi;
  $("year").setAttribute("aria-valuetext", String(YEARS[yi]));
  $("yearBig").textContent = YEARS[yi];
  $("changeBtn").setAttribute("aria-pressed", String(changeMode));
  $("yearNow").textContent = changeMode ? "2012 → 2023" : YEARS[yi];
  refreshDetails();
}
function setYear(i, quiet = false) {
  yi = Math.max(0, Math.min(LAST, i));
  changeMode = false;
  applyView();
  if (!quiet) {
    const r = targetPlace();
    if (r && sound.isReady()) sound.tick(r.s, view(), r.lon);
    say(`Showing ${YEARS[yi]}.` + (r ? ` ${r.name}: brightness ${idx(r.s.series[yi])}.` : ""));
  }
}
function setChange(on) {
  changeMode = on;
  applyView();
  $("legendChange").hidden = !on;          // NASA change bar only in change mode
  $("legendBrightness").hidden = on;       // brightness bar only in the normal view
  say(on ? "Showing the change map: orange where lights went out, purple where new lights appeared."
         : `Showing ${YEARS[yi]}.`);
}
const view = () => ({ yi, change: changeMode });

/* ------------------------------------------------------------------ *
 *  3) markers
 * ------------------------------------------------------------------ */
function latLonToPosition(lat, lon) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}
function positionToLatLon(p) {
  const d = p.clone().normalize();
  return { lat: THREE.MathUtils.radToDeg(Math.asin(d.y)), lon: THREE.MathUtils.radToDeg(Math.atan2(-d.z, d.x)) };
}

const marker = new THREE.Group();            // selected region: dot + pulsing ring
marker.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 16), new THREE.MeshBasicMaterial({ color: 0x50e4f5 })));
const pulse = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.042, 40),
  new THREE.MeshBasicMaterial({ color: 0x50e4f5, side: THREE.DoubleSide, transparent: true }));
marker.add(pulse);
marker.visible = false;
scene.add(marker);

const probe = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.036, 32),      // follows mouse / keyboard
  new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: .9 }));
probe.visible = false;
scene.add(probe);

function place3D(obj, lat, lon, lift) {
  const dir = latLonToPosition(lat, lon);
  obj.position.copy(dir).multiplyScalar(lift);
  obj.lookAt(dir.clone().multiplyScalar(3));
}

/* ------------------------------------------------------------------ *
 *  4) regions + details panel
 * ------------------------------------------------------------------ */
const regions = {
  riyadh:  { name: "Riyadh, Saudi Arabia",   lat: 24.71, lon: 46.68 },
  delhi:   { name: "Delhi, India",           lat: 28.61, lon: 77.21 },
  london:  { name: "London, United Kingdom", lat: 51.51, lon: -0.13 },
  paris:   { name: "Paris, France",          lat: 48.86, lon: 2.35 },
  kyiv:    { name: "Kyiv, Ukraine",          lat: 50.45, lon: 30.52 },
  cairo:   { name: "Cairo, Egypt",           lat: 30.04, lon: 31.24 },
  tokyo:   { name: "Tokyo, Japan",           lat: 35.68, lon: 139.69 },
  newyork: { name: "New York, USA",          lat: 40.71, lon: -74.0 },
  lagos:   { name: "Lagos, Nigeria",         lat: 6.52,  lon: 3.38 }
};

let selected = null;      // { name, lat, lon, s }
let cursor = null;        // { lat, lon } — mouse / keyboard listening point
let cameraTarget = null;
let resumeRotation = false;

function info(lat, lon, forcedName) {
  const s = sample(lat, lon, yi, 1);
  return { name: forcedName || placeName(lat, lon, s.land), lat, lon, s };
}
const targetPlace = () => {
  if (selected) { selected.s = sample(selected.lat, selected.lon, yi, 1); return selected; }
  return cursor ? info(cursor.lat, cursor.lon) : null;
};

// the light history chart
function drawSpark(series, name) {
  const svg = $("spark");
  if (!series) {
    svg.innerHTML = `<line class="base" x1="10" y1="60" x2="230" y2="60"/><text x="10" y="35">Choose a region to see 2012–2023</text>`;
    svg.setAttribute("aria-label", "Light history chart. Choose a region first.");
    return;
  }
  // the chart zooms to this place's own range, so a small change is still visible
  const lo0 = Math.min(...series), hi0 = Math.max(...series);
  const span = Math.max(hi0 - lo0, 0.2), lo = (lo0 + hi0) / 2 - span / 2;
  const x = (i) => 12 + i * (216 / LAST), y = (v) => 54 - ((v - lo) / span) * 40;
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const cur = changeMode ? LAST : yi;
  svg.innerHTML =
    `<line class="base" x1="10" y1="58" x2="230" y2="58"/>` +
    `<path class="area" d="M${x(0)},58 L${pts.join(" L")} L${x(LAST)},58 Z"/>` +
    `<polyline class="line" points="${pts.join(" ")}"/>` +
    `<circle class="dot" cx="${x(cur).toFixed(1)}" cy="${y(series[cur]).toFixed(1)}" r="4.5"/>` +
    `<text x="10" y="68">2012</text><text x="206" y="68">2023</text>`;
  svg.setAttribute("aria-label", `Brightness of ${name} from 2012 to 2023 (0 to 100): ` + series.map((v, i) => `${YEARS[i]} ${idx(v)}`).join(", "));
}

function refreshDetails() {
  const r = selected;
  if (!r) { drawSpark(null); return; }
  const s = r.s = sample(r.lat, r.lon, yi, 1);
  const now = changeMode ? s.l23 : s.series[yi];
  const d = idx(s.l23) - idx(s.l12), t = trend(s.delta);
  $("valNow").textContent = changeMode ? (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d) : idx(now);
  $("barNow").style.width = idx(now) + "%";
  $("delta").textContent = t === "same" ? "about the same" : (d > 0 ? "▲ +" : "▼ ") + d + " points";
  drawSpark(s.series, r.name);
}


function announceSelection(name, year) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const message = new SpeechSynthesisUtterance(
    `${name}. Year ${year}.`
  );

  message.lang = "en-US";
  message.rate = 0.9;

  // Play the data note immediately after the voice finishes.
  message.onend = () => {
    if (
      selected &&
      selected.name === name &&
      YEARS[yi] === year &&
      sound.isReady()
    ) {
      sound.tick(selected.s, view(), selected.lon);
    }
  };

  window.speechSynthesis.speak(message);
}


function focusLocation(lat, lon, name, zoom = true) {
  const dir = latLonToPosition(lat, lon);
  controls.autoRotate = false;
  cameraTarget = dir.clone().multiplyScalar(zoom ? 1.82 : camera.position.length());
  resumeRotation = false;

  selected = info(lat, lon, name);
  marker.visible = true;
  place3D(marker, lat, lon, 1.012);
  $("regionName").textContent = selected.name;
  $("coordinates").textContent = coordText(lat, lon);
  $("regionDescription").textContent = describe(selected.name, selected.s);
  refreshDetails();
say(`${selected.name}. Year ${YEARS[yi]}.`);
announceSelection(selected.name, YEARS[yi]);
}

/* ------------------------------------------------------------------ *
 *  5) sound controls
 * ------------------------------------------------------------------ */
let layerOn = true;
function ensureAudio() {
  if (!sound.isReady()) { sound.start(); sound.setVolume($("volume").value / 100); updateChip(); }
}
function updateChip() {
  $("soundChip").textContent = !sound.isReady() ? "🔈 Click to enable sound" : layerOn ? "🔊 Sound on" : "🔇 Sound off";
}
function setLayer(on) {
  layerOn = on; $("layerLights").checked = on; sound.setEnabled(on); updateChip();
}
$("soundChip").addEventListener("click", () => {
  if (!sound.isReady()) { ensureAudio(); setLayer(true); say("Sound enabled."); }
  else { setLayer(!layerOn); say(layerOn ? "Sound on." : "Sound off."); }
});
$("layerLights").addEventListener("change", (e) => { ensureAudio(); setLayer(e.target.checked); });
$("volume").addEventListener("input", (e) => sound.setVolume(e.target.value / 100));
$("mono").addEventListener("change", (e) => sound.setMono(e.target.checked));

let busy = false;
const setBtn = (id, title, subtitle) => {
  const b = $(id);
  b.querySelector(".btn-title").textContent = title;
  if (subtitle) b.querySelector(".btn-sub").textContent = subtitle;
};
const DIFF_TITLE = "▶ Listen to the Difference", DIFF_SUB = "Compare 2012 and 2023";
const TM_TITLE = "⏳ Time Machine", TM_SUB = "Every year, 2012 → 2023";
const needPlace = () => { say("Choose a region first, or move over the Earth."); $("regionSelect").focus(); };


// ---- LISTEN TO THE DIFFERENCE: 2012, then 2023 ----
function listenDifference() {
  ensureAudio();
  const r = targetPlace();
  if (!r) return needPlace();
  if (busy || tmRunning) return;
  busy = true;
  $("listenDiff").disabled = true;
  say(`Playing ${r.name}: 2012, then 2023.`);
  sound.difference(r.s, r.lon, (step) => {
    if (step === "done") {
      busy = false; $("listenDiff").disabled = false;
      setBtn("listenDiff", DIFF_TITLE, DIFF_SUB);
      say(describe(r.name, r.s));
    } else {
      setBtn("listenDiff", step + "…", `${r.name} in ${step}`);
    }
  });
}
$("listenDiff").addEventListener("click", listenDifference);

// ---- TIME MACHINE: the globe flies through 2012 ... 2023 while you hear the place ----
let tmRunning = false;
function endTimeMachine(r) {
  tmRunning = false;
  $("timeMachine").classList.remove("playing");
  setBtn("timeMachine", TM_TITLE, TM_SUB);
  if (r) say(describe(r.name, r.s));
}
function timeMachine() {
  ensureAudio();
  if (busy) return;
  if (tmRunning) { sound.stop(); endTimeMachine(null); say("Time Machine stopped."); return; }
  const r = targetPlace();
  if (!r) return needPlace();
  tmRunning = true;
  $("timeMachine").classList.add("playing");
  setBtn("timeMachine", "■ Stop", "Playing 2012 → 2023");
  say(`Time Machine: ${r.name}, from 2012 to 2023.`);
  sound.timeMachine(r.s.series, r.lon, (i) => {
    if (i < 0) endTimeMachine(r);
    else setYear(i, true);                              // the globe changes year with the music
  });
}

$("timeMachine").addEventListener("click", timeMachine);

/* ------------------------------------------------------------------ *
 *  6) controls: select, year, change, reset
 * ------------------------------------------------------------------ */
$("regionSelect").addEventListener("change", (e) => {
  const r = regions[e.target.value];
  if (!r) return;
  ensureAudio();
  focusLocation(r.lat, r.lon, r.name);
  cursor = { lat: r.lat, lon: r.lon };
});
$("year").addEventListener("input", (e) => { ensureAudio(); setYear(Number(e.target.value)); });
$("changeBtn").addEventListener("click", () => setChange(!changeMode));
$("resetView").addEventListener("click", resetView);

function resetView() {
  if (tmRunning) { sound.stop(); endTimeMachine(null); }
  cameraTarget = new THREE.Vector3(0, 0.2, 3.3);
  resumeRotation = !reducedMotion;
  marker.visible = false; probe.visible = false;
  selected = null; cursor = null;
  $("regionSelect").value = "";
  $("regionName").textContent = "Global View";
  $("coordinates").textContent = "Select a location";
  $("valNow").textContent = "—"; $("barNow").style.width = "0"; $("delta").textContent = "—";
  $("regionDescription").textContent = "Choose a location to explore its nighttime illumination. Move over the Earth to hear it.";
  drawSpark(null);
  say("View reset.");
}

/* ------------------------------------------------------------------ *
 *  7) mouse: hover to hear, click to select
 * ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(globe)[0];
  return hit ? positionToLatLon(hit.point) : null;
}

let lastHover = 0, lastCell = "";
renderer.domElement.addEventListener("pointermove", (event) => {
  if (event.buttons !== 0 || tmRunning || busy) return;          // dragging, or the Time Machine is playing
  const now = performance.now();
  if (now - lastHover < 110) return;
  lastHover = now;
  const p = pick(event);
  if (!p) { probe.visible = false; return; }
  cursor = p;
  probe.visible = true;
  place3D(probe, p.lat, p.lon, 1.01);
  const key = Math.round(p.lat / 1.5) + "," + Math.round(p.lon / 1.5);
  if (key === lastCell) return;
  lastCell = key;
  if (sound.isReady()) sound.tick(sample(p.lat, p.lon, yi, 1), view(), p.lon);
});
renderer.domElement.addEventListener("pointerleave", () => { if (!selected) probe.visible = false; });

let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 7) return;
  ensureAudio();
  const p = pick(e);
  if (!p) return;
  $("regionSelect").value = "";
  cursor = { lat: p.lat, lon: p.lon };
  focusLocation(p.lat, p.lon, null);
});

/* ------------------------------------------------------------------ *
 *  8) keyboard
 * ------------------------------------------------------------------ */
let sayTimer = null;
function moveCursor(dLat, dLon) {
  if (!cursor) {
    const c = positionToLatLon(camera.position);         // start where the camera looks
    cursor = { lat: c.lat, lon: c.lon };
  }
  controls.autoRotate = false;
  cursor.lat = Math.max(-85, Math.min(85, cursor.lat + dLat));
  cursor.lon = ((cursor.lon + dLon + 540) % 360) - 180;
  probe.visible = true;
  place3D(probe, cursor.lat, cursor.lon, 1.01);
  cameraTarget = latLonToPosition(cursor.lat, cursor.lon).multiplyScalar(camera.position.length());

  const r = info(cursor.lat, cursor.lon);
  sound.tick(r.s, view(), r.lon);
  clearTimeout(sayTimer);                                // announce after the user pauses
  sayTimer = setTimeout(() =>
    say(`${r.name}. ${coordText(r.lat, r.lon)}. Light in ${YEARS[yi]}: ${idx(r.s.series[yi])}.`), 450);
}

container.addEventListener("keydown", (e) => {
  const step = e.shiftKey ? 1 : 5;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const keys = {
    ArrowLeft: () => moveCursor(0, -step), ArrowRight: () => moveCursor(0, step),
    ArrowUp: () => moveCursor(step, 0),    ArrowDown: () => moveCursor(-step, 0),
    Enter: () => {
      if (!cursor) return say("Use the arrow keys to move first.");
      $("regionSelect").value = "";
      focusLocation(cursor.lat, cursor.lon, null, false);
      sound.tick(selected.s, view(), selected.lon);
    },
    " ": listenDifference,
    t: timeMachine, c: () => setChange(!changeMode),
    PageUp: () => setYear(yi + 1), PageDown: () => setYear(yi - 1),
    "]": () => setYear(yi + 1), "[": () => setYear(yi - 1),
    Escape: resetView
  };
  const fn = keys[k];
  if (!fn || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  ensureAudio();
  fn();
});

/* ------------------------------------------------------------------ *
 *  9) render loop
 * ------------------------------------------------------------------ */
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener("resize", resize);
resize();

function animate(ts) {
  requestAnimationFrame(animate);
  if (cameraTarget) {
    camera.position.lerp(cameraTarget, 0.07);
    if (camera.position.distanceTo(cameraTarget) < 0.015) {
      camera.position.copy(cameraTarget);
      cameraTarget = null;
      if (resumeRotation) controls.autoRotate = true;
    }
  }
  if (marker.visible) {                                  // pulsing ring
    const k = (ts % 1400) / 1400;
    pulse.scale.setScalar(1 + k * 1.6);
    pulse.material.opacity = 1 - k;
  }
  controls.update();
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ *
 *  10) start: show 2023 at once, load the other years in the background
 * ------------------------------------------------------------------ */
async function init() {
  try {
    await loadGrid("assets/grid12.png");
    textures[LAST] = makeTexture(await loadImage(`assets/y${YEARS[LAST]}.jpg`));
    applyView();
    animate(0);
    say("NASA night lights loaded. Loading the other years…");

    let done = 1;
    await Promise.all(YEARS.slice(0, LAST).map(async (y, i) => {
      textures[i] = makeTexture(await loadImage(`assets/y${y}.jpg`));
      say(`Loading NASA frames ${++done} of ${YEARS.length}…`);
    }));
    changeTexture = makeTexture(await loadImage("assets/change.jpg"));
    say("All 12 years loaded. Move over the Earth to hear it, press Time Machine, or use the arrow keys.");
  } catch (err) {
    say("Could not load the NASA data: " + err.message + ". Check the assets folder and run with Live Server.");
  }
}
init();


/* SONOVA ZOOM BUTTONS */
const zoomUI = document.createElement("div");
zoomUI.className = "sonova-zoom-controls";
zoomUI.innerHTML = `
  <button type="button" aria-label="Zoom in">+</button>
  <button type="button" aria-label="Zoom out">−</button>
`;
container.appendChild(zoomUI);

function sonovaZoom(factor) {
  cameraTarget = null;

  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(
    offset.length() * factor,
    controls.minDistance,
    controls.maxDistance
  );

  camera.position.copy(controls.target)
    .add(offset.setLength(distance));

  controls.update();
}

zoomUI.children[0].addEventListener("click", () => sonovaZoom(0.8));
zoomUI.children[1].addEventListener("click", () => sonovaZoom(1.25));


// ---- "How it sounds" notice: once per session, and again from the button ----
(function howItSounds() {
  const el = $("soundToast");
  if (!el) return;
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    el.classList.remove("show");
    setTimeout(() => { el.hidden = true; }, 400);
    try { sessionStorage.setItem("sonova-sound-guide", "1"); } catch {}
  };
  const open = () => {
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    say("How it sounds. Brighter lights are higher and louder. West is left, east is right. A rising tone means the lights increased over time, a falling tone means they decreased, a steady tone means no change.");
    clearTimeout(timer);
    timer = setTimeout(close, 13000);
  };
  el.querySelector(".toast-close").addEventListener("click", close);
  $("soundGuideBtn").addEventListener("click", () => (el.hidden ? open() : close()));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
  let seen = false;
  try { seen = sessionStorage.getItem("sonova-sound-guide") === "1"; } catch {}
  if (!seen) setTimeout(open, 1500);
})();


// ---- sound settings popover (volume + mono) ----
(function soundSettings() {
  const btn = $("soundSettingsBtn"), box = $("soundSettings");
  if (!btn || !box) return;
  const set = (open) => {
    box.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", (e) => { e.stopPropagation(); set(box.hidden); });
  document.addEventListener("click", (e) => { if (!box.hidden && !box.contains(e.target)) set(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !box.hidden) { set(false); btn.focus(); }
  });
})();
