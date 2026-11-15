
// EARTH'S SYMPHONY - User Interface
// DEMO DATA ONLY. Replace with verified NASA data later.

const demoData = {
  a: { name: "Region A — Demo", y2012: 0.25, y2023: 0.70 },
  b: { name: "Region B — Demo", y2012: 0.80, y2023: 0.35 },
  c: { name: "Region C — Demo", y2012: 0.50, y2023: 0.50 }
};

const $ = (id) => document.getElementById(id);

let currentYear = 2012;
let audioBusy = false;

function selectedRegion() {
  return demoData[$("region").value];
}

function format(value) {
  return Number(value).toFixed(2);
}

function describeChange(data) {
  const difference = data.y2023 - data.y2012;

  if (Math.abs(difference) < 0.001) {
    return "The normalized demo light value is unchanged between 2012 and 2023.";
  }

  const direction = difference > 0 ? "increased" : "decreased";

  return `The normalized demo light value ${direction}
  by ${format(Math.abs(difference))} between 2012 and 2023.
  This is a simulated example, not a NASA measurement.`;
}

function updateInterface() {
  const data = selectedRegion();
  const delta = data.y2023 - data.y2012;

  $("regionName").textContent = data.name;
  $("value2012").textContent = format(data.y2012);
  $("value2023").textContent = format(data.y2023);
  $("difference").textContent =
    (delta > 0 ? "+" : "") + format(delta);

  $("description").textContent = describeChange(data);
  $("comparisonDescription").textContent = describeChange(data);

  $("comp2012").textContent = format(data.y2012);
  $("comp2023").textContent = format(data.y2023);

  $("yearLabel").textContent = currentYear;
  $("playLabel").textContent = `Play ${currentYear}`;
}

function setMode(mode) {
  const isComparison = mode === "comparison";

  $("explorer").hidden = isComparison;
  $("audioPlayer").hidden = isComparison;
  $("comparisonView").hidden = !isComparison;

  $("exploreTab").classList.toggle("active", !isComparison);
  $("compareTab").classList.toggle("active", isComparison);

  $("exploreTab").setAttribute("aria-pressed", String(!isComparison));
  $("compareTab").setAttribute("aria-pressed", String(isComparison));
}

async function playSelectedYear() {
  if (audioBusy) return;

  if (!$("nightLights").checked) {
    $("status").textContent = "Enable Night Lights to play audio.";
    return;
  }

  const data = selectedRegion();
  const value = currentYear === 2012 ? data.y2012 : data.y2023;

  try {
    await SoundEngine.playValue(value);
    $("status").textContent =
      `Playing ${currentYear} for ${data.name}. Demo values.`;
  } catch (error) {
    $("status").textContent = error.message;
  }
}

async function compareYears() {
  if (audioBusy) return;

  if (!$("nightLights").checked) {
    $("status").textContent = "Enable Night Lights to compare.";
    return;
  }

  const data = selectedRegion();

  try {
    audioBusy = true;
    $("compare").disabled = true;
    $("compareAgain").disabled = true;
    $("playSelected").disabled = true;

    await SoundEngine.playDifference(data.y2012, data.y2023);

    $("status").textContent =
      `Playing 2012, then 2023, then the difference for ${data.name}.`;

    // Unlock after the scheduled comparison has finished.
    setTimeout(() => {
      audioBusy = false;
      $("compare").disabled = false;
      $("compareAgain").disabled = false;
      $("playSelected").disabled = false;
    }, 4700);

  } catch (error) {
    audioBusy = false;
    $("compare").disabled = false;
    $("compareAgain").disabled = false;
    $("playSelected").disabled = false;
    $("status").textContent = error.message;
  }
}

// Connect the interactive controls.
$("region").addEventListener("change", updateInterface);

$("yearRange").addEventListener("input", (event) => {
  currentYear = Number(event.target.value);
  updateInterface();
});

$("playSelected").addEventListener("click", playSelectedYear);
$("compare").addEventListener("click", compareYears);
$("compareAgain").addEventListener("click", compareYears);

$("volume").addEventListener("input", (event) => {
  SoundEngine.setVolume(event.target.value);
});

$("exploreTab").addEventListener("click", () => {
  setMode("explorer");
});

$("compareTab").addEventListener("click", () => {
  setMode("comparison");
});

$("nightLights").addEventListener("change", (event) => {
  $("status").textContent = event.target.checked
    ? "Night Lights enabled."
    : "Night Lights disabled.";
});

updateInterface();
setMode("explorer");
