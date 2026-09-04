// Sound system using original Elma WAV samples.
window.EM = window.EM || {};

EM.Sound = (function () {
  let ac = null;
  let master = null;
  let muted = false;
  const buffers = {};

  function ensure() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 1.0;
      // One-shots + engine loop can sum above full scale; the original mixed
      // in software with per-bank normalization (H_WAV.CPP:113-129).
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.knee.value = 12;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      master.connect(comp);
      comp.connect(ac.destination);
    } catch (e) {
      ac = null;
    }
  }

  const SOUNDS = {
    gaz:      "snd/GAZ.WAV",
    ugvas:    "snd/UGRAS.WAV",
    harl:     "snd/HARL.WAV",
    harl2:    "snd/HARL2.WAV",
    eves:     "snd/EVES.WAV",
    utodes:   "snd/UTODES.WAV",
    siker:    "snd/SIKER.WAV",
    fordul:   "snd/FORDUL.WAV",
    dorzsol:  "snd/DORZSOL.WAV",
    alap:     "snd/ALAP.WAV",
    torik:    "snd/TORIK.WAV",
  };

  let loaded = false;
  function loadAll() {
    if (loaded) return Promise.resolve();
    ensure();
    if (!ac) return Promise.resolve();
    const promises = Object.entries(SOUNDS).map(([name, url]) => {
      return fetch(url).then(r => r.arrayBuffer()).then(buf => {
        return ac.decodeAudioData(buf).then(decoded => { buffers[name] = decoded; });
      }).catch(() => {});
    });
    return Promise.all(promises).then(() => { loaded = true; });
  }

  function play(name, vol, loop) {
    if (!ac || !buffers[name]) return;
    const src = ac.createBufferSource();
    src.buffer = buffers[name];
    src.loop = !!loop;
    const g = ac.createGain();
    g.gain.value = vol !== undefined ? vol : 1.0;
    src.connect(g);
    g.connect(master);
    src.start();
    return { src, gain: g };
  }

  // Engine sound using GAZ.WAV looped
  let engineSrc = null;
  let engineGain = null;

  function startEngine() {
    if (!ac || engineSrc) return;
    const result = play("gaz", 0, true);
    if (!result) return;
    engineSrc = result.src;
    engineGain = result.gain;
  }

  function setEngine(motorFrequency, gas) {
    if (!ac) return;
    startEngine();
    if (!engineSrc) return;
    const t = ac.currentTime;
    // Original: playback stepping is multiplied directly by frekvencia
    // (H_HIGH.CPP setmotor, frekvencia ∈ [1..2]) — revving raises the pitch.
    engineSrc.playbackRate.setTargetAtTime(Math.max(0.3, Math.min(3, motorFrequency)), t, 0.05);
    const vol = (gas ? 0.35 : 0.12) * (0.3 + 0.7 * Math.min(1, motorFrequency - 1));
    if (!muted) {
      engineGain.gain.setTargetAtTime(vol, t, 0.08);
    }
  }

  function stopEngine() {
    if (engineSrc) {
      try { engineSrc.stop(); } catch(e) {}
      engineSrc = null;
      engineGain = null;
    }
  }

  // Event-driven sounds
  function volt() {
    play("ugvas", 0.8);
  }

  function bump(vol) {
    play("harl", Math.min(0.8, vol || 0.4));
  }

  function apple() {
    play("eves", 0.7);
  }

  function death() {
    play("utodes", 0.8);
  }

  function finish() {
    play("siker", 0.8);
  }

  function turn() {
    play("fordul", 0.4);
  }

  // consume physics/main events
  function update(game) {
    ensure();
    if (!ac) return;
    if (muted) {
      // Mute kills the motor loop and all one-shots, but events must still
      // be drained so they don't pile up and blast later.
      game.events.length = 0;
      return;
    }
    if (game.status === "riding") {
      const m = game.motor;
      const om = m.flipped_bike ? Math.abs(m.left_wheel.angular_velocity) : Math.abs(m.right_wheel.angular_velocity);
      let f = om * 0.025;
      if (f > 30) f = 30;
      const mf = 2 - Math.exp(-f);
      setEngine(mf, game.input.gas ? 1 : 0);
    } else {
      stopEngine();
    }
    // One-shots (death/finish) fire on the same frame the status changes,
    // so they must play even though the engine just stopped.
    for (const ev of game.events) {
      if (ev.type === "volt") volt();
      else if (ev.type === "bump") bump(ev.vol);
      else if (ev.type === "apple") apple();
      else if (ev.type === "death") death();
      else if (ev.type === "finish") finish();
      else if (ev.type === "turn") turn();
    }
    game.events.length = 0;
  }

  function resume() {
    ensure();
    if (ac && ac.state === "suspended") ac.resume();
    loadAll();
  }

  function setMuted(m) {
    muted = m;
    if (muted) stopEngine(); // kill the drone immediately on mute
  }

  return { update, resume, loadAll, setMuted };
})();
