// Replay recorder — captures physics state at 30fps, saves to localStorage,
// provides ghost interpolation for playback.
// Format is a simplified JS-native version of Elma's .rec state-capture approach.
window.EM = window.EM || {};

EM.Recorder = (function () {
  const STORAGE_PREFIX = "elma-replay-";
  const RECORD_FPS = 30;
  const RECORD_DT = 1 / RECORD_FPS; // seconds between recorded frames
  const PI2 = 2 * Math.PI;
  const LAST_SUFFIX = "-last"; // "последний заезд" replay key suffix

  // ---- Recording ----

  function createRecorder() {
    return {
      frames: [],
      events: [],      // sound events [{time, type, volume}]
      _accum: 0,       // time accumulator for fixed-rate sampling
      _levelName: "",
      _levelFile: "",
    };
  }

  // Capture one frame from the current motor state.
  function captureFrame(rec, motor, gameTime, gas) {
    const m = motor;
    rec.frames.push({
      t: gameTime,
      bx: m.bike.r.x,
      by: m.bike.r.y,
      lx: m.left_wheel.r.x - m.bike.r.x,
      ly: m.left_wheel.r.y - m.bike.r.y,
      rx: m.right_wheel.r.x - m.bike.r.x,
      ry: m.right_wheel.r.y - m.bike.r.y,
      hx: m.head_r.x - m.bike.r.x,
      hy: m.head_r.y - m.bike.r.y,
      bodyX: m.body_r.x - m.bike.r.x,
      bodyY: m.body_r.y - m.bike.r.y,
      rot: m.bike.rotation,
      wL: m.left_wheel.rotation,
      wR: m.right_wheel.rotation,
      flags: (m.flipped_bike ? 2 : 0) | (m.gravity_direction << 2),
      gas: gas ? 1 : 0,
      apples: m.apple_count,
    });
  }

  // Called each physics step. Accumulates time and samples at RECORD_FPS.
  function tick(rec, motor, gameTime, dt, gas) {
    if (rec.frames.length >= MAX_REC_FRAMES) return; // 5-minute cap like the original
    rec._accum += dt;
    if (rec._accum >= RECORD_DT) {
      rec._accum -= RECORD_DT;
      captureFrame(rec, motor, gameTime, gas);
    }
  }

  // ---- Serialization ----

  // Hard limits from the original engine (RECORDER.CPP:15-16):
  // 8981 frames ≈ 5 minutes at ~68.68 fps; 3900 sound events max.
  const MAX_REC_FRAMES = 8981;
  const MAX_REC_EVENTS = 3900;

  // Append an event with a game-unit timestamp (eddig). Mirrors
  // recorder::addhang — events are stored in the same timebase as frames.
  function event(rec, type, t, opts) {
    if (!rec || rec.events.length >= MAX_REC_EVENTS) return;
    rec.events.push(Object.assign({ time: t, type: type }, opts));
  }

  function serialize(rec, levelName, levelFile) {
    return JSON.stringify({
      v: 1,
      level: levelName,
      file: levelFile,
      fps: RECORD_FPS,
      frames: rec.frames,
      events: rec.events,
    });
  }

  function deserialize(json) {
    return JSON.parse(json);
  }

  // ---- Storage: IndexedDB + in-memory cache ----
  // localStorage (~5 MB quota) could not hold hundreds of level replays:
  // a single full 5-minute run is ~3.8 MB as JSON and would throw
  // QuotaExceededError, silently killing the ghost. Replays now live in
  // IndexedDB (hundreds of MB) in a compact columnar binary format
  // (~35 bytes/frame vs ~200 in JSON), with a small LRU in-memory cache so
  // the synchronous load()/hasReplay() callers keep working without await.

  const DB_NAME = "elma-replay-db";
  const DB_STORE = "replays";
  const CACHE_MAX = 8;

  let _db = null;
  let _dbPromise = null;
  const _cache = new Map(); // key -> replay data (plain object format)

  function openDB() {
    if (_dbPromise) return _dbPromise;
    if (typeof indexedDB === "undefined") { _dbPromise = Promise.resolve(null); return _dbPromise; }
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            db.createObjectStore(DB_STORE, { keyPath: "key" });
          }
        };
        req.onsuccess = () => { _db = req.result; resolve(_db); };
        req.onerror = () => { console.warn("IndexedDB open failed:", req.error); resolve(null); };
      } catch (e) { console.warn("IndexedDB unavailable:", e); resolve(null); }
    });
    return _dbPromise;
  }

  async function idbPut(record) {
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => { console.warn("replay IDB put failed:", tx.error); resolve(false); };
      } catch (e) { console.warn("replay IDB put failed:", e); resolve(false); }
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => { console.warn("replay IDB get failed:", req.error); resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  async function idbDel(key) {
    const db = await openDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  function cacheGet(key) {
    const v = _cache.get(key);
    if (v !== undefined) { // refresh LRU order
      _cache.delete(key);
      _cache.set(key, v);
      return v;
    }
    return null;
  }

  function cacheSet(key, replay) {
    _cache.set(key, replay);
    if (_cache.size > CACHE_MAX) {
      const oldest = _cache.keys().next().value;
      _cache.delete(oldest);
    }
  }

  // ---- Columnar binary encoding (compact; mirrors .rec field layout) ----
  const POS_RATIO_ENC = 1000;
  const BIKE_ROT_ENC = 10000 / PI2;
  const WHEEL_ROT_ENC = 250 / PI2;

  function encodeFrames(frames) {
    const n = frames.length;
    const t = new Float32Array(n), bx = new Float32Array(n), by = new Float32Array(n);
    const lx = new Int16Array(n), ly = new Int16Array(n), rx = new Int16Array(n), ry = new Int16Array(n);
    const bodyX = new Int16Array(n), bodyY = new Int16Array(n), hx = new Int16Array(n), hy = new Int16Array(n);
    const rot = new Int16Array(n);
    const wL = new Uint8Array(n), wR = new Uint8Array(n);
    const flags = new Uint8Array(n), gas = new Uint8Array(n), apples = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      t[i] = f.t; bx[i] = f.bx; by[i] = f.by;
      lx[i] = clampI16(f.lx * POS_RATIO_ENC); ly[i] = clampI16(f.ly * POS_RATIO_ENC);
      rx[i] = clampI16(f.rx * POS_RATIO_ENC); ry[i] = clampI16(f.ry * POS_RATIO_ENC);
      bodyX[i] = clampI16(f.bodyX * POS_RATIO_ENC); bodyY[i] = clampI16(f.bodyY * POS_RATIO_ENC);
      hx[i] = clampI16(f.hx * POS_RATIO_ENC); hy[i] = clampI16(f.hy * POS_RATIO_ENC);
      let r = f.rot; while (r <= 0) r += PI2; while (r > PI2) r -= PI2;
      rot[i] = clampI16(r * BIKE_ROT_ENC);
      wL[i] = clampU8(((f.wL % PI2) + PI2) % PI2 * WHEEL_ROT_ENC);
      wR[i] = clampU8(((f.wR % PI2) + PI2) % PI2 * WHEEL_ROT_ENC);
      flags[i] = f.flags || 0; gas[i] = f.gas || 0; apples[i] = f.apples || 0;
    }
    return { n, t, bx, by, lx, ly, rx, ry, bodyX, bodyY, hx, hy, rot, wL, wR, flags, gas, apples };
  }

  function decodeFrames(col) {
    const n = col.n, frames = new Array(n);
    for (let i = 0; i < n; i++) {
      frames[i] = {
        t: col.t[i],
        bx: col.bx[i], by: col.by[i],
        lx: col.lx[i] / POS_RATIO_ENC, ly: col.ly[i] / POS_RATIO_ENC,
        rx: col.rx[i] / POS_RATIO_ENC, ry: col.ry[i] / POS_RATIO_ENC,
        hx: col.hx[i] / POS_RATIO_ENC, hy: col.hy[i] / POS_RATIO_ENC,
        bodyX: col.bodyX[i] / POS_RATIO_ENC, bodyY: col.bodyY[i] / POS_RATIO_ENC,
        rot: col.rot[i] / BIKE_ROT_ENC,
        wL: col.wL[i] / WHEEL_ROT_ENC, wR: col.wR[i] / WHEEL_ROT_ENC,
        flags: col.flags[i], gas: col.gas[i], apples: col.apples[i],
      };
    }
    return frames;
  }

  function makeRecordKey(levelFile, isLast) {
    return STORAGE_PREFIX + (levelFile || "unknown") + (isLast ? LAST_SUFFIX : "");
  }

  function makeReplayRecord(rec, levelName, levelFile, isLast) {
    return {
      key: makeRecordKey(levelFile, isLast),
      v: 1,
      level: levelName,
      file: levelFile,
      fps: rec.fps || RECORD_FPS,
      frames: encodeFrames(rec.frames),
      events: rec.events || [],
    };
  }

  function decodeReplay(record) {
    return {
      v: record.v,
      level: record.level,
      file: record.file,
      fps: record.fps,
      frames: decodeFrames(record.frames),
      events: record.events || [],
    };
  }

  // Initialize storage (open IndexedDB + migrate legacy localStorage replays).
  async function init() {
    await openDB();
    await migrateFromLocalStorage();
  }

  // Async load (IndexedDB) with in-memory cache. Prefer this from async code
  // (switchLevel / boot) so the ghost is present before rendering.
  async function loadAsync(levelFile, isLast) {
    const key = makeRecordKey(levelFile, isLast);
    const cached = cacheGet(key);
    if (cached) return cached;
    const record = await idbGet(key);
    if (!record) return null;
    const replay = decodeReplay(record);
    cacheSet(key, replay);
    return replay;
  }

  // Sync load from cache (fast path: current level was preloaded via
  // loadAsync on switch/boot, or just saved). Warms the cache otherwise.
  function load(levelFile) {
    const key = makeRecordKey(levelFile, false);
    const cached = cacheGet(key);
    if (cached) return cached;
    loadAsync(levelFile, false);
    return null;
  }

  function hasReplay(levelFile) {
    return !!cacheGet(makeRecordKey(levelFile, false));
  }

  function remove(levelFile) {
    _cache.delete(makeRecordKey(levelFile, false));
    _cache.delete(makeRecordKey(levelFile, true));
    idbDel(makeRecordKey(levelFile, false));
    idbDel(makeRecordKey(levelFile, true));
  }

  // ---- Last run ("последний заезд") ----
  // Stored separately from the personal-best replay so a slower run can still
  // be shown as a ghost when there is no best/WR replay yet. Keyed by the
  // same level URL with a "-last" suffix.

  function lastKey(levelFile) {
    return makeRecordKey(levelFile, true);
  }

  // Save the replay of the most recent finished run (best is saved by save()).
  function saveLast(rec, levelName, levelFile) {
    if (!rec || !levelFile || !rec.frames || !rec.frames.length) return null;
    const key = makeRecordKey(levelFile, true);
    cacheSet(key, normalizeReplay(rec, levelName, levelFile));
    idbPut(makeReplayRecord(rec, levelName, levelFile, true));
    return key;
  }

  // Save the personal-best replay. Returns the storage key.
  function save(rec, levelName, levelFile) {
    const key = makeRecordKey(levelFile, levelName, false);
    cacheSet(key, normalizeReplay(rec, levelName, levelFile));
    idbPut(makeReplayRecord(rec, levelName, levelFile, false));
    return key;
  }

  // Load the replay of the most recent finished run (may be slower than best).
  async function loadLastAsync(levelFile) {
    return loadAsync(levelFile, true);
  }

  function loadLast(levelFile) {
    const key = makeRecordKey(levelFile, true);
    const cached = cacheGet(key);
    if (cached) return cached;
    loadAsync(levelFile, true);
    return null;
  }

  function hasLast(levelFile) {
    return !!cacheGet(makeRecordKey(levelFile, true));
  }

  // Snapshot recorder frames into the plain in-memory format used by
  // interpolate()/playback, so later recorder mutation can't corrupt the cache.
  function normalizeReplay(rec, levelName, levelFile) {
    return {
      v: 1,
      level: levelName,
      file: levelFile,
      fps: rec.fps || RECORD_FPS,
      frames: rec.frames.slice(),
      events: (rec.events || []).slice(),
    };
  }

  // One-time migration: move legacy localStorage replays (elma-replay-*) into
  // IndexedDB and free the localStorage quota.
  async function migrateFromLocalStorage() {
    if (typeof localStorage === "undefined") return;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.frames || !parsed.frames.length) { toRemove.push(k); continue; }
        const isLast = k.endsWith(LAST_SUFFIX);
        const file = parsed.file || k.slice(STORAGE_PREFIX.length).replace(new RegExp(LAST_SUFFIX + "$"), "");
        const rec = { frames: parsed.frames, events: parsed.events || [] };
        const record = makeReplayRecord(rec, parsed.level, file, isLast);
        record.key = k; // preserve the original key
        const ok = await idbPut(record);
        if (ok) {
          cacheSet(k, normalizeReplay(rec, parsed.level, file));
          toRemove.push(k);
        }
      } catch (e) { /* skip corrupt entry */ }
    }
    for (const k of toRemove) {
      try { localStorage.removeItem(k); } catch (e) {}
    }
  }

  // ---- Ghost interpolation ----

  // Given a replay data object and a time, return interpolated motor pose:
  // { bx, by, lx, ly, rx, ry, hx, hy, rot, wL, wR, flags }
  // Returns null if time is outside the recording range.
  function interpolate(replayData, time) {
    const frames = replayData.frames;
    if (!frames || frames.length < 2) return null;

    const fps = replayData.fps || RECORD_FPS;
    const t = time * fps; // frame index
    const idx = Math.floor(t);
    if (idx < 0 || idx >= frames.length - 1) return null;

    const f1 = frames[idx];
    const f2 = frames[idx + 1];
    const w2 = t - idx; // fractional part
    const w1 = 1 - w2;

    const lerp = (a, b) => a * w1 + b * w2;

    // Handle rotation wrap-around
    let rot1 = f1.rot, rot2 = f2.rot;
    if (Math.abs(rot1 - rot2) > Math.PI) {
      if (rot1 > rot2) rot2 += 2 * Math.PI;
      else rot1 += 2 * Math.PI;
    }
    // Wheel angles wrap mod 2π in .rec files — unwrap before lerping or the
    // ghost wheel spins backwards for one frame at each wrap crossing.
    const unwrap = (a, b) => {
      let d = b - a;
      if (d > Math.PI) d -= 2 * Math.PI;
      else if (d < -Math.PI) d += 2 * Math.PI;
      return a + d;
    };

    return {
      bx: lerp(f1.bx, f2.bx),
      by: lerp(f1.by, f2.by),
      lx: lerp(f1.lx, f2.lx),
      ly: lerp(f1.ly, f2.ly),
      rx: lerp(f1.rx, f2.rx),
      ry: lerp(f1.ry, f2.ry),
      hx: lerp(f1.hx, f2.hx),
      hy: lerp(f1.hy, f2.hy),
      bodyX: lerp(f1.bodyX, f2.bodyX),
      bodyY: lerp(f1.bodyY, f2.bodyY),
      rot: lerp(rot1, rot2),
      wL: unwrap(f1.wL, f2.wL),
      wR: unwrap(f1.wR, f2.wR),
      flags: f1.flags,
      apples: f1.apples,
    };
  }

  // Get the total recording duration in seconds.
  function duration(replayData) {
    if (!replayData || !replayData.frames || replayData.frames.length < 2) return 0;
    return replayData.frames[replayData.frames.length - 1].t;
  }

  // ---- .rec file parser (Elma classic binary format) ----
  // Parses a .rec file and returns our internal frame format.
  function parseRec(buffer) {
    const dv = new DataView(buffer);
    let o = 0;

    // Header (36 bytes)
    const numFrames = dv.getUint32(o, true); o += 4;
    o += 4; // unused/version
    const isMulti = dv.getInt32(o, true); o += 4;
    const isFlagTag = dv.getInt32(o, true); o += 4;
    o += 4; // link
    // level filename (12 bytes + 4 padding = 16)
    let levelName = "";
    for (let i = 0; i < 12; i++) {
      const c = dv.getUint8(o + i);
      if (c) levelName += String.fromCharCode(c);
    }
    o += 16;

    // Frame data is stored column-major: all of field X for all frames, then all of field Y...
    const BIKE_ROT_RATIO = 10000 / PI2;
    const WHEEL_ROT_RATIO = 250 / PI2;
    const POS_RATIO = 1000.0;
    const FPS = 30;
    const DT = 1 / FPS;

    const frames = [];
    for (let i = 0; i < numFrames; i++) {
      // read raw values from .rec (y-down coordinate system)
      const rawBx = dv.getFloat32(o + i * 4, true);
      const rawBy = dv.getFloat32(o + numFrames * 4 + i * 4, true);
      const rawLwx = dv.getInt16(o + numFrames * 8 + i * 2, true);
      const rawLwy = dv.getInt16(o + numFrames * 10 + i * 2, true);
      const rawRwx = dv.getInt16(o + numFrames * 12 + i * 2, true);
      const rawRwy = dv.getInt16(o + numFrames * 14 + i * 2, true);
      const rawBodyX = dv.getInt16(o + numFrames * 16 + i * 2, true);
      const rawBodyY = dv.getInt16(o + numFrames * 18 + i * 2, true);
      const rawRot = dv.getInt16(o + numFrames * 20 + i * 2, true);
      const rawWL = dv.getUint8(o + numFrames * 22 + i);
      const rawWR = dv.getUint8(o + numFrames * 23 + i);
      const flags = dv.getUint8(o + numFrames * 24 + i);

      // convert to physics coords
      const bx = rawBx;
      const by = rawBy;
      const lx = rawLwx / POS_RATIO;
      const ly = rawLwy / POS_RATIO;
      const rx = rawRwx / POS_RATIO;
      const ry = rawRwy / POS_RATIO;
      const bodyX = rawBodyX / POS_RATIO;
      const bodyY = rawBodyY / POS_RATIO;
      const rot = rawRot / BIKE_ROT_RATIO;
      const wL = rawWL / WHEEL_ROT_RATIO;
      const wR = rawWR / WHEEL_ROT_RATIO;
      const flipped = (flags & 2) ? 1 : 0;

      // compute head from body + rotation (szamitfejr)
      const ci = Math.cos(rot), si = Math.sin(rot);
      let hx, hy;
      if (flipped) {
        hx = bodyX + ci * 0.09 + (-si) * 0.63;
        hy = bodyY + si * 0.09 + ci * 0.63;
      } else {
        hx = bodyX - ci * 0.09 + (-si) * 0.63;
        hy = bodyY - si * 0.09 + ci * 0.63;
      }

      frames.push({
        t: i * DT, bx, by, lx, ly, rx, ry, hx, hy,
        bodyX, bodyY, rot, wL, wR, flags, apples: 0,
      });
    }

    // NOTE on flags bits: in real Elma .rec files only bit1 (flipped) and
    // bit0 (gas) are meaningful per frame; bits 2-3 are the frame-count
    // encoding / FlagTag data (ADATOK.CPP berakrecbehosszat), NOT gravity.
    // Mark parsed replays so ghost drawing doesn't misread gravity bits;
    // .rec ghosts don't integrate physics, so gravity state is irrelevant.
    return { level: levelName, frames, events: [], fps: 30 / (182 * 0.0024), fromNativeRec: true };
  }

  // Load a .rec file via fetch and parse it.
  async function loadRec(url) {
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    return parseRec(buf);
  }

  // ---- Native .rec export ----

  const BIKE_ROT_RATIO_EXPORT = 10000 / PI2;
  const WHEEL_ROT_RATIO_EXPORT = 250 / PI2;
  const POS_RATIO_EXPORT = 1000.0;
  const EOR_MARKER = 0x00492f75;

  function clampI16(v) { return Math.max(-32768, Math.min(32767, Math.round(v))); }
  function clampU8(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  // Encode frame count into MSB of flags for frames 40–71 (≥80 frames only)
  function encodeFrameCountFlags(flags, count) {
    if (count < 80) return;
    let val = count >>> 0;
    for (let i = 0; i < 32; i++) {
      flags[40 + i] = (flags[40 + i] & 0x7F) | ((val & 1) ? 0x80 : 0);
      val >>>= 1;
    }
  }

  /**
   * Convert internal JS replay data to a native Elma .rec ArrayBuffer.
   * @param {Object} replayData - { frames: [...] }
   * @param {string} levelFilename - e.g. "AT15.LEV" (12 chars max)
   * @returns {ArrayBuffer}
   */
  function toRecBuffer(replayData, levelFilename, levelId) {
    const frames = replayData.frames || [];
    const N = frames.length;
    const events = replayData.events || [];

    const totalSize = 36 + 27 * N + 4 + 16 * events.length + 4;
    const buf = new ArrayBuffer(totalSize);
    const dv = new DataView(buf);
    let o = 0;

    // ---- Header (36 bytes) ----
    dv.setUint32(o, N, true); o += 4;
    dv.setUint32(o, 131, true); o += 4;      // version 0x83
    dv.setUint32(o, 0, true); o += 4;        // is_multi
    dv.setUint32(o, 0, true); o += 4;        // tag (flagtag replays only)
    // level id ("belyeg") — lets the original game pair this .rec with its
    // .lev; 0 means "no check" in the original loader.
    dv.setUint32(o, levelId >>> 0, true); o += 4;
    // Full .lev filename WITH extension — the original looks the file up by
    // exactly this name (access_topol(palyanev)), so "QWQUU001" would fail.
    let fname = levelFilename || "";
    if (!/\.lev$/i.test(fname)) fname += ".LEV";
    fname = fname.substring(0, 12);
    for (let i = 0; i < 12; i++) {
      dv.setUint8(o + i, i < fname.length ? fname.charCodeAt(i) : 0);
    }
    o += 12;
    dv.setUint32(o, 0, true); o += 4;        // unused

    // ---- Build raw flags (pass 1) ----
    const rawFlags = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const f = frames[i];
      // gibberish: copy LSB of bike_y float into bits 4-7 (elma bug compat)
      const bikeYBytes = new Uint8Array(new Float32Array([f.by]).buffer);
      let fl = ((f.gas || 0) ? 1 : 0) | ((f.flags & 2)); // bit0=gas bit1=flipped
      fl = (fl & 0x0F) | (bikeYBytes[0] & 0xF0);
      rawFlags[i] = fl;
    }
    encodeFrameCountFlags(rawFlags, N);

    // ---- Frame data (column-major) ----
    for (let i = 0; i < N; i++) dv.setFloat32(o + i * 4, frames[i].bx, true); o += N * 4;
    for (let i = 0; i < N; i++) dv.setFloat32(o + i * 4, frames[i].by, true); o += N * 4;
    for (let i = 0; i < N; i++) dv.setInt16(o + i * 2, clampI16(frames[i].lx * POS_RATIO_EXPORT), true); o += N * 2;
    for (let i = 0; i < N; i++) dv.setInt16(o + i * 2, clampI16(frames[i].ly * POS_RATIO_EXPORT), true); o += N * 2;
    for (let i = 0; i < N; i++) dv.setInt16(o + i * 2, clampI16(frames[i].rx * POS_RATIO_EXPORT), true); o += N * 2;
    for (let i = 0; i < N; i++) dv.setInt16(o + i * 2, clampI16(frames[i].ry * POS_RATIO_EXPORT), true); o += N * 2;
    for (let i = 0; i < N; i++) dv.setInt16(o + i * 2, clampI16(frames[i].bodyX * POS_RATIO_EXPORT), true); o += N * 2;
    for (let i = 0; i < N; i++) dv.setInt16(o + i * 2, clampI16(frames[i].bodyY * POS_RATIO_EXPORT), true); o += N * 2;
    // bike rotation → normalize to 0..2π, then int16
    for (let i = 0; i < N; i++) {
      let rot = frames[i].rot;
      while (rot <= 0) rot += PI2;
      while (rot > PI2) rot -= PI2;
      dv.setInt16(o + i * 2, clampI16(rot * BIKE_ROT_RATIO_EXPORT), true);
    }
    o += N * 2;
    // wheel rotations → uint8
    for (let i = 0; i < N; i++) {
      let wl = frames[i].wL; if (wl <= 0) wl += PI2;
      dv.setUint8(o + i, clampU8(wl * WHEEL_ROT_RATIO_EXPORT));
    }
    o += N;
    for (let i = 0; i < N; i++) {
      let wr = frames[i].wR; if (wr <= 0) wr += PI2;
      dv.setUint8(o + i, clampU8(wr * WHEEL_ROT_RATIO_EXPORT));
    }
    o += N;
    // flags
    for (let i = 0; i < N; i++) dv.setUint8(o + i, rawFlags[i]);
    o += N;
    // motor_frequency (default 0 = 1.0 Hz idle)
    for (let i = 0; i < N; i++) dv.setUint8(o + i, 0);
    o += N;
    // friction_volume (default 0 = silent)
    for (let i = 0; i < N; i++) dv.setUint8(o + i, 0);
    o += N;

    // ---- Events ----
    // Sound enum (HANGHIGH.H:2-4): UTODES=1, TORES=2, SIKER=3, EVES=4,
    // FORDULAS=5, UGRAS1=6, UGRAS2=7. Volumes must be in (0,1)
    // (H_HIGH.CPP:142-143 rejects <= 0 / >= 1). Timestamps are in game
    // units — the same timebase as frames (LEJATSZO.CPP:196 addhang(eddig,...)).
    const typeMap = { death: 2, finish: 3, apple: 4, turn: 5, volt_right: 6, volt_left: 7 };
    dv.setUint32(o, events.length, true); o += 4;
    for (const ev of events) {
      dv.setFloat64(o, ev.time, true); o += 8;          // t (game units)
      dv.setInt16(o, -1, true); o += 2;                 // objszam (-1 = none)
      const wav = typeMap[ev.type];
      if (wav === undefined) continue;                  // unknown event type: skip entirely
      dv.setUint8(o, wav); o += 1;
      dv.setUint8(o, 0); o += 1;
      let vol = typeof ev.volume === "number" && ev.volume > 0 ? ev.volume : 0.99;
      if (vol >= 1.0) vol = 0.99;
      if (vol <= 0.0) vol = 0.01;
      dv.setFloat32(o, vol, true); o += 4;
    }

    // ---- EOR marker ----
    dv.setUint32(o, EOR_MARKER, true);
    return buf;
  }

  /**
   * Trigger a browser download of a .rec file.
   */
  function downloadRec(replayData, levelFilename, levelId) {
    const buf = toRecBuffer(replayData, levelFilename, levelId);
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (levelFilename || "replay") + ".rec";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    RECORD_FPS,
    MAX_REC_FRAMES,
    MAX_REC_EVENTS,
    createRecorder,
    tick,
    event,
    captureFrame,
    serialize,
    deserialize,
    init,
    loadAsync,
    loadLastAsync,
    save,
    load,
    hasReplay,
    remove,
    saveLast,
    loadLast,
    hasLast,
    interpolate,
    duration,
    parseRec,
    loadRec,
    toRecBuffer,
    downloadRec,
  };
})();
