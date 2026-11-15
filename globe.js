
import * as THREE from "three";
import { OrbitControls } from
  "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);
const container = $("globeCanvas");

// 3D scene
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45, 1, 0.1, 100
);
camera.position.set(0, 0.2, 3.3);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.setAttribute("aria-hidden", "true");
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.6;
controls.maxDistance = 5;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.45;

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

if (reducedMotion) controls.autoRotate = false;

// Earth sphere
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 96, 64),
  new THREE.MeshBasicMaterial({
    color: 0xffffff
  })
);
scene.add(globe);

function useTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  globe.material.map = texture;
  globe.material.needsUpdate = true;
}

// Fallback official NASA map
new THREE.TextureLoader().load(
  "assets/nasa-night-2023.png",
  useTexture,
  undefined,
  () => {
    $("globeStatus").textContent =
      "NASA texture could not load. Check assets folder.";
  }
);

// Apply NASA time-series video as a moving texture
const video = $("nasaVideo");

video.addEventListener("playing", () => {
  if (reducedMotion) return;

  if (!globe.userData.videoTexture) {
    globe.userData.videoTexture = new THREE.VideoTexture(video);
  }

  useTexture(globe.userData.videoTexture);
  $("globeStatus").textContent =
    "NASA time-series video playing. Select a region to focus.";
});

if (!reducedMotion) {
  video.play().catch(() => {
    $("globeStatus").textContent =
      "Video unavailable. NASA 2023 map displayed instead.";
  });
} else {
  $("globeStatus").textContent =
    "Reduced-motion mode: NASA 2023 map displayed.";
}

// Selection marker
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.022, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x50e4f5 })
);
marker.visible = false;
scene.add(marker);

const regions = {
  riyadh: {
    name: "Riyadh, Saudi Arabia",
    lat: 24.7136,
    lon: 46.6753
  },
  delhi: {
    name: "Delhi, India",
    lat: 28.6139,
    lon: 77.2090
  },
  london: {
    name: "London, United Kingdom",
    lat: 51.5072,
    lon: -0.1276
  }
};

function latLonToPosition(lat, lon) {
  const latitude = THREE.MathUtils.degToRad(lat);
  const longitude = THREE.MathUtils.degToRad(lon);

  return new THREE.Vector3(
    Math.cos(latitude) * Math.cos(longitude),
    Math.sin(latitude),
    -Math.cos(latitude) * Math.sin(longitude)
  );
}

let cameraTarget = null;
let resumeRotation = false;

function focusLocation(lat, lon, name) {
  const direction = latLonToPosition(lat, lon);

  controls.autoRotate = false;
  cameraTarget = direction.clone().multiplyScalar(2.35);
  resumeRotation = false;

  marker.visible = true;
  marker.position.copy(direction).multiplyScalar(1.018);

  $("regionName").textContent = name;
  $("coordinates").textContent =
    `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;

  $("regionDescription").textContent =
    "This location is selected on NASA's Earth visualization. " +
    "Verified year-specific light intensity data is pending.";

  $("globeStatus").textContent =
    `Focused on ${name}. NASA radiance data not connected yet.`;
}

$("regionSelect").addEventListener("change", (event) => {
  const region = regions[event.target.value];
  if (region) {
    focusLocation(region.lat, region.lon, region.name);
  }
});

// Click a visible point on the globe
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;

renderer.domElement.addEventListener("pointerdown", (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener("pointerup", (event) => {
  if (!pointerStart) return;

  const moved = Math.hypot(
    event.clientX - pointerStart.x,
    event.clientY - pointerStart.y
  );
  pointerStart = null;

  if (moved > 7) return;

  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x =
    ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y =
    -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObject(globe);

  if (!hits.length) return;

  const direction = hits[0].point.clone().normalize();
  const lat = THREE.MathUtils.radToDeg(
    Math.asin(direction.y)
  );
  const lon = THREE.MathUtils.radToDeg(
    Math.atan2(-direction.z, direction.x)
  );

  $("regionSelect").value = "";
  focusLocation(lat, lon, "Selected Location");
});

// Reset camera
$("resetView").addEventListener("click", () => {
  cameraTarget = new THREE.Vector3(0, 0.2, 3.3);
  resumeRotation = !reducedMotion;

  marker.visible = false;
  $("regionSelect").value = "";
  $("regionName").textContent = "Global View";
  $("coordinates").textContent = "Select a location";
});

// Timeline UI preview
const slider = $("yearSlider");
let timelineTimer = null;

function showYear(year) {
  slider.value = year;
  $("yearDisplay").textContent = year;
  $("detailYear").textContent = year;
}

slider.addEventListener("input", () => {
  clearInterval(timelineTimer);
  timelineTimer = null;
  $("playTimeline").textContent = "▶ Preview Timeline";
  showYear(Number(slider.value));
});

$("playTimeline").addEventListener("click", () => {
  if (timelineTimer) {
    clearInterval(timelineTimer);
    timelineTimer = null;
    $("playTimeline").textContent = "▶ Preview Timeline";
    return;
  }

  let year = 2012;
  showYear(year);
  $("playTimeline").textContent = "Ⅱ Pause Preview";

  timelineTimer = setInterval(() => {
    year += 1;
    showYear(year);

    if (year >= 2023) {
      clearInterval(timelineTimer);
      timelineTimer = null;
      $("playTimeline").textContent = "▶ Preview Timeline";
    }
  }, 900);
});

// Responsive render loop
function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

window.addEventListener("resize", resize);
resize();

function animate() {
  requestAnimationFrame(animate);

  if (cameraTarget) {
    camera.position.lerp(cameraTarget, 0.07);

    if (camera.position.distanceTo(cameraTarget) < 0.015) {
      camera.position.copy(cameraTarget);
      cameraTarget = null;
      if (resumeRotation) controls.autoRotate = true;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
