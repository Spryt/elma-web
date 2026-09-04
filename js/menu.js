// Main menu: Level packs, Replays, Settings
window.EM = window.EM || {};

EM.Menu = (function () {
  const SETTINGS_KEY = "elma-settings";

  // Menu items — indices must match case handlers below
  // index 0 = Internal, 1 = OLP, 2 = LI, 3 = ALP, 4 = EOL, 5 = Elmapack, 6 = Abula, 7 = Replays, 8 = Settings
  const PACK_ITEMS = [
    { id: "internal", label: "Internal Levels", count: 54, getLevels: () => EM.Main && EM.Main.LEVELS },
    { id: "olp",      label: "Official Level Pack", count: 36, getLevels: () => EM.Main && EM.Main.OLP_LEVELS },
    { id: "li",       label: "Lost Internals", count: 54, getLevels: () => EM.Main && EM.Main.LI_LEVELS },
    { id: "alp",      label: "Alternative Level Pack", count: 36, getLevels: () => EM.Main && EM.Main.ALP_LEVELS },
    { id: "eol",      label: "Elma Online", count: 54, getLevels: () => EM.Main && EM.Main.EOL_LEVELS },
    { id: "elmapack", label: "Elmapack", count: 419, getLevels: () => { if (!EM.Elmapack) return null; return EM.Elmapack.ELMAPACK_GENS.flatMap(g => g.levels); } },
    { id: "abula",    label: "Abula", count: 92, getLevels: () => EM.Main && EM.Main.ABULA_LEVELS },
  ];
  const MENU_REPLAYS = PACK_ITEMS.length;     // index for Replays
  const MENU_SETTINGS = PACK_ITEMS.length + 1; // index for Settings

  // ---- Settings ----
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || defaultSettings(); }
    catch { return defaultSettings(); }
  }
  function defaultSettings() {
    return { ghostWorldRecord: true, ghostPersonal: true, sound: true };
  }
  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn("settings save failed:", e);
    }
  }
  function getSetting(key) { return loadSettings()[key]; }
  function toggleSetting(key) {
    const s = loadSettings();
    s[key] = !s[key];
    saveSettings(s);
    return s[key];
  }

  // Compute completed count for a pack's levels.
  // Cached: drawMenu runs every frame and getBest hits localStorage per
  // level (hundreds of sync reads per frame without the cache). The cache
  // is invalidated whenever a new time is recorded.
  const _completedCache = new Map(); // levelsRef -> count
  function invalidateCompletedCache() {
    _completedCache.clear();
  }
  function countCompleted(levels) {
    if (!levels) return 0;
    if (_completedCache.has(levels)) return _completedCache.get(levels);
    let c = 0;
    for (const url of levels) {
      if (EM.Win.getBest(url)) c++;
    }
    _completedCache.set(levels, c);
    return c;
  }

  // ---- Menu drawing ----
  function drawMenu(ctx, game) {
    const w = game.view.w, h = game.view.h;
    const cx = w / 2;

    // dark background
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, w, h);

    // title
    ctx.textAlign = "center";
    ctx.font = "bold 48px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#7ee081";
    ctx.fillText("ELASTO MANIA", cx, h * 0.25);

    ctx.font = "16px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#5a6a7a";
    ctx.fillText("browser port", cx, h * 0.25 + 30);

    if (game.showSettings) {
      drawSettings(ctx, game);
    } else {
      // menu items
      const startY = h * 0.38;
      const gap = 44;
      const totalItems = PACK_ITEMS.length + 2; // packs + Replays + Settings

      for (let i = 0; i < totalItems; i++) {
        const y = startY + i * gap;
        const selected = game.menuCursor === i;
        const prefix = selected ? "▸ " : "  ";

        ctx.font = "20px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";

        if (i < PACK_ITEMS.length) {
          const pack = PACK_ITEMS[i];
          const levels = pack.getLevels ? pack.getLevels() : null;
          const done = levels ? countCompleted(levels) : 0;
          const pad = (pack.label + "                          ").slice(0, 22);
          const countStr = done + "/" + pack.count;
          const countColor = done === pack.count ? "#7ee081" : (done > 0 ? "#7ddf7d" : "#6a7a94");
          const line = prefix + pad + "  " + countStr;
          ctx.fillStyle = selected ? "#ffd54f" : "#8fa3c4";
          ctx.fillText(line, cx, y);
        } else if (i === MENU_REPLAYS) {
          const prefix = selected ? "▸ " : "  ";
          ctx.font = "20px ui-monospace, Menlo, monospace";
          ctx.fillStyle = selected ? "#ffd54f" : "#8fa3c4";
          ctx.fillText(prefix + "Replays WR internals", cx, y);
        } else if (i === MENU_SETTINGS) {
          const prefix = selected ? "▸ " : "  ";
          ctx.font = "20px ui-monospace, Menlo, monospace";
          ctx.fillStyle = selected ? "#ffd54f" : "#8fa3c4";
          ctx.fillText(prefix + "Settings", cx, y);
        }
      }

      // controls hint
      ctx.font = "13px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "#5a6a7a";
      ctx.fillText("↑↓ select  ·  Enter/Space confirm", cx, h - 30);
    }
  }

  // ---- Settings drawing ----
  function drawSettings(ctx, game) {
    const w = game.view.w, h = game.view.h;
    const cx = w / 2;
    const s = loadSettings();

    ctx.font = "bold 28px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#ffd54f";
    ctx.fillText("— Settings —", cx, h * 0.32);

    const items = [
      { label: "World Record Ghost", key: "ghostWorldRecord" },
      { label: "Personal Ghost", key: "ghostPersonal" },
      { label: "Sound", key: "sound" },
    ];

    const startY = h * 0.44;
    const gap = 50;
    ctx.font = "18px ui-monospace, Menlo, monospace";
    for (let i = 0; i < items.length; i++) {
      const y = startY + i * gap;
      const selected = game.menuCursor === i;
      ctx.fillStyle = selected ? "#ffd54f" : "#8fa3c4";
      const prefix = selected ? "▸ " : "  ";
      const val = s[items[i].key];
      const dot = val ? "ON " : "OFF";
      const dotColor = val ? "#7ee081" : "#e57373";
      ctx.fillText(prefix + items[i].label, cx - 120, y);
      ctx.fillStyle = dotColor;
      ctx.fillText(`[${dot}]`, cx + 120, y);
    }

    ctx.font = "13px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#5a6a7a";
    ctx.fillText("↑↓ select  ·  Enter/Space toggle  ·  Esc back", cx, h - 30);
  }

  // ---- Menu input ----
  function handleMenuInput(game, e) {
    if (game.showSettings) {
      return handleSettingsInput(game, e);
    }

    const total = PACK_ITEMS.length + 2; // packs + Replays + Settings
    if (e.code === "ArrowUp" || e.code === "KeyW") {
      game.menuCursor = (game.menuCursor - 1 + total) % total;
      return true;
    }
    if (e.code === "ArrowDown" || e.code === "KeyS") {
      game.menuCursor = (game.menuCursor + 1) % total;
      return true;
    }
    if (e.code === "Enter" || e.code === "Space") {
      if (game.menuCursor < PACK_ITEMS.length) {
        // pack selection
        const pack = PACK_ITEMS[game.menuCursor];
        game.activePack = pack.id;
        game.showMenu = false;
        game.showLevelSelect = true;
        game.paused = true;
        EM.Main.loadLevelNamesJson();
        if (pack.id === "elmapack") {
          game.showLevelSelect = false;
          game.showElmapackGroups = true;
          game.elmapackGroupCursor = 0;
        } else {
          if (game.levelSelectCursor == null) game.levelSelectCursor = game.levelIndex;
        }
        return true;
      }
      if (game.menuCursor === MENU_REPLAYS) {
        game.showMenu = false;
        game.showWrReplays = true;
        game.paused = true;
        EM.Main.loadLevelNamesJson();
        if (game.wrCursor == null) game.wrCursor = game.levelIndex || 0;
        return true;
      }
      if (game.menuCursor === MENU_SETTINGS) {
        game.showSettings = true;
        game.menuCursor = 0;
        return true;
      }
    }
    return false;
  }

  function handleSettingsInput(game, e) {
    const items = ["ghostWorldRecord", "ghostPersonal", "sound"];
    const total = items.length;
    if (e.code === "ArrowUp" || e.code === "KeyW") {
      game.menuCursor = (game.menuCursor - 1 + total) % total;
      return true;
    }
    if (e.code === "ArrowDown" || e.code === "KeyS") {
      game.menuCursor = (game.menuCursor + 1) % total;
      return true;
    }
    if (e.code === "Enter" || e.code === "Space") {
      const key = items[game.menuCursor];
      const val = toggleSetting(key);
      if (key === "sound" && EM.Sound && EM.Sound.setMuted) {
        EM.Sound.setMuted(!val);
      }
      return true;
    }
    if (e.code === "Escape") {
      game.showSettings = false;
      game.menuCursor = MENU_SETTINGS; // cursor on Settings
      return true;
    }
    return false;
  }

  return {
    MENU_ITEMS: PACK_ITEMS.map(p => p.label),
    PACK_ITEMS,
    MENU_REPLAYS,
    MENU_SETTINGS,
    TUTORIAL_LEVELS: [],
    drawMenu,
    handleMenuInput,
    loadSettings,
    saveSettings,
    toggleSetting,
    getSetting,
    countCompleted,
    invalidateCompletedCache,
  };
})();
