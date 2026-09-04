// Win screen: best-time tracking, leaderboard, name prompt.
// Stores data in localStorage under key "elma-leaderboard".
window.EM = window.EM || {};

EM.Win = (function () {
  const STORAGE_KEY = "elma-leaderboard";
  const SCHEMA_VERSION = 2; // v2: { v, entries: {...} }

  let _migrated = false;

  let _lastCorruptBackup = null;
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // v1 format was a bare map; v2 wraps it with a version field.
      if (parsed && typeof parsed === "object" && parsed.v === SCHEMA_VERSION) return parsed.entries || {};
      if (parsed && typeof parsed === "object") return parsed; // legacy bare map
      return {};
    } catch (e) {
      // Corrupt blob: keep it for forensics instead of silently wiping all
      // times on the next save. Back up each distinct blob only once —
      // load() runs every frame from HUD draws, don't spam keys.
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && raw !== _lastCorruptBackup) {
          localStorage.setItem(STORAGE_KEY + "-corrupt-" + Date.now(), raw);
          _lastCorruptBackup = raw;
        }
        console.warn("leaderboard JSON corrupt — backed up and starting fresh", e);
      } catch (_) {}
      return {};
    }
  }

  // One-time migration: rename old name-based keys to URL-based keys
  function migrateIfNeeded(data) {
    if (_migrated) return data;
    const map = EM.Main && EM.Main._levelNamesMap;
    if (!map) return data; // don't mark as migrated if JSON not loaded yet
    _migrated = true;
    // build reverse map: name -> url
    const nameToUrl = {};
    for (const [url, name] of Object.entries(map)) {
      nameToUrl[name] = url;
    }
    let changed = false;
    for (const key of Object.keys(data)) {
      if (key.indexOf('/') === -1 && nameToUrl[key]) {
        // old name-based key found -> migrate to URL key
        const newKey = nameToUrl[key];
        if (!data[newKey]) {
          data[newKey] = data[key];
        }
        delete data[key];
        changed = true;
      }
    }
    if (changed) save(data);
    return data;
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, entries: data }));
    } catch (e) {
      // QuotaExceeded or private-mode failure must never break the finish flow.
      console.warn("leaderboard save failed:", e);
    }
  }

  // Get the player name (cached in localStorage).
  function getPlayerName() {
    let name = localStorage.getItem("elma-player-name");
    if (!name) {
      name = prompt("Enter your name:", "");
      if (name && name.trim()) {
        name = name.trim();
        localStorage.setItem("elma-player-name", name);
      } else {
        name = "Anonymous";
        localStorage.setItem("elma-player-name", name);
      }
    }
    return name;
  }

  const MAX_TIMES = 5; // top N times per level

  // Record a finish time. fileKey = unique key (file URL), displayName = shown name.
  // Backward compat: if displayName is omitted, fileKey is used as both key and name.
  function recordTime(fileKey, displayName, time) {
    if (typeof displayName === 'number') { time = displayName; displayName = fileKey; }
    if (!fileKey) return null;
    const key = fileKey;
    let data = load();
    data = migrateIfNeeded(data);
    let entry = data[key];
    const name = getPlayerName();
    let improved = false, diff = 0, rank = -1;

    if (!entry) {
      entry = { best: time, name, times: [{ time, name }] };
      data[key] = entry;
      improved = true;
      diff = 0;
      rank = 1;
    } else {
      // ensure times array exists (migrate old format)
      if (!entry.times) entry.times = [{ time: entry.best, name: entry.name }];
      // insert time into sorted list
      entry.times.push({ time, name });
      entry.times.sort((a, b) => a.time - b.time);
      // keep top N
      if (entry.times.length > MAX_TIMES) entry.times.length = MAX_TIMES;
      // check if this time is the new best
      if (time < entry.best) {
        diff = entry.best - time;
        entry.best = time;
        entry.name = name;
        improved = true;
      }
      rank = entry.times.findIndex((t) => t.time === time && t.name === name);
      if (rank < 0) rank = entry.times.length; // didn't make top N
      rank++; // 1-based
    }
    save(data);
    return { improved, diff, best: entry.best, rank };
  }

  // Get the best time for a level by fileKey.
  function getBest(fileKey) {
    if (!fileKey) return null;
    let data = load();
    data = migrateIfNeeded(data);
    return data[fileKey] || null;
  }

  // Get all entries sorted by best time.
  function getLeaderboard() {
    const data = load();
    return Object.entries(data)
      .map(([level, e]) => ({ level, best: e.best, name: e.name }))
      .sort((a, b) => a.best - b.best);
  }

  function fmtTime(sec) {
    return `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(2)}s`;
  }

  // Draw the finish overlay (called from render2 / render when status=finished).
  // game.finish_time is the real-time seconds.
  function drawFinishScreen(ctx, game) {
    const w = game.view.w, h = game.view.h;
    const uis = game.uiScale || 1; // UI font compensation
    const levelName = game.level.name || "";
    const levelFile = game._levelFile || levelName;
    const time = game.finish_time;

    // overlay
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const PAD = Math.round(50 * uis);

    // measure content height
    const entry = getBest(levelFile);
    const times = entry && entry.times ? entry.times : [];
    const lbRows = times.length > 0 ? Math.round(22 * uis) + times.length * Math.round(18 * uis) + Math.round(10 * uis) : 0;
    const contentH = Math.round(38 * uis) + Math.round(40 * uis) + Math.round(22 * uis) + Math.round(36 * uis) + Math.round(24 * uis) + Math.round(24 * uis) + Math.round(16 * uis) + lbRows + Math.round(10 * uis) + Math.round(14 * uis);
    const blockW = Math.max(420, w * 0.45);

    // single background block behind everything
    ctx.fillStyle = "rgba(10,14,26,0.88)";
    ctx.fillRect(cx - blockW / 2, h / 2 - contentH / 2 - PAD, blockW, contentH + PAD * 2);

    let y = h / 2 - contentH / 2;

    // title
    ctx.textAlign = "center";
    ctx.font = "bold " + Math.round(38 * uis) + "px ui-monospace, Menlo, monospace"
    ctx.fillStyle = "#7ee081";
    ctx.fillText("FINISH!", cx, y);
    y += Math.round(40 * uis);

    // time
    ctx.font = Math.round(22 * uis) + "px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#cfe3ff";
    ctx.fillText(`Time: ${fmtTime(time)}`, cx, y);
    y += Math.round(36 * uis);

    // best time info
    const info = game._winResult;
    if (info && info.improved) {
      ctx.font = "bold " + Math.round(18 * uis) + "px ui-monospace, Menlo, monospace"
      ctx.fillStyle = "#ffd54f";
      if (info.best === time) {
        ctx.fillText("★ NEW BEST TIME! ★", cx, y);
      }
      y += Math.round(24 * uis);
      if (info.diff > 0) {
        ctx.fillStyle = "#a5d6a7";
        ctx.fillText(`Improved by ${info.diff.toFixed(2)}s`, cx, y);
        y += Math.round(24 * uis);
      }
    } else {
      // show current best
      const best = getBest(levelFile);
      if (best) {
        ctx.fillStyle = "#8fa3c4";
        ctx.fillText(`Best: ${fmtTime(best.best)}  (${best.name})`, cx, y);
        y += Math.round(24 * uis);
        if (time > best.best) {
          ctx.fillStyle = "#e57373";
          ctx.fillText(`+${(time - best.best).toFixed(2)}s slower`, cx, y);
          y += Math.round(24 * uis);
        }
      }
    }
    y += Math.round(16 * uis);

    // top times — current level
    if (times.length > 0) {
      ctx.font = "bold " + Math.round(16 * uis) + "px ui-monospace, Menlo, monospace"
      ctx.fillStyle = "#90caf9";
      ctx.fillText(`— Your Times (${entry.name}) —`, cx, y);
      y += Math.round(22 * uis);

      ctx.font = Math.round(13 * uis) + "px ui-monospace, Menlo, monospace";
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
        const isCurrentRun = Math.abs(t.time - time) < 0.001;
        ctx.fillStyle = isCurrentRun ? "#ffd54f" : (i === 0 ? "#cfd8ea" : "#8a9ab0");
        ctx.fillText(`${medal.padEnd(4)} ${fmtTime(t.time)}`, cx, y);
        y += Math.round(18 * uis);
      }
    }

    y += Math.round(10 * uis);
    ctx.font = Math.round(14 * uis) + "px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#7d8db0";
    const hasReplay = EM.Recorder && EM.Recorder.hasReplay && EM.Recorder.hasReplay(game._levelFile);
    const controls = hasReplay
      ? "R restart  ·  W watch replay  ·  N next  ·  P prev"
      : "R restart  ·  N next level  ·  P prev level";
    ctx.fillText(controls, cx, y);

    // world record time from elmaonline.net API
    const packNameMap = { internal: "Internal", olp: "OLP", li: "LI", alp: "ALP", eol: "EOL", abula: "Abula" };
    const apiPack = packNameMap[game.activePack] || null;
    const levelOrder = (game.levelIndex != null) ? game.levelIndex + 1 : 0;
    if (apiPack && levelOrder > 0 && EM.Main.getWrTime) {
      const wrCs = EM.Main.getWrTime(apiPack, levelOrder);
      if (wrCs) {
        y += Math.round(22 * uis);
        ctx.font = Math.round(13 * uis) + "px ui-monospace, Menlo, monospace";
        ctx.fillStyle = "#5a6a7a";
        ctx.fillText(`World Record: ${fmtTime(wrCs / 100)}`, cx, y);
      }
    }
  }

  function drawPauseScreen(ctx, game) {
    const w = game.view.w, h = game.view.h;
    const uis = game.uiScale || 1; // UI font compensation
    const levelName = game.level.name || "";
    const levelFile = game._levelFile || levelName;
    const time = game.realTime;

    // dark overlay
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const PAD = Math.round(40 * uis);

    // measure content height
    const entry = getBest(levelFile);
    const times = entry && entry.times ? entry.times : [];
    const cleanName = levelName.replace(/^OLP#\d+\s*/i, '').replace(/^\d+[\s:._-]+\s*/, '');
    const lbRows = times.length > 0 ? 22 + Math.min(times.length, 5) * 18 + 10 : 0;
    const contentH = Math.round(36 * uis) + Math.round(22 * uis) + Math.round(28 * uis) + Math.round(24 * uis) + Math.round(24 * uis) + Math.round(16 * uis) + lbRows + Math.round(10 * uis) + Math.round(14 * uis);
    const blockW = Math.max(380, w * 0.4);

    ctx.fillStyle = "rgba(10,14,26,0.88)";
    ctx.fillRect(cx - blockW / 2, h / 2 - contentH / 2 - PAD, blockW, contentH + PAD * 2);

    let y = h / 2 - contentH / 2;

    // title
    ctx.textAlign = "center";
    ctx.font = "bold " + Math.round(36 * uis) + "px ui-monospace, Menlo, monospace"
    ctx.fillStyle = "#cfd8ea";
    ctx.fillText("PAUSED", cx, y);
    y += Math.round(36 * uis);

    // level name
    ctx.font = Math.round(18 * uis) + "px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#ffd54f";
    ctx.fillText(cleanName || "Level", cx, y);
    y += Math.round(22 * uis);

    // current time
    ctx.font = Math.round(20 * uis) + "px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#cfe3ff";
    ctx.fillText(`Time: ${fmtTime(time)}`, cx, y);
    y += Math.round(28 * uis);

    // best time
    const best = getBest(levelFile);
    if (best) {
      ctx.font = Math.round(16 * uis) + "px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "#8fa3c4";
      ctx.fillText(`Best: ${fmtTime(best.best)}  (${best.name})`, cx, y);
      y += Math.round(24 * uis);
    }

    // world record time from elmaonline.net API
    const packNameMap = { internal: "Internal", olp: "OLP", li: "LI", alp: "ALP", eol: "EOL", abula: "Abula" };
    const apiPack = packNameMap[game.activePack] || null;
    const levelOrder = (game.levelIndex != null) ? game.levelIndex + 1 : 0;
    if (apiPack && levelOrder > 0 && EM.Main.getWrTime) {
      const wrCs = EM.Main.getWrTime(apiPack, levelOrder);
      if (wrCs) {
        ctx.fillStyle = "#5a6a7a";
        ctx.fillText(`World Record: ${fmtTime(wrCs / 100)}`, cx, y);
        y += Math.round(24 * uis);
      }
    }
    y += Math.round(8 * uis);

    // top times
    if (times.length > 0) {
      ctx.font = "bold " + Math.round(14 * uis) + "px ui-monospace, Menlo, monospace"
      ctx.fillStyle = "#90caf9";
      ctx.fillText("— Your Times —", cx, y);
      y += Math.round(20 * uis);

      ctx.font = Math.round(12 * uis) + "px ui-monospace, Menlo, monospace";
      const show = Math.min(times.length, 5);
      for (let i = 0; i < show; i++) {
        const t = times[i];
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
        ctx.fillStyle = "#8a9ab0";
        ctx.fillText(`${medal.padEnd(4)} ${fmtTime(t.time)}`, cx, y);
        y += Math.round(16 * uis);
      }
    } else {
      ctx.font = Math.round(13 * uis) + "px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "#5a6a7a";
      ctx.fillText("No times yet — finish the level to see your best", cx, y);
      y += Math.round(18 * uis);
    }

    y += Math.round(8 * uis);
    ctx.font = Math.round(13 * uis) + "px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#7d8db0";
    ctx.fillText("Esc — continue  ·  M menu  ·  R restart", cx, y);
  }

  return { recordTime, getBest, getLeaderboard, drawFinishScreen, drawPauseScreen, getPlayerName, invalidateCompletedCache: () => EM.Menu && EM.Menu.invalidateCompletedCache && EM.Menu.invalidateCompletedCache() };
})();
