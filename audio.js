
// EARTH'S SYMPHONY - Sonification Engine
// Current inputs are SIMULATED normalized values.

const SoundEngine = (() => {
  let synth = null;
  let volumePercent = 65;

  const clamp = (value) =>
    Math.max(0, Math.min(1, Number(value)));

  function valueToFrequency(value) {
    return 220 + clamp(value) * 440;
  }

  async function initialize() {
    if (!window.Tone) {
      throw new Error("Tone.js failed to load. Check your internet.");
    }

    await Tone.start();

    if (!synth) {
      synth = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: {
          attack: 0.03,
          decay: 0.12,
          sustain: 0.35,
          release: 0.18
        }
      }).toDestination();
    }

    setVolume(volumePercent);
    return synth;
  }

  function setVolume(percent) {
    volumePercent = Math.max(0, Math.min(100, Number(percent)));

    if (synth) {
      synth.volume.value =
        volumePercent === 0
          ? -Infinity
          : -16 + 20 * Math.log10(volumePercent / 100);
    }
  }

  async function playValue(value) {
    const instrument = await initialize();
    const frequency = valueToFrequency(value);

    instrument.triggerAttackRelease(
      frequency,
      0.7,
      Tone.now() + 0.05
    );
  }

  async function playDifference(oldValue, newValue) {
    const instrument = await initialize();

    const oldFreq = valueToFrequency(oldValue);
    const newFreq = valueToFrequency(newValue);
    const start = Tone.now() + 0.1;

    // Stage 1: 2012
    instrument.triggerAttackRelease(oldFreq, 0.8, start);

    // Stage 2: 2023
    instrument.triggerAttackRelease(newFreq, 0.8, start + 1.5);

    // Stage 3: Stepped pitch transition
    for (let i = 0; i <= 8; i++) {
      const progress = i / 8;
      const frequency =
        oldFreq + (newFreq - oldFreq) * progress;

      instrument.triggerAttackRelease(
        frequency,
        0.12,
        start + 3.0 + i * 0.17
      );
    }
  }

  return {
    playValue,
    playDifference,
    setVolume,
    valueToFrequency
  };
})();

window.SoundEngine = SoundEngine;
