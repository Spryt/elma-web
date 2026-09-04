// Game state, fixed-timestep loop, input, Elma-style camera, and the
// scripted autotest harness (deterministic physics verification).
window.EM = window.EM || {};

EM.Main = (function () {
  const V = EM.V;
  const Phys = EM.Physics;
  const PHYS_DT = 0.0055; // s, exactly as in the original (LEJATSZO.CPP:477)

  const CAM_FLIP_TIME = 0.35 + 0.15; // turn_time + 0.15 (EolSettings)
  const CAM_BAL = 0.15; // bike at 15% of screen width from the back edge

  // Smoothed camera: the raw follow position is low-pass filtered so fast
  // camera moves (falls, hard acceleration) don't make the snapped terrain
  // jump in large uneven steps. Smoothing is applied in SCREEN pixels so it
  // behaves the same at any zoom.
  const CAM_SMOOTH_K = 0.45;
  function smoothCam(game, targetX, targetY) {
    const s = game.scale;
    const st = game._camSmooth || (game._camSmooth = { x: targetX, y: targetY, init: false });
    if (!st.init) { st.init = true; st.x = targetX; st.y = targetY; return st; }
    // filter in pixel space (target - current in screen px)
    const k = CAM_SMOOTH_K;
    const curX = st.x, curY = st.y;
    st.x = curX + (targetX - curX) * k;
    st.y = curY + (targetY - curY) * k;
    return st;
  }

  // Built-in level files you can switch between (N/P or 1..6).
  // QWQUU001.LEV = the original classic level; eol1..100 = downloaded internal levels.
  // Original Elma levels from elma-exe/converted_levels/
  const LEVELS = [
    "lev/QWQUU001.LEV",
    "lev/QWQUU002.LEV",
    "lev/QWQUU003.LEV",
    "lev/QWQUU004.LEV",
    "lev/QWQUU005.LEV",
    "lev/QWQUU006.LEV",
    "lev/QWQUU007.LEV",
    "lev/QWQUU008.LEV",
    "lev/QWQUU009.LEV",
    "lev/QWQUU010.LEV",
    "lev/QWQUU011.LEV",
    "lev/QWQUU012.LEV",
    "lev/QWQUU013.LEV",
    "lev/QWQUU014.LEV",
    "lev/QWQUU015.LEV",
    "lev/QWQUU016.LEV",
    "lev/QWQUU017.LEV",
    "lev/QWQUU018.LEV",
    "lev/QWQUU019.LEV",
    "lev/QWQUU020.LEV",
    "lev/QWQUU021.LEV",
    "lev/QWQUU022.LEV",
    "lev/QWQUU023.LEV",
    "lev/QWQUU024.LEV",
    "lev/QWQUU025.LEV",
    "lev/QWQUU026.LEV",
    "lev/QWQUU027.LEV",
    "lev/QWQUU028.LEV",
    "lev/QWQUU029.LEV",
    "lev/QWQUU030.LEV",
    "lev/QWQUU031.LEV",
    "lev/QWQUU032.LEV",
    "lev/QWQUU033.LEV",
    "lev/QWQUU034.LEV",
    "lev/QWQUU035.LEV",
    "lev/QWQUU036.LEV",
    "lev/QWQUU037.LEV",
    "lev/QWQUU038.LEV",
    "lev/QWQUU039.LEV",
    "lev/QWQUU040.LEV",
    "lev/QWQUU041.LEV",
    "lev/QWQUU042.LEV",
    "lev/QWQUU043.LEV",
    "lev/QWQUU044.LEV",
    "lev/QWQUU045.LEV",
    "lev/QWQUU046.LEV",
    "lev/QWQUU047.LEV",
    "lev/QWQUU048.LEV",
    "lev/QWQUU049.LEV",
    "lev/QWQUU050.LEV",
    "lev/QWQUU051.LEV",
    "lev/QWQUU052.LEV",
    "lev/QWQUU053.LEV",
    "lev/QWQUU054.LEV",
  ];

  // Official Level Pack (OLP) — 36 community-made levels
  const OLP_LEVELS = [
    "lev/olp/0lp01.lev",
    "lev/olp/0lp02.lev",
    "lev/olp/0lp03.lev",
    "lev/olp/0lp04.lev",
    "lev/olp/0lp05.lev",
    "lev/olp/0lp06.lev",
    "lev/olp/0lp07.lev",
    "lev/olp/0lp08.lev",
    "lev/olp/0lp09.lev",
    "lev/olp/0lp10.lev",
    "lev/olp/0lp11.lev",
    "lev/olp/0lp12.lev",
    "lev/olp/0lp13.lev",
    "lev/olp/0lp14.lev",
    "lev/olp/0lp15.lev",
    "lev/olp/0lp16.lev",
    "lev/olp/0lp17.lev",
    "lev/olp/0lp18.lev",
    "lev/olp/0lp19.lev",
    "lev/olp/0lp20.lev",
    "lev/olp/0lp21.lev",
    "lev/olp/0lp22.lev",
    "lev/olp/0lp23.lev",
    "lev/olp/0lp24.lev",
    "lev/olp/0lp25.lev",
    "lev/olp/0lp26.lev",
    "lev/olp/0lp27.lev",
    "lev/olp/0lp28.lev",
    "lev/olp/0lp29.lev",
    "lev/olp/0lp30.lev",
    "lev/olp/0lp31.lev",
    "lev/olp/0lp32.lev",
    "lev/olp/0lp33.lev",
    "lev/olp/0lp34.lev",
    "lev/olp/0lp35.lev",
    "lev/olp/0lp36.lev",
  ];

  // Lost Internals (LI) — 54 levels
  const LI_LEVELS = [
    "lev/li/Lost01.lev","lev/li/Lost02.lev","lev/li/Lost03.lev","lev/li/Lost04.lev","lev/li/Lost05.lev",
    "lev/li/Lost06.lev","lev/li/Lost07.lev","lev/li/Lost08.lev","lev/li/Lost09.lev","lev/li/Lost10.lev",
    "lev/li/Lost11.lev","lev/li/Lost12.lev","lev/li/Lost13.lev","lev/li/Lost14.lev","lev/li/Lost15.lev",
    "lev/li/Lost16.lev","lev/li/Lost17.lev","lev/li/Lost18.lev","lev/li/Lost19.lev","lev/li/Lost20.lev",
    "lev/li/Lost21.lev","lev/li/Lost22.lev","lev/li/Lost23.lev","lev/li/Lost24.lev","lev/li/Lost25.lev",
    "lev/li/Lost26.lev","lev/li/Lost27.lev","lev/li/Lost28.lev","lev/li/Lost29.lev","lev/li/Lost30.lev",
    "lev/li/Lost31.lev","lev/li/Lost32.lev","lev/li/Lost33.lev","lev/li/Lost34.lev","lev/li/Lost35.lev",
    "lev/li/Lost36.lev","lev/li/Lost37.lev","lev/li/Lost38.lev","lev/li/Lost39.lev","lev/li/Lost40.lev",
    "lev/li/Lost41.lev","lev/li/Lost42.lev","lev/li/Lost43.lev","lev/li/Lost44.lev","lev/li/Lost45.lev",
    "lev/li/Lost46.lev","lev/li/Lost47.lev","lev/li/Lost48.lev","lev/li/Lost49.lev","lev/li/Lost50.lev",
    "lev/li/Lost51.lev","lev/li/Lost52.lev","lev/li/Lost53.lev","lev/li/Lost54.lev",
  ];

  // Alternative Level Pack (ALP) — 36 levels
  const ALP_LEVELS = [
    "lev/alp/ALP01_SS.lev","lev/alp/ALP02_BD.lev","lev/alp/ALP03_FH.lev","lev/alp/ALP04_Ea.lev","lev/alp/ALP05_PT.lev",
    "lev/alp/ALP06_TV.lev","lev/alp/ALP07_GP.lev","lev/alp/ALP08_RA.lev","lev/alp/ALP09_Ca.lev","lev/alp/ALP10_HO.lev",
    "lev/alp/ALP11_Ap.lev","lev/alp/ALP12_BR.lev","lev/alp/ALP13_NZ.lev","lev/alp/ALP14_Mi.lev","lev/alp/ALP15_LD.lev",
    "lev/alp/ALP16_FO.lev","lev/alp/ALP17_RR.lev","lev/alp/ALP18_RB.lev","lev/alp/ALP19_Gy.lev","lev/alp/ALP20_CP.lev",
    "lev/alp/ALP21_RS.lev","lev/alp/ALP22_SA.lev","lev/alp/ALP23_TS.lev","lev/alp/ALP24_Ka.lev","lev/alp/ALP25_MR.lev",
    "lev/alp/ALP26_Da.lev","lev/alp/ALP27_NC.lev","lev/alp/ALP28_AP.lev","lev/alp/ALP29_Cr.lev","lev/alp/ALP30_OP.lev",
    "lev/alp/ALP31_IS.lev","lev/alp/ALP32_HF.lev","lev/alp/ALP33_LL.lev","lev/alp/ALP34_XS.lev","lev/alp/ALP35_M.lev",
    "lev/alp/ALP36_PR.lev",
  ];

  // Elma Online Levelpack (EOL) — 54 levels
  const EOL_LEVELS = [
    "lev/eol/EOL01.lev","lev/eol/EOL02.lev","lev/eol/EOL03.lev","lev/eol/EOL04.lev","lev/eol/EOL05.lev",
    "lev/eol/EOL06.lev","lev/eol/EOL07.lev","lev/eol/EOL08.lev","lev/eol/EOL09.lev","lev/eol/EOL10.lev",
    "lev/eol/EOL11.lev","lev/eol/EOL12.lev","lev/eol/EOL13.lev","lev/eol/EOL14.lev","lev/eol/EOL15.lev",
    "lev/eol/EOL16.lev","lev/eol/EOL17.lev","lev/eol/EOL18.lev","lev/eol/EOL19.lev","lev/eol/EOL20.lev",
    "lev/eol/EOL21.lev","lev/eol/EOL22.lev","lev/eol/EOL23.lev","lev/eol/EOL24.lev","lev/eol/EOL25.lev",
    "lev/eol/EOL26.lev","lev/eol/EOL27.lev","lev/eol/EOL28.lev","lev/eol/EOL29.lev","lev/eol/EOL30.lev",
    "lev/eol/EOL31.lev","lev/eol/EOL32.lev","lev/eol/EOL33.lev","lev/eol/EOL34.lev","lev/eol/EOL35.lev",
    "lev/eol/EOL36.lev","lev/eol/EOL37.lev","lev/eol/EOL38.lev","lev/eol/EOL39.lev","lev/eol/EOL40.lev",
    "lev/eol/EOL41.lev","lev/eol/EOL42.lev","lev/eol/EOL43.lev","lev/eol/EOL44.lev","lev/eol/EOL45.lev",
    "lev/eol/EOL46.lev","lev/eol/EOL47.lev","lev/eol/EOL48.lev","lev/eol/EOL49.lev","lev/eol/EOL50.lev",
    "lev/eol/EOL51.lev","lev/eol/EOL52.lev","lev/eol/EOL53.lev","lev/eol/EOL54.lev",
  ];

  // Abula — 92 levels
  const ABULA_LEVELS = [
    "lev/abula/Abula001.lev","lev/abula/Abula002.lev","lev/abula/Abula003.lev","lev/abula/Abula004.lev","lev/abula/Abula005.lev",
    "lev/abula/Abula006.lev","lev/abula/Abula007.lev","lev/abula/Abula008.lev","lev/abula/Abula009.lev","lev/abula/Abula010.lev",
    "lev/abula/Abula011.lev","lev/abula/Abula012.lev","lev/abula/Abula013.lev","lev/abula/Abula014.lev","lev/abula/Abula015.lev",
    "lev/abula/Abula016.lev","lev/abula/Abula017.lev","lev/abula/Abula018.lev","lev/abula/Abula019.lev","lev/abula/Abula020.lev",
    "lev/abula/Abula021.lev","lev/abula/Abula022.lev","lev/abula/Abula023.lev","lev/abula/Abula024.lev","lev/abula/Abula025.lev",
    "lev/abula/Abula026.lev","lev/abula/Abula027.lev","lev/abula/Abula028.lev","lev/abula/Abula029.lev","lev/abula/Abula030.lev",
    "lev/abula/Abula031.lev","lev/abula/Abula032.lev","lev/abula/Abula033.lev","lev/abula/Abula034.lev","lev/abula/Abula035.lev",
    "lev/abula/Abula036.lev","lev/abula/Abula037.lev","lev/abula/Abula038.lev","lev/abula/Abula039.lev","lev/abula/Abula040.lev",
    "lev/abula/Abula041.lev","lev/abula/Abula042.lev","lev/abula/Abula043.lev","lev/abula/Abula044.lev","lev/abula/Abula045.lev",
    "lev/abula/Abula046.lev","lev/abula/Abula047.lev","lev/abula/Abula048.lev","lev/abula/Abula049.lev","lev/abula/Abula050.lev",
    "lev/abula/Abula051.lev","lev/abula/Abula052.lev","lev/abula/Abula053.lev","lev/abula/Abula054.lev","lev/abula/Abula055.lev",
    "lev/abula/Abula056.lev","lev/abula/Abula057.lev","lev/abula/Abula058.lev","lev/abula/Abula058b.lev","lev/abula/Abula059.lev",
    "lev/abula/Abula060.lev","lev/abula/Abula061.lev","lev/abula/Abula062.lev","lev/abula/Abula063.lev","lev/abula/Abula064.lev",
    "lev/abula/Abula065.lev","lev/abula/Abula066.lev","lev/abula/Abula067.lev","lev/abula/Abula068.lev","lev/abula/Abula069.lev",
    "lev/abula/Abula070.lev","lev/abula/Abula071.lev","lev/abula/Abula072.lev","lev/abula/Abula073.lev","lev/abula/Abula074.lev",
    "lev/abula/Abula075.lev","lev/abula/Abula076.lev","lev/abula/Abula077.lev","lev/abula/Abula078.lev","lev/abula/Abula079.lev",
    "lev/abula/Abula080.lev","lev/abula/Abula081.lev","lev/abula/Abula082.lev","lev/abula/Abula083.lev","lev/abula/Abula084.lev",
    "lev/abula/Abula085.lev","lev/abula/Abula086.lev","lev/abula/Abula087.lev","lev/abula/Abula088.lev","lev/abula/Abula089.lev",
    "lev/abula/Abula090.lev","lev/abula/Abula091.lev",
  ];

  // Get active level list for the current pack
  function getActiveLevels(game) {
    if (game && game.activePack === "olp") return OLP_LEVELS;
    if (game && game.activePack === "li") return LI_LEVELS;
    if (game && game.activePack === "alp") return ALP_LEVELS;
    if (game && game.activePack === "abula") return ABULA_LEVELS;
    if (game && game.activePack === "eol") return EOL_LEVELS;
    if (game && game.activePack === "elmapack") return game.elmapackLevels || [];
    return LEVELS;
  }

  // Build physics segments from a .lev file's polygons.
  // The real game inverts the level y for collision (segments.cpp: "Invert y
  // coordinates", elma-classic SZAKASZ.CPP: "fejjel lefele"), so physics y =
  // -file y. Our physics space is y-up.
  function buildSegmentsFromFile(polygons) {
    const segs = [];
    for (const poly of polygons) {
      if (poly.grass) continue;
      const n = poly.pts.length;
      for (let i = 0; i < n; i++) {
        const a = { x: poly.pts[i][0], y: -poly.pts[i][1] };
        const b = { x: poly.pts[(i + 1) % n][0], y: -poly.pts[(i + 1) % n][1] };
        const v = V.sub(b, a);
        const length = V.len(v);
        segs.push({
          r: a,
          v: v,
          unit: length > 0 ? V.mul(v, 1 / length) : { x: 0, y: 0 },
          length: length,
        });
      }
    }
    return segs;
  }

  // --- play statistics (localStorage) ---
  const STAT_KEY = "elma-stats";
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STAT_KEY)) || { gamesPlayed: 0, totalPlayTime: 0 }; }
    catch { return { gamesPlayed: 0, totalPlayTime: 0 }; }
  }
  function saveStats(s) { localStorage.setItem(STAT_KEY, JSON.stringify(s)); }
  function trackLevelStart() {
    const s = loadStats(); s.gamesPlayed++; saveStats(s);
  }
  function trackPlayTime(dt) {
    if (dt <= 0) return;
    const s = loadStats(); s.totalPlayTime += dt; saveStats(s);
  }
  function getStats() { return loadStats(); }

  // Preload all level names — now just loads the JSON once
  async function preloadLevelNames() {
    await loadLevelNamesJson();
    return getPackNames(LEVELS, 'Level');
  }

  // Static level names loaded from JSON (single fetch at startup)
  let _levelNamesMap = null;
  let _levelNamesPromise = null;

  async function loadLevelNamesJson() {
    if (_levelNamesMap) return _levelNamesMap;
    if (_levelNamesPromise) return _levelNamesPromise;
    _levelNamesPromise = (async () => {
      try {
        const resp = await fetch('lev/names.json');
        _levelNamesMap = await resp.json();
      } catch (_) {
        _levelNamesMap = {};
      }
      return _levelNamesMap;
    })();
    return _levelNamesPromise;
  }

  // WR times from elmaonline.net — pack name → { order: timeInCentiseconds }
  let _wrTimesMap = null;
  let _wrTimesPromise = null;

  async function loadWrTimesJson() {
    if (_wrTimesMap) return _wrTimesMap;
    if (_wrTimesPromise) return _wrTimesPromise;
    _wrTimesPromise = (async () => {
      try {
        const resp = await fetch('lev/wr-times.json');
        _wrTimesMap = await resp.json();
      } catch (_) {
        _wrTimesMap = {};
      }
      return _wrTimesMap;
    })();
    return _wrTimesPromise;
  }

  // Get WR time for a level: pack="Internal", order=1-based index
  function getWrTime(pack, order) {
    const map = _wrTimesMap || {};
    const packWrs = map[pack];
    if (!packWrs) return 0;
    return packWrs[String(order)] || 0;
  }

  // Get names for a pack's levels array — instant if JSON loaded, falls back to generic
  function getPackNames(levels, prefix) {
    const map = _levelNamesMap || {};
    return levels.map((url, i) => {
      let name = map[url] || (prefix + ' ' + (i + 1));
      // strip leading "01: ", "01  ", "OLP#01 " etc. — number + separator
      name = name.replace(/^\d+[\s:._-]+\s*/, '');
      return name || (prefix + ' ' + (i + 1));
    });
  }

  async function preloadOlpLevelNames() { await loadLevelNamesJson(); }
  async function preloadLiLevelNames() { await loadLevelNamesJson(); }
  async function preloadAlpLevelNames() { await loadLevelNamesJson(); }
  async function preloadAbulaLevelNames() { await loadLevelNamesJson(); }
  async function preloadEolLevelNames() { await loadLevelNamesJson(); }

  // Elmapack: preload display names for a group (per-gen, no prefix)
  async function preloadElmapackGroupNames(groupIdx) {
    const genInfo = EM.Elmapack.getGroupGenInfo(groupIdx);
    const genNames = {};
    for (const { gen, startIdx, count } of genInfo) {
      const g = EM.Elmapack.getGen(gen);
      if (!g) continue;
      const names = await Promise.all(g.levels.map(async (url, i) => {
        try {
          const resp = await fetch(url);
          const buf = await resp.arrayBuffer();
          const dv = new DataView(buf);
          let o = 5 + 2 + 4 + 32;
          let name = '';
          for (let j = 0; j < 51; j++) {
            const c = dv.getUint8(o + j);
            if (c === 0) break;
            name += String.fromCharCode(c);
          }
          return name.trim() || ('Level ' + (i + 1));
        } catch (_) {
          return 'Level ' + (i + 1);
        }
      }));
      genNames[gen] = names;
    }
    return { genNames, genInfo };
  }

  // Enter an Elmapack group: set up levels + names for level select
  function enterElmapackGroup(game, groupIdx) {
    game.elmapackGroupIdx = groupIdx;
    game.elmapackLevels = EM.Elmapack.getGroupLevels(groupIdx);
    game.activePack = "elmapack";
    game.showElmapackGroups = false;
    game.showLevelSelect = true;
    game.paused = true;
    game.levelSelectCursor = 0;
    game.elmapackCursorGen = 0; // which gen column (0,1,2)
    game.elmapackCursorInGen = 0; // row within the gen
    // preload names async
    preloadElmapackGroupNames(groupIdx).then(result => {
      game.elmapackGenNames = result.genNames;
      game.elmapackGenInfo = result.genInfo;
      // flat names for getBest lookups
      const flat = [];
      for (const gi of result.genInfo) {
        const nm = result.genNames[gi.gen] || [];
        for (let i = 0; i < gi.count; i++) flat.push(nm[i] || 'Level ' + (i + 1));
      }
      game.elmapackNames = flat;
    });
  }

  // Switch to another built-in level (by index into LEVELS, wrapped).
  // Load a level by URL directly (used for tutorials, not in LEVELS array).
  async function loadLevelByUrl(game, url) {
    if (!game._art) { console.warn("loadLevelByUrl: art not loaded yet"); return null; }
    try {
      const lev = await loadRealLevel(url);
      game.level = lev;
      game.levelIndex = -1;
      game._levelFile = url;
      game._recorder = EM.Recorder.createRecorder();
      // ghosts for tutorial levels: none
      game._worldRecordGhost = null;
      game._ghostData = null;
      reset(game);
      game.imgs = game._art.imgs;
      game.levelRenderer = new EM.Render2.LevelRenderer(lev, game._art.imgs, game._art.picts, game._art.grassUps, game._art.grassDowns);
      game.cam = { x: game.motor.bike.r.x, y: game.motor.bike.r.y };
      return lev.name;
    } catch (e) { console.warn("loadLevelByUrl failed:", url, e); return null; }
  }

  // Returns a Promise resolving to the loaded level name, or null on error.
  // A generation token guards against concurrent loads (spamming Enter/N/P):
  // only the most recently requested load may commit game state.
  let _levelLoadGen = 0;
  async function switchLevel(game, idx) {
    if (!game._art) {
      console.warn("switchLevel: art not loaded yet");
      return null;
    }
    const gen = ++_levelLoadGen;
    game.loading = true;
    game.loadProgress = 0;
    const levels = getActiveLevels(game);
    const n = levels.length;
    const index = ((idx % n) + n) % n;
    const url = levels[index];
    try {
      const lev = await loadRealLevel(url);
      if (gen !== _levelLoadGen) {
        console.warn("switchLevel: stale load discarded for", url);
        return null; // a newer switchLevel call superseded this one
      }
      game.level = lev;
      game.levelIndex = index;
      game._levelFile = url;
      // load ghosts based on settings (WR ghosts only exist for internal levels)
      const settings = EM.Menu.loadSettings();
      if (settings.ghostWorldRecord && game.activePack === "internal") {
        const recNum = String(index + 1).padStart(2, "0");
        try { game._worldRecordGhost = await EM.Recorder.loadRec(`rec/${recNum}mopo.rec`); } catch (e) { game._worldRecordGhost = null; }
      } else {
        game._worldRecordGhost = null;
      }
      if (settings.ghostPersonal) {
        game._ghostData = await EM.Recorder.loadAsync(game._levelFile, false);
        if (!game._ghostData) game._ghostData = await EM.Recorder.loadLastAsync(game._levelFile);
      } else {
        game._ghostData = null;
      }
      if (gen !== _levelLoadGen) return null; // superseded while ghosts loaded
      reset(game); // recreates motor, places at start, clears input/status
      trackLevelStart();
      game.imgs = game._art.imgs;
      game.levelRenderer = new EM.Render2.LevelRenderer(
        lev,
        game._art.imgs,
        game._art.picts,
        game._art.grassUps,
        game._art.grassDowns,
        undefined,
        (p) => { if (gen === _levelLoadGen) game.loadProgress = p; }
      );
      await game.levelRenderer.ready;
      if (gen !== _levelLoadGen) return null; // superseded while rendering
      game.cam = { x: game.motor.bike.r.x, y: game.motor.bike.r.y };
      console.log("switched level ->", url, ":", lev.name);
      game.loading = false;
      return lev.name;
    } catch (e) {
      console.warn("switchLevel failed for", url, e);
      game.loading = false;
      return null;
    }
  }

  async function loadRealLevel(url) {
    const resp = await fetch(url);
    const buffer = await resp.arrayBuffer();
    const parsed = EM.LevFile.parse(buffer);
    const objects = EM.LevFile.makeObjects(parsed);
    // add index for apple tracking during replay
    objects.forEach((o, i) => { o.__idx = i; });
    // objects keep file coords (the real game uses them as-is: UTKOZES2.CPP)
    const level = {
      name: parsed.name,
      polygons: parsed.polygons,
      objects: objects,
      pics: parsed.pics.map((p, i) => Object.assign(p, { num: i })),
      ground: parsed.ground || "ground",
      sky: parsed.sky || "sky",
      levelId: parsed.levelId,
      segments: buildSegmentsFromFile(parsed.polygons),
    };
    return level;
  }

  function createGame() {
    const level = EM.Level.makeLevel();
    const segments = EM.Level.buildSegments(level);
    level.segments = segments; // vizsgalat reads level.segments (like the global in C)
    const motor = Phys.newMotor();
    Phys.place_at_start(motor, level);

    return {
      level,
      motor,
      input: { gas: false, brake: false, leftVolt: false, rightVolt: false, turn: false },
      prevTurn: false,
      eddig: 0,
      realTime: 0,
      cam: { x: motor.bike.r.x, y: motor.bike.r.y },
      lastFlip: -100.0,
      scale: 96, // px per meter (2x of the original 48 px/m at 640x480)
      view: { w: 1280, h: 960 },
      paused: false,
      showMenu: true,
      menuCursor: 0,
      showSettings: false,
      showLevelSelect: false,
      showWrReplays: false,
      wrCursor: 0,
      _wrTimes: {},
      levelSelectCursor: 0,
      activePack: "internal",    // "internal" or "olp"
      internalLevelNames: null,  // lazily loaded array of internal level names
      olpLevelNames: null,       // lazily loaded array of OLP level names
      liLevelNames: null,        // lazily loaded array of LI level names
      alpLevelNames: null,       // lazily loaded array of ALP level names
      abulaLevelNames: null,     // lazily loaded array of Abula level names
      loading: false,            // true while switching levels (shows loading screen)
      loadProgress: 0,           // 0..1 while loading (percentage for the loading screen)
      showElmapackGroups: false, // true when showing Elmapack group selection screen
      elmapackGroupCursor: 0,    // cursor in group selection
      elmapackGroupIdx: -1,      // selected group index (for level select / gameplay)
      elmapackLevels: [],        // flat level URLs for the selected group
      elmapackNames: [],         // display names for the selected group
      elmapackGenNames: {},      // per-gen display names: { gen: string[] }
      elmapackGenInfo: [],       // per-gen info: [{ gen, startIdx, count }]
      elmapackCursorGen: 0,      // which gen column the cursor is in (0,1,2)
      elmapackCursorInGen: 0,    // row within that gen column
      totalLevels: 0,
      status: "menu", // menu | riding | dead | finished | replaying
      finish_time: 0,
      death_time: 0,
      steps: 0,
      fps: 0,
      last_volt: -100.0,
      trace: [],
      traceEnabled: false,
      script: null, // [{t, input:{...}}] for autotest
      scriptIdx: 0,
      events: Phys.events,
      levelRenderer: null,
      imgs: null,
      _art: null,
      levelIndex: 0,
      _recorder: null,          // EM.Recorder instance (active during gameplay)
      _ghostData: null,          // personal best ghost from localStorage
      _worldRecordGhost: null,   // world record ghost from .rec files
      _hasRecGhost: false,       // true if ghost loaded from .rec file (don't overwrite)
      _levelFile: null,          // current level file URL for replay storage
      _rewindPenalty: 0,         // accumulated time penalty from rewinds (seconds)
      _rewindCount: 0,           // number of rewinds used this level
      _rewindCountdown: 0,       // countdown timer after rewind (seconds)
      _rewindCountdownStart: 0,  // performance.now() when countdown started
      _tutorialMode: false,      // tutorial mode: auto-advance levels
      _tutorialIdx: 0,           // current tutorial index
      replaySpeed: 1.0,          // replay playback speed
      _replayLevelIdx: 0,        // current level index for replay switching
      replayFrameMode: false,    // frame-by-frame mode (space toggled)
      replayArrowLeft: false,
      replayArrowRight: false,
      replayArrowUp: false,
      replayArrowDown: false,
    };
  }

  // hold-until-changed scripted input
  function applyScript(game) {
    if (!game.script) return;
    while (
      game.scriptIdx < game.script.length &&
      game.script[game.scriptIdx].t <= game.eddig
    ) {
      const entry = game.script[game.scriptIdx];
      Object.assign(game.input, entry.input || {});
      game.scriptIdx++;
    }
  }

  // One physics step.
  function step(game, dt) {
    const m = game.motor;

    // ---- replay playback mode ----
    if (game.status === "replaying") {
      const rd = game._replayData;
      if (!rd) { game.status = "finished"; game.finish_time = game.realTime; return; }

      // compute effective speed from held arrows
      let speed = 0;
      if (game.replayFrameMode) {
        // frame-by-frame: only move when arrows are held
        if (game.replayArrowLeft) speed = -2;
        else if (game.replayArrowRight) speed = 2;
        else if (game.replayArrowUp) speed = 5;
        else if (game.replayArrowDown) speed = -0.5;
      } else {
        // continuous: arrows set speed, no arrows = 1x forward
        if (game.replayArrowLeft) speed = -2;
        else if (game.replayArrowRight) speed = 2;
        else if (game.replayArrowUp) speed = 3;
        else if (game.replayArrowDown) speed = 0.5;
        else speed = 1;
      }
      game.replaySpeed = speed;

      if (speed !== 0) {
        game.eddig = Math.max(0, game.eddig + dt * speed);
        game.steps++;
      }
      game.steps++;

      const pose = EM.Recorder.interpolate(rd, game.eddig);
      if (!pose) {
        // End of replay: clamp to the final recorded frame instead of
        // fabricating a finish (the last frame IS the run's outcome).
        const fr = rd.frames;
        if (fr && fr.length) {
          const f = fr[fr.length - 1];
          game.eddig = f.t;
        }
        game.status = "finished";
        game.finish_time = game.realTime;
        return;
      }
      // set ALL motor positions from interpolated pose
      m.bike.r.x = pose.bx;
      m.bike.r.y = pose.by;
      m.bike.rotation = pose.rot;
      m.left_wheel.r.x = pose.bx + pose.lx;
      m.left_wheel.r.y = pose.by + pose.ly;
      m.left_wheel.rotation = pose.wL;
      m.right_wheel.r.x = pose.bx + pose.rx;
      m.right_wheel.r.y = pose.by + pose.ry;
      m.right_wheel.rotation = pose.wR;
      m.head_r.x = pose.bx + pose.hx;
      m.head_r.y = pose.by + pose.hy;
      m.body_r.x = pose.bx + pose.bodyX;
      m.body_r.y = pose.by + pose.bodyY;
      m.flipped_bike = (pose.flags & 2) ? 1 : 0;
      // In native .rec files bits 2-3 are frame-count/FlagTag data, not
      // gravity — only trust gravity bits for replays recorded by this port.
      m.gravity_direction = rd.fromNativeRec ? 1 : (pose.flags >> 2) & 3;
      // apple collision detection during replay
      if (game.level) {
        if (!game._replayAppleEatTimes) game._replayAppleEatTimes = {};
        // forward: check if bike touches any active apple
        const contactPts = [
          { x: m.left_wheel.r.x, y: m.left_wheel.r.y, r: m.left_wheel.radius },
          { x: m.right_wheel.r.x, y: m.right_wheel.r.y, r: m.right_wheel.radius },
          { x: m.head_r.x, y: m.head_r.y, r: Phys.C.HeadRadius },
        ];
        for (const obj of game.level.objects) {
          if (obj.type !== "apple") continue;
          const ox = obj.px !== undefined ? obj.px : obj.x;
          const oy = obj.py !== undefined ? obj.py : obj.y;
          const appleR = Phys.C.ObjectRadius;
          if (obj.active) {
            // check collision
            for (const pt of contactPts) {
              const dx = pt.x - ox, dy = pt.y - oy;
              if (dx * dx + dy * dy < (pt.r + appleR) * (pt.r + appleR)) {
                obj.active = false;
                m.apple_count++;
                game._replayAppleEatTimes[obj.__idx] = game.eddig;
                break;
              }
            }
          } else {
            // rewind: reactivate if eat time is after current position
            const eatTime = game._replayAppleEatTimes[obj.__idx];
            if (eatTime !== undefined && game.eddig < eatTime) {
              obj.active = true;
              m.apple_count--;
            }
          }
        }
      }
      // camera (smoothed so the snapped terrain doesn't jump in big steps)
      const offM = (CAM_BAL + 0.5 * (1 - 2 * CAM_BAL)) * game.view.w / game.scale;
      const sm = smoothCam(game,
        m.bike.r.x + game.view.w / (2 * game.scale) - offM,
        m.bike.r.y);
      game.cam.x = sm.x;
      game.cam.y = sm.y;
      return;
    }

    // flip (turn) is edge-triggered
    if (game.input.turn && !game.prevTurn) {
      m.flipped_bike = m.flipped_bike ? 0 : 1;
      game.lastFlip = game.eddig;
      m.last_turn_time = game.eddig;
      Phys.szamitfejr(m);
      game.events.push({ type: "turn" });
      if (game._recorder) EM.Recorder.event(game._recorder, "turn", game.eddig, { volume: 0.99 });
    }
    game.prevTurn = game.input.turn;

    // volt gating: VoltDelay between presses (belsoresz in LEJATSZO.CPP)
    let ugrik1 = 0;
    let ugrik2 = 0;
    if (game.eddig > game.last_volt + Phys.C.VoltDelay) {
      if (game.input.rightVolt) {
        ugrik1 = 1;
        game.last_volt = game.eddig;
        m.last_volt_time = game.eddig;
        m.last_volt_side = 1;
        game.events.push({ type: "volt" });
        if (game._recorder) EM.Recorder.event(game._recorder, "volt_right", game.eddig, { volume: 0.99 });
      }
      if (game.input.leftVolt) {
        ugrik2 = 1;
        game.last_volt = game.eddig;
        m.last_volt_time = game.eddig;
        m.last_volt_side = -1;
        game.events.push({ type: "volt" });
        if (game._recorder) EM.Recorder.event(game._recorder, "volt_left", game.eddig, { volume: 0.99 });
      }
    }

    // Save head position before physics step for swept collision
    m.prev_head_r.x = m.head_r.x;
    m.prev_head_r.y = m.head_r.y;

    Phys.leptet(
      m,
      game.eddig,
      dt,
      game.input.gas ? 1 : 0,
      game.input.brake ? 1 : 0,
      ugrik1,
      ugrik2,
      game.level.segments
    );
    game.eddig += dt;
    game.steps++;

    // record frame for replay/ghost (skip during replay playback)
    if (game._recorder && game.status !== "replaying") {
      EM.Recorder.tick(game._recorder, m, game.eddig, dt, game.input.gas);
    }

    const result = Phys.vizsgalat(m, game.level);
    // Track when each apple was eaten (object index -> game time). Used by
    // death-rewind to restore apples to the state at the rewind point.
    if (!game._appleEatTimes) game._appleEatTimes = {};
    // Apple events must be captured before Sound.update drains game.events.
    if (game._recorder && game.status !== "replaying") {
      for (const ev of game.events) {
        if (ev.type === "apple") {
          EM.Recorder.event(game._recorder, "apple", game.eddig, { volume: 0.99 });
          if (typeof ev.idx === "number") game._appleEatTimes[ev.idx] = game.eddig;
        }
        else if (ev.type === "bump" && typeof ev.vol === "number") {
          EM.Recorder.event(game._recorder, "bump", game.eddig, { volume: Math.max(0.01, Math.min(0.99, ev.vol)) });
        }
      }
    } else if (game.status !== "replaying") {
      // no recorder (e.g. tutorial) — still track eat times
      for (const ev of game.events) {
        if (ev.type === "apple" && typeof ev.idx === "number") game._appleEatTimes[ev.idx] = game.eddig;
      }
    }
    if (result === 0 && game.status === "riding") {
      game.status = "dead";
      game.death_time = game.eddig;
      game.events.push({ type: "death" });
      // death crash sound in replays is WAV_TORES (LEJATSZO.CPP:481)
      if (game._recorder) EM.Recorder.event(game._recorder, "death", game.eddig, { volume: 0.99 });
    } else if (result === 1 && game.status === "riding") {
      game.status = "finished";
      game.finish_time = game.realTime + game._rewindPenalty;
      game.events.push({ type: "finish" });
      if (game._recorder) EM.Recorder.event(game._recorder, "finish", game.eddig, { volume: 0.99 });
      game._winResult = EM.Win.recordTime(game._levelFile, game.level.name, game.finish_time);
      // Keep the replay of the PERSONAL BEST only: a slower run must not
      // overwrite the ghost (it did before — "personal best" was really
      // "last run").
      const isBest = game._winResult && game._winResult.improved;
      if (game._recorder) {
        if (isBest || !EM.Recorder.hasReplay(game._levelFile)) {
          EM.Recorder.save(game._recorder, game.level.name, game._levelFile);
        }
        if (isBest) game._ghostData = EM.Recorder.load(game._levelFile);
        // "last run" — save every finished run separately, so a ghost exists
        // even when the run was slower than the personal best (or there is
        // no best/WR replay yet, e.g. OLP).
        EM.Recorder.saveLast(game._recorder, game.level.name, game._levelFile);
        if (!game._ghostData) game._ghostData = EM.Recorder.loadLast(game._levelFile);
      }
      // tutorial mode: auto-advance to next tutorial
      if (game._tutorialMode && game._tutorialIdx < 1) {
        game._tutorialIdx++;
        const tut = game._tutorialIdx === 0 ? EM.Level.makeTutorial1() : EM.Level.makeTutorial2();
        game.level = tut;
        game._levelFile = null;
        game._recorder = EM.Recorder.createRecorder();
        game._worldRecordGhost = null;
        game._ghostData = null;
        reset(game);
        game.imgs = game._art ? game._art.imgs : null;
        if (game.imgs) {
          game.levelRenderer = new EM.Render2.LevelRenderer(tut, game.imgs, game._art.picts, game._art.grassUps, game._art.grassDowns);
        }
        game.cam = { x: game.motor.bike.r.x, y: game.motor.bike.r.y };
      }
    }

    // Elma camera: hard follow; the bike sits at 15%/85% of the screen width,
    // flipping sides over CAM_FLIP_TIME after a turn (baljobbszamol).
    const eltelt = game.eddig - game.lastFlip;
    let baljobb;
    if (m.flipped_bike) baljobb = eltelt > CAM_FLIP_TIME ? 0 : 1 - eltelt / CAM_FLIP_TIME;
    else baljobb = eltelt > CAM_FLIP_TIME ? 1 : eltelt / CAM_FLIP_TIME;
    const offM = (CAM_BAL + baljobb * (1 - 2 * CAM_BAL)) * game.view.w / game.scale;
    const sm = smoothCam(game,
      m.bike.r.x + game.view.w / (2 * game.scale) - offM,
      m.bike.r.y);
    game.cam.x = sm.x;
    game.cam.y = sm.y;

    if (game.traceEnabled) {
      if (game.trace.length < 200000) {
        game.trace.push({
          t: game.eddig,
          x: m.bike.r.x,
          y: m.bike.r.y,
          rot: m.bike.rotation,
          vx: m.bike.v.x,
          vy: m.bike.v.y,
          wL: m.left_wheel.angular_velocity,
          wR: m.right_wheel.angular_velocity,
          cL: m.left_wheel.contact,
          cR: m.right_wheel.contact,
          apples: m.apple_count,
          status: game.status,
        });
      }
    }
  }

  // Run physics synchronously until game time reaches `time`.
  // If a script is set, its inputs are applied each step (deterministic).
  function advance(game, time) {
    let guard = 0;
    while (game.eddig < time && game.status === "riding" && guard < 2000000) {
      applyScript(game);
      step(game, PHYS_DT);
      guard++;
    }
    return game.eddig;
  }

  function reset(game) {
    if (game.level) {
      for (const o of game.level.objects) o.active = true;
      // re-apply start placement
      game.motor = Phys.newMotor();
      Phys.place_at_start(game.motor, game.level);
      // start new recording for this run
      game._recorder = EM.Recorder.createRecorder();
      // load ghost from previous best (fall back to last run when no best yet)
      if (game._levelFile) {
        game._ghostData = EM.Recorder.load(game._levelFile);
        if (!game._ghostData) game._ghostData = EM.Recorder.loadLast(game._levelFile);
      }
    }
    game.eddig = 0;
    game.realTime = 0;
    game.steps = 0;
    game.status = "riding";
    game.paused = false;
    game.showLevelSelect = false;
    game.levelSelectCursor = game.levelIndex || 0;
    game.finish_time = 0;
    game.death_time = 0;
    game.last_volt = -100.0;
    game.lastFlip = -100.0;
    game.prevTurn = false;
    game.input = { gas: false, brake: false, leftVolt: false, rightVolt: false, turn: false };
    game.trace = [];
    game.script = null;
    game.scriptIdx = 0;
    game.events.length = 0;
    game._appleEatTimes = {}; // fresh run: forget when apples were eaten
    game._rewindPenalty = 0;
    game._rewindCount = 0;
    game._rewindCountdown = 0;
    // Respect ghost settings on every restart (they were only applied on
    // level switch before, so toggling a ghost off didn't survive a reset).
    if (game.level && game._levelFile) {
      const settings = EM.Menu.loadSettings();
      game._ghostData = settings.ghostPersonal ? EM.Recorder.load(game._levelFile) : null;
      // fall back to the last finished run when there is no personal best yet
      if (settings.ghostPersonal && !game._ghostData) {
        game._ghostData = EM.Recorder.loadLast(game._levelFile);
      }
    }
    if (game.motor) {
      game.cam = { x: game.motor.bike.r.x, y: game.motor.bike.r.y };
    }
  }

  function serialize(game) {
    const m = game.motor;
    return JSON.stringify({
      t: +game.eddig.toFixed(6),
      status: game.status,
      bike: {
        r: [m.bike.r.x, m.bike.r.y].map((v) => +v.toFixed(6)),
        v: [m.bike.v.x, m.bike.v.y].map((v) => +v.toFixed(6)),
        rot: +m.bike.rotation.toFixed(6),
        w: +m.bike.angular_velocity.toFixed(6),
      },
      lw: { r: [m.left_wheel.r.x, m.left_wheel.r.y].map((v) => +v.toFixed(6)), w: +m.left_wheel.angular_velocity.toFixed(6) },
      rw: { r: [m.right_wheel.r.x, m.right_wheel.r.y].map((v) => +v.toFixed(6)), w: +m.right_wheel.angular_velocity.toFixed(6) },
      body: [m.body_r.x, m.body_r.y].map((v) => +v.toFixed(6)),
      head: [m.head_r.x, m.head_r.y].map((v) => +v.toFixed(6)),
      flipped: m.flipped_bike,
      apples: m.apple_count,
      objects: game.level.objects.map((o) => (o.active ? 1 : 0)).join(""),
    });
  }

  // ------------------------------------------------------------------
  // input
  // ------------------------------------------------------------------
  const KEYMAP = {
    ArrowUp: "gas",
    ArrowDown: "brake",
    ArrowLeft: "leftVolt",
    ArrowRight: "rightVolt",
    KeyW: "gas",
    KeyS: "brake",
  };

  const PREVENT_DEFAULT_CODES = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Alt",
    "Tab",
  ]);

  function bindInput(game, canvas) {
    // track currently held keys so we can restore input after rewind
    const heldKeys = new Set();

    // Lost focus (Alt+Tab etc.) means keyup events are missed: clear every
    // latched input so the bike doesn't keep driving by itself. Physical
    // state is rebuilt on the next real keydown.
    function releaseAll() {
      heldKeys.clear();
      game.input.gas = false;
      game.input.brake = false;
      game.input.leftVolt = false;
      game.input.rightVolt = false;
      game.input.turn = false;
      game.replayArrowLeft = false;
      game.replayArrowRight = false;
      game.replayArrowUp = false;
      game.replayArrowDown = false;
    }
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) releaseAll();
    });

    window.addEventListener("keydown", (e) => {
      if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
      EM.Sound && EM.Sound.resume();

      heldKeys.add(e.code);

      // menu input takes priority
      if (game.showMenu) {
        EM.Menu.handleMenuInput(game, e);
        return;
      }

      if (e.altKey) {
        game.input.turn = true;
        e.preventDefault();
        return;
      }
      // replay controls (skip if WR replays table is open)
      if (game.status === "replaying" && !game.showWrReplays) {
        if (e.code === "Space") {
          e.preventDefault();
          game.replayFrameMode = !game.replayFrameMode;
          return;
        }
        if (e.code === "ArrowLeft")  { e.preventDefault(); game.replayArrowLeft = true; return; }
        if (e.code === "ArrowRight") { e.preventDefault(); game.replayArrowRight = true; return; }
        if (e.code === "ArrowUp")    { e.preventDefault(); game.replayArrowUp = true; return; }
        if (e.code === "ArrowDown")  { e.preventDefault(); game.replayArrowDown = true; return; }
      }
      if (KEYMAP[e.code]) game.input[KEYMAP[e.code]] = true;
      if (e.code === "KeyT") game.input.turn = true;
      if (e.code === "Escape") {
        if (e.repeat) return; // don't strobe pause while held
        if (game.showElmapackGroups) { game.showElmapackGroups = false; game.showMenu = true; game.menuCursor = EM.Menu.PACK_ITEMS.findIndex(p => p.id === "elmapack"); game.status = "menu"; return; }
        if (game.showLevelSelect) {
          game.showLevelSelect = false;
          game.showMenu = true;
          const packIdx = EM.Menu.PACK_ITEMS.findIndex(p => p.id === game.activePack);
          game.menuCursor = packIdx >= 0 ? packIdx : 0;
          game.status = "menu";
          return;
        }
        if (game.showWrReplays) {
          game.showWrReplays = false;
          if (game._replayData && game.status === "finished") {
            // stay on finish screen — keep paused so the overlay renders
          } else if (game.status === "replaying") {
            // resume replay — keep paused off so playback continues
            game.paused = false;
          } else {
            game.paused = false;
            game.showMenu = true;
            game.menuCursor = 0;
            game.status = "menu";
          }
          return;
        }
        if (game.showMenu) return;
        game.paused = !game.paused;
        return;
      }
      if (e.code === "Tab") {
        e.preventDefault();
        // during replay: Tab toggles WR replays table
        if (game.status === "replaying") {
          if (game.showWrReplays) {
            game.showWrReplays = false;
            game.paused = false;
          } else {
            game.showWrReplays = true;
            game.paused = true;
            loadLevelNamesJson();
            if (game.wrCursor == null) game.wrCursor = game.levelIndex || 0;
          }
          return;
        }
        // Elmapack: Tab toggles between group select and level select
        if (game.activePack === "elmapack") {
          if (game.showLevelSelect) {
            game.showLevelSelect = false;
            game.showElmapackGroups = true;
            game.paused = true;
          } else if (game.showElmapackGroups) {
            game.showElmapackGroups = false;
            game.paused = false;
          } else {
            game.showElmapackGroups = true;
            game.paused = true;
          }
          return;
        }
        // load names from JSON if not yet loaded
        loadLevelNamesJson();
        game.showLevelSelect = !game.showLevelSelect;
        if (game.showLevelSelect) {
          game.paused = true;
          if (game.levelSelectCursor == null) game.levelSelectCursor = game.levelIndex;
        }
        return;
      }
      // --- arrow keys + Enter for elmapack group select ---
      if (game.showElmapackGroups) {
        const total = EM.Elmapack.ELMAPACK_GROUPS.length;
        const cols = 3;
        const rowsPerCol = Math.ceil(total / cols);
        let cur = game.elmapackGroupCursor || 0;
        const curCol = Math.floor(cur / rowsPerCol);
        const curRow = cur % rowsPerCol;

        if (e.code === "ArrowDown")  { e.preventDefault(); cur = Math.min(total - 1, cur + 1); game.elmapackGroupCursor = cur; return; }
        if (e.code === "ArrowUp")    { e.preventDefault(); cur = Math.max(0, cur - 1); game.elmapackGroupCursor = cur; return; }
        if (e.code === "ArrowRight") { e.preventDefault(); const next = (curCol + 1) * rowsPerCol + curRow; cur = next < total ? next : cur; game.elmapackGroupCursor = cur; return; }
        if (e.code === "ArrowLeft")  { e.preventDefault(); if (curCol > 0) { cur = (curCol - 1) * rowsPerCol + curRow; if (cur >= total) cur = total - 1; game.elmapackGroupCursor = cur; } return; }
        if (e.code === "Enter")      { e.preventDefault(); enterElmapackGroup(game, cur); return; }
        return;
      }
      // --- arrow keys + Enter for level select ---
      if (game.showLevelSelect) {
        // Elmapack per-gen column navigation
        if (game.activePack === "elmapack" && game.elmapackGenInfo && game.elmapackGenInfo.length > 0) {
          const genInfo = game.elmapackGenInfo;
          const numGens = genInfo.length;
          let genCol = game.elmapackCursorGen || 0;
          let genRow = game.elmapackCursorInGen || 0;

          if (e.code === "ArrowDown") {
            e.preventDefault();
            genRow = Math.min(genInfo[genCol].count - 1, genRow + 1);
            game.elmapackCursorInGen = genRow;
            return;
          }
          if (e.code === "ArrowUp") {
            e.preventDefault();
            genRow = Math.max(0, genRow - 1);
            game.elmapackCursorInGen = genRow;
            return;
          }
          if (e.code === "ArrowRight") {
            e.preventDefault();
            if (genCol < numGens - 1) {
              genCol++;
              game.elmapackCursorGen = genCol;
              game.elmapackCursorInGen = Math.min(genRow, genInfo[genCol].count - 1);
            }
            return;
          }
          if (e.code === "ArrowLeft") {
            e.preventDefault();
            if (genCol > 0) {
              genCol--;
              game.elmapackCursorGen = genCol;
              game.elmapackCursorInGen = Math.min(genRow, genInfo[genCol].count - 1);
            }
            return;
          }
          if (e.code === "Enter") {
            e.preventDefault();
            const flatIdx = genInfo[genCol].startIdx + genRow;
            game.showLevelSelect = false;
            game.paused = false;
            EM.Main.switchLevel(game, flatIdx);
            return;
          }
          return;
        }
        // Standard flat navigation (internal / OLP)
        const levels = getActiveLevels(game);
        const total = levels.length;
        const cols = 3;
        const rowsPerCol = Math.ceil(total / cols);
        let cur = game.levelSelectCursor || 0;
        const curCol = Math.floor(cur / rowsPerCol);
        const curRow = cur % rowsPerCol;

        if (e.code === "ArrowDown")  { e.preventDefault(); cur = Math.min(total - 1, cur + 1); game.levelSelectCursor = cur; return; }
        if (e.code === "ArrowUp")    { e.preventDefault(); cur = Math.max(0, cur - 1); game.levelSelectCursor = cur; return; }
        if (e.code === "ArrowRight") { e.preventDefault(); const next = (curCol + 1) * rowsPerCol + curRow; cur = next < total ? next : cur; game.levelSelectCursor = cur; return; }
        if (e.code === "ArrowLeft")  { e.preventDefault(); if (curCol > 0) { cur = (curCol - 1) * rowsPerCol + curRow; if (cur >= total) cur = total - 1; game.levelSelectCursor = cur; } return; }
        if (e.code === "Enter")      { e.preventDefault(); game.showLevelSelect = false; game.paused = false; EM.Main.switchLevel(game, cur); return; }
        return; // eat all other keys while level select is open
      }
      // --- WR replays table navigation ---
      if (game.showWrReplays) {
        const total = game.totalLevels || 54;
        const cols = 3;
        const rowsPerCol = Math.ceil(total / cols);
        let cur = game.wrCursor || 0;
        const curCol = Math.floor(cur / rowsPerCol);
        const curRow = cur % rowsPerCol;

        if (e.code === "ArrowDown")  { e.preventDefault(); cur = Math.min(total - 1, cur + 1); game.wrCursor = cur; return; }
        if (e.code === "ArrowUp")    { e.preventDefault(); cur = Math.max(0, cur - 1); game.wrCursor = cur; return; }
        if (e.code === "ArrowRight") { e.preventDefault(); const next = (curCol + 1) * rowsPerCol + curRow; cur = next < total ? next : cur; game.wrCursor = cur; return; }
        if (e.code === "ArrowLeft")  { e.preventDefault(); if (curCol > 0) { cur = (curCol - 1) * rowsPerCol + curRow; if (cur >= total) cur = total - 1; game.wrCursor = cur; } return; }
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          // load level and start WR replay
          const url = LEVELS[cur];
          (async () => {
            game.showWrReplays = false;
            game.paused = false;
            await EM.Main.switchLevel(game, cur);
            // load and start WR replay
            const recNum = String(cur + 1).padStart(2, "0");
            try {
              const rd = await EM.Recorder.loadRec(`rec/${recNum}mopo.rec`);
              game._replayData = rd;
              game.status = "replaying";
              game.eddig = 0;
              game.realTime = 0;
              game._rewindPenalty = 0;
              game._rewindCount = 0;
              game._replayLevelIdx = cur;
              game.replaySpeed = 1.0;
              game.replayFrameMode = false;
              game.replayArrowLeft = false;
              game.replayArrowRight = false;
              game.replayArrowUp = false;
              game.replayArrowDown = false;
              game._replayAppleEatTimes = {};
            } catch (e) {
              console.warn("No WR replay for level", recNum);
              game.status = "riding";
            }
          })();
          return;
        }
        if (e.code === "Escape") {
          // handled by generic ESC handler above
          return;
        }
        if (e.code === "KeyM") {
          game.showWrReplays = false;
          game.paused = false;
          game.showMenu = true;
          game.menuCursor = 0;
          game.status = "menu";
          return;
        }
        return; // eat all other keys while WR replays table is open
      }
      if (e.code === "KeyR") {
        if (e.repeat) return; // don't machine-gun resets while held
        if (game.status === "replaying" || (game.status === "finished" && game._replayData)) {
          // restart replay
          game.status = "replaying";
          game.eddig = 0;
          game.realTime = 0;
          game.replaySpeed = 1.0;
          game.replayFrameMode = false;
          game.replayArrowLeft = false;
          game.replayArrowRight = false;
          game.replayArrowUp = false;
          game.replayArrowDown = false;
          game._replayAppleEatTimes = {};
          // reset apple state
          if (game.level) {
            for (const obj of game.level.objects) {
              if (obj.type === "apple") obj.active = true;
            }
          }
          game.motor.apple_count = 0;
        } else {
          reset(game);
        }
      }
      if (e.code === "KeyM" && game.paused) {
        game.paused = false;
        game.showMenu = true;
        game.menuCursor = 0;
        game.status = "menu";
        return;
      }
      if (e.code === "KeyW" && game.status === "finished") {
        (async () => { await EM.Main.startReplay(game); })();
      }
      if (false) { // KeyS (save .rec) disabled: unreliable, hidden from UI
        // if (e.code === "KeyS" && (game.status === "finished" || game.status === "dead") && game._recorder && game._recorder.frames.length > 0) {
        // keep the .lev extension: the original game resolves replays by the
        // exact palyanev stored in the header
        const fname = (game._levelFile || "replay.lev").replace(/^.*\//, "");
        EM.Recorder.downloadRec(
          { frames: game._recorder.frames, events: game._recorder.events || [] },
          fname,
          (game.level && game.level.levelId) >>> 0
        );
        return;
      }
      if (e.code === "Space" && game.status === "dead") {
        if (!e.repeat) EM.Main.rewind(game);
        return; // don't let Space also trigger turn
      }
      if (e.code === "KeyN" || e.code === "KeyP") {
        e.preventDefault();
        if (game.status === "replaying") {
          // switch to next/prev WR replay
          const dir = e.code === "KeyN" ? 1 : -1;
          const total = LEVELS.length;
          const newIdx = ((game._replayLevelIdx || 0) + dir + total) % total;
          (async () => {
            await EM.Main.switchLevel(game, newIdx);
            const recNum = String(newIdx + 1).padStart(2, "0");
            try {
              const rd = await EM.Recorder.loadRec(`rec/${recNum}mopo.rec`);
              game._replayData = rd;
              game.status = "replaying";
              game.eddig = 0;
              game.realTime = 0;
              game._replayLevelIdx = newIdx;
              game.replaySpeed = 1.0;
              game.replayFrameMode = false;
              game.replayArrowLeft = false;
              game.replayArrowRight = false;
              game.replayArrowUp = false;
              game.replayArrowDown = false;
              game._replayAppleEatTimes = {};
            } catch (e) {
              game.status = "riding";
            }
          })();
        } else {
          const nextIdx = game.levelIndex + (e.code === "KeyN" ? 1 : -1);
          if (nextIdx >= 0 && nextIdx < LEVELS.length) {
            EM.Main.switchLevel(game, nextIdx);
          }
        }
      }
      const d = parseInt(e.key, 10);
      if (d >= 1 && d <= LEVELS.length) {
        EM.Main.switchLevel(game, d - 1);
      }
      if (e.code === "Space") game.input.turn = true;
    });
    window.addEventListener("keyup", (e) => {
      heldKeys.delete(e.code);
      if (e.altKey && !e.code.startsWith("Alt")) {
        // any key released while Alt is held: only clear turn if it was Alt itself
      }
      if (e.code === "Alt") {
        game.input.turn = false;
        return;
      }
      if (KEYMAP[e.code]) game.input[KEYMAP[e.code]] = false;
      if (e.code === "KeyT" || e.code === "Space") game.input.turn = false;
      // replay arrow state
      if (e.code === "ArrowLeft")  game.replayArrowLeft = false;
      if (e.code === "ArrowRight") game.replayArrowRight = false;
      if (e.code === "ArrowUp")    game.replayArrowUp = false;
      if (e.code === "ArrowDown")  game.replayArrowDown = false;
    });

    // expose for rewind to restore input from physical keyboard state
    game._restoreInput = function () {
      for (const code of heldKeys) {
        if (KEYMAP[code]) game.input[KEYMAP[code]] = true;
      }
    };
    game._releaseInput = releaseAll;

    // click handler for elmapack group select overlay
    canvas.addEventListener("click", (e) => {
      if (!game.showElmapackGroups) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = game.view.w / rect.width;
      const scaleY = game.view.h / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      const total = EM.Elmapack.ELMAPACK_GROUPS.length;
      const sc = game.view.h / 960;
      const cols = 3;
      const rowsPerCol = Math.ceil(total / cols);
      const cellW = Math.round(380 * sc);
      const cellH = Math.round(30 * sc);
      const gapX = Math.round(14 * sc);
      const gapY = Math.round(6 * sc);
      const totalW = cols * cellW + (cols - 1) * gapX;
      const startX = Math.round((game.view.w - totalW) / 2);
      const startY = Math.round(72 * sc);

      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rowsPerCol; row++) {
          const i = col * rowsPerCol + row;
          if (i >= total) continue;
          const lx = startX + col * (cellW + gapX);
          const ly = startY + row * (cellH + gapY);
          if (cx >= lx && cx <= lx + cellW && cy >= ly && cy <= ly + cellH) {
            enterElmapackGroup(game, i);
            return;
          }
        }
      }
    });

    // click handler for elmapack per-gen level select
    canvas.addEventListener("click", (e) => {
      if (!game.showLevelSelect || game.activePack !== "elmapack") return;
      if (!game.elmapackGenInfo || game.elmapackGenInfo.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = game.view.w / rect.width;
      const scaleY = game.view.h / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      const genInfo = game.elmapackGenInfo;
      const numGens = genInfo.length;
      const sc = game.view.h / 960;
      const cellW = Math.round(360 * sc);
      const cellH = Math.round(22 * sc);
      const headerH = Math.round(28 * sc);
      const gapX = Math.round(20 * sc);
      const gapY = Math.round(3 * sc);
      const totalW = numGens * cellW + (numGens - 1) * gapX;
      const startX = Math.round((game.view.w - totalW) / 2);
      const startY = Math.round(58 * sc);

      for (let col = 0; col < numGens; col++) {
        const gi = genInfo[col];
        const lx = startX + col * (cellW + gapX);
        for (let row = 0; row < gi.count; row++) {
          const ly = startY + headerH + row * (cellH + gapY);
          if (cx >= lx && cx <= lx + cellW && cy >= ly && cy <= ly + cellH) {
            const flatIdx = gi.startIdx + row;
            game.showLevelSelect = false;
            game.paused = false;
            EM.Main.switchLevel(game, flatIdx);
            return;
          }
        }
      }
    });

    // click handler for level select overlay (column-major layout)
    canvas.addEventListener("click", (e) => {
      if (!game.showLevelSelect) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = game.view.w / rect.width;
      const scaleY = game.view.h / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      const levels = getActiveLevels(game);
      const total = levels.length;
      const sc = game.view.h / 960;
      const cols = 3;
      const rowsPerCol = Math.ceil(total / cols);
      const cellW = Math.round(380 * sc);
      const cellH = Math.round(22 * sc);
      const gapX = Math.round(14 * sc);
      const gapY = Math.round(3 * sc);
      const totalW = cols * cellW + (cols - 1) * gapX;
      const startX = Math.round((game.view.w - totalW) / 2);
      const startY = Math.round(68 * sc);

      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rowsPerCol; row++) {
          const i = col * rowsPerCol + row;
          if (i >= total) continue;
          const lx = startX + col * (cellW + gapX);
          const ly = startY + row * (cellH + gapY);
          if (cx >= lx && cx <= lx + cellW && cy >= ly && cy <= ly + cellH) {
            game.showLevelSelect = false;
            game.paused = false;
            EM.Main.switchLevel(game, i);
            return;
          }
        }
      }
    });
  }

  // ------------------------------------------------------------------
  // autotest scenarios (deterministic, no rAF needed)
  // ------------------------------------------------------------------
  const T = (t, input) => ({ t, input });

  function autotest(game) {
    const results = [];
    const run = (name, script, seconds) => {
      reset(game);
      game.script = script;
      game.traceEnabled = true;
      advance(game, seconds);
      const snap = serialize(game);
      results.push({ name, status: game.status, apples: game.motor.apple_count, t: +game.eddig.toFixed(3), snap });
    };

    // 1. settle: bike should rest on the ground without input
    run("settle", [], 1.5);

    // 2. gas: hold gas 3s -> moves, wheel spins
    run("gas", [T(0, { gas: true }), T(3.0, { gas: false })], 3.0);

    // 3. volt: one right volt from standstill -> rotation changes
    run("volt_right", [T(0.1, { rightVolt: true }), T(0.15, { rightVolt: false })], 1.0);

    // 4. flip: press turn -> flipped_bike toggles, gas drives the other wheel
    run("flip", [
      T(0.1, { turn: true }),
      T(0.15, { turn: false }),
      T(0.5, { gas: true }),
      T(2.0, { gas: false }),
    ], 2.0);

    // 5. ride: burst of gas (on the 0lp01 start hill, blind gas backflips —
    //    which is the faithful physics; the test just checks determinism)
    run("ride", [T(0, { gas: true }), T(1.5, { gas: false })], 1.5);

    // determinism: rerun the ride scenario and compare full snapshots
    const snapA = results.find((r) => r.name === "ride").snap;
    reset(game);
    game.script = [T(0, { gas: true }), T(1.5, { gas: false })];
    game.traceEnabled = false;
    advance(game, 1.5);
    const snapB = serialize(game);
    results.push({ name: "determinism", ok: snapA === snapB });

    return results;
  }

  // ------------------------------------------------------------------
  // boot
  // ------------------------------------------------------------------
  async function boot(canvas) {
    const game = createGame();
    const ctx = canvas.getContext("2d");
    game.view.w = canvas.width;
    game.view.h = canvas.height;
    bindInput(game, canvas);

    window.Game = game;

    // apply settings
    const settings = EM.Menu.loadSettings();
    if (EM.Sound && EM.Sound.setMuted) EM.Sound.setMuted(!settings.sound);

    // open replay storage (IndexedDB + migrate legacy localStorage replays)
    EM.Recorder.init && EM.Recorder.init();

    // load real level + art; fall back to the built-in prototype level
    let imgs = null;
    try {
      const art = await EM.Lgr.loadAll();
      imgs = art.imgs;
      game._art = art;
      game.levelIndex = 0;
      const lev = await loadRealLevel("lev/QWQUU001.LEV");
      game.level = lev;
      game._levelFile = "lev/QWQUU001.LEV";
      game._recorder = EM.Recorder.createRecorder();
      // load ghosts based on settings
      const settings = EM.Menu.loadSettings();
      if (settings.ghostWorldRecord) {
        const recNum = String(game.levelIndex + 1).padStart(2, "0");
        try { game._worldRecordGhost = await EM.Recorder.loadRec(`rec/${recNum}mopo.rec`); } catch (e) { game._worldRecordGhost = null; }
      }
      if (settings.ghostPersonal) {
        game._ghostData = await EM.Recorder.loadAsync(game._levelFile, false);
        if (!game._ghostData) game._ghostData = await EM.Recorder.loadLastAsync(game._levelFile);
      }
      game.totalLevels = LEVELS.length;
      game.motor = Phys.newMotor();
      Phys.place_at_start(game.motor, game.level);
      game.cam = { x: game.motor.bike.r.x, y: game.motor.bike.r.y };
      game.levelRenderer = new EM.Render2.LevelRenderer(lev, imgs, art.picts, art.grassUps, art.grassDowns);
      game.imgs = imgs;
      console.log("loaded level:", lev.name, "| polys:", lev.polygons.length, "| pics:", lev.pics.length);
      // load level names from static JSON (single fast fetch)
      loadLevelNamesJson();
      loadWrTimesJson();
      // preload WR times from .rec files
      (async () => {
        const wrTimes = {};
        for (let i = 0; i < LEVELS.length; i++) {
          const recNum = String(i + 1).padStart(2, "0");
          try {
            const rd = await EM.Recorder.loadRec(`rec/${recNum}mopo.rec`);
            wrTimes[recNum] = { duration: EM.Recorder.duration(rd), name: rd.level || '' };
          } catch (e) {}
        }
        game._wrTimes = wrTimes;
      })();
    } catch (e) {
      console.warn("real level/art failed to load, using prototype level:", e);
      game.levelRenderer = null;
    }

    // live loop
    let last = performance.now();
    let acc = 0;
    let frames = 0;
    let fpsT = 0;

    function frame(now) {
      requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;

      // menu: render menu, skip physics
      if (game.showMenu) {
        EM.Menu.drawMenu(ctx, game);
        last = now;
        return;
      }

      // loading screen: dark background + "Loading..." + progress bar
      if (game.loading) {
        ctx.fillStyle = "#0a0f1a";
        ctx.fillRect(0, 0, game.view.w, game.view.h);
        ctx.textAlign = "center";
        ctx.font = "bold 28px ui-monospace, Menlo, monospace";
        ctx.fillStyle = "#ffd54f";
        ctx.fillText("Loading...", game.view.w / 2, game.view.h / 2 - 40);
        // progress bar
        const bw = 420, bh = 14;
        const bx = (game.view.w - bw) / 2, by = game.view.h / 2 + 10;
        const pct = Math.max(0, Math.min(1, game.loadProgress || 0));
        ctx.fillStyle = "#2a3350";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "#ffd54f";
        ctx.fillRect(bx, by, bw * pct, bh);
        ctx.font = "14px ui-monospace, Menlo, monospace";
        ctx.fillStyle = "#cfd8ea";
        ctx.fillText(Math.round(pct * 100) + "%", game.view.w / 2, by + bh + 22);
        ctx.textAlign = "left";
        last = now;
        return;
      }

      if (game.paused) {
        if (game.levelRenderer && game.imgs) {
          EM.Render2.draw(ctx, game, game.imgs);
          if (game.showElmapackGroups) {
            EM.Render2.drawElmapackGroups(ctx, game);
          } else if (game.showLevelSelect) {
            EM.Render2.drawLevelSelect(ctx, game);
          } else if (game.showWrReplays) {
            EM.Render2.drawWrReplays(ctx, game);
          } else {
            EM.Win.drawPauseScreen(ctx, game);
          }
        }
        // show cursor only for level select or WR replays
        canvas.classList.toggle("cursor-visible", game.showLevelSelect || game.showWrReplays || game.showElmapackGroups);
        last = now;
        return;
      }
    // Track real wall-clock time for the on-screen timer display.
      if (game.status === "riding" && !game.paused) {
        game.realTime += dt;
        // accumulate play time, flush every 5s (debounced write)
        game._playTimeAcc = (game._playTimeAcc || 0) + dt;
        if (game._playTimeAcc >= 5) { trackPlayTime(game._playTimeAcc); game._playTimeAcc = 0; }
      }
      // Match original DOS game speed
      dt *= 0.4368;
      acc += dt;

      // rewind countdown: freeze physics for 1 second (wall clock)
      if (game._rewindCountdown > 0) {
        const elapsed = (performance.now() - game._rewindCountdownStart) / 1000;
        game._rewindCountdown = Math.max(0, 1.0 - elapsed);
        if (game._rewindCountdown <= 0) {
          game._rewindCountdown = 0;
        } else {
          acc = 0; // don't run physics during countdown
        }
      }

      const maxSteps = 12;
      let n = 0;
      while (acc >= PHYS_DT && n < maxSteps) {
        applyScript(game);
        if (game.status === "riding" || game.status === "replaying") {
          step(game, PHYS_DT);
        } else if (game.status === "dead") {
          game.eddig += PHYS_DT; // keep end-of-level delay timer running
        }
        acc -= PHYS_DT;
        n++;
      }
      if (n >= maxSteps) acc = 0;
      frames++;
      // NOTE: dt was scaled by 0.4368 above for the physics accumulator; the
      // FPS counter must use real wall dt, so add the scale back.
      fpsT += dt / 0.4368;
      if (fpsT >= 0.5) {
        game.fps = Math.round(frames / fpsT);
        frames = 0;
        fpsT = 0;
      }
      // auto-restart after death (only if no rewinds left)
      if (game.status === "dead" && game._rewindCount < MAX_REWINDS) {
        // give time to press Space for rewind
      } else if (game.status === "dead" && game.eddig - game.death_time > 1.6) {
        reset(game);
      }
      if (game.levelRenderer && game.imgs) {
        EM.Render2.draw(ctx, game, game.imgs);
      } else {
        EM.Render.draw(ctx, game);
      }
      EM.Sound && EM.Sound.update(game);
    }
    requestAnimationFrame(frame);
    return game;
  }

  // Start replay playback from saved recording.
  // Resets apple state/counters exactly like the KeyR/KeyN/KeyP replay
  // entry points — otherwise the replay shows no apples (they were eaten
  // during the live run) and a stale _replayAppleEatTimes corrupts scrubbing.
  async function startReplay(game) {
    if (!game._levelFile) return false;
    const rd = await EM.Recorder.loadAsync(game._levelFile, false);
    if (!rd) return false;
    game._replayData = rd;
    game.status = "replaying";
    game.eddig = 0;
    game.realTime = 0;
    game.finish_time = 0;
    game._winResult = null;
    game.replaySpeed = 1.0;
    game.replayFrameMode = false;
    game.replayArrowLeft = false;
    game.replayArrowRight = false;
    game.replayArrowUp = false;
    game.replayArrowDown = false;
    game._replayLevelIdx = game.levelIndex || 0;
    game._replayAppleEatTimes = {};
    if (game.level) {
      for (const obj of game.level.objects) {
        if (obj.type === "apple") obj.active = true;
      }
    }
    game.motor.apple_count = 0;
    return true;
  }

  // Rewind after death: find the most stable frame in a window and resume from there.
  const REWIND_WINDOW_MIN = 0.5;  // search back at least 0.5 seconds
  const REWIND_WINDOW_MAX = 5.0;  // search back up to 5 seconds
  const REWIND_PENALTY = 5.0;     // seconds added to finish time per rewind
  const MAX_REWINDS = 3;

  function rewind(game) {
    if (game.status !== "dead") return false;
    if (game._rewindCount >= MAX_REWINDS) return false;
    if (game.realTime < 30) return false; // no rewind in first 30 seconds
    if (!game._recorder || !game._recorder.frames || game._recorder.frames.length < 2) return false;

    const frames = game._recorder.frames;
    const deathT = game.death_time;

    // search window: from (death - MAX) to (death - MIN)
    const tMin = Math.max(0, deathT - REWIND_WINDOW_MAX);
    const tMax = deathT - REWIND_WINDOW_MIN;

    // collect candidate frames in the window
    let candidates = [];
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].t >= tMin && frames[i].t <= tMax) {
        candidates.push(i);
      }
    }
    if (candidates.length === 0) {
      // not enough history, just take the earliest frame
      candidates = [0];
    }

    // score each candidate: prefer low velocity, not flipped, further from death
    let bestIdx = candidates[0];
    let bestScore = Infinity;
    for (const idx of candidates) {
      const f = frames[idx];
      const fNext = frames[Math.min(idx + 1, frames.length - 1)];
      const dt = Math.max(0.001, fNext.t - f.t);
      const vx = (fNext.bx - f.bx) / dt;
      const vy = (fNext.by - f.by) / dt;
      const speed = vx * vx + vy * vy;
      const hasFlip = (f.flags & 2) ? 1 : 0;
      const timeFromDeath = deathT - f.t;
      // penalize: high speed, flipped, close to death (bike heading toward danger)
      const score = speed + (hasFlip ? 100 : 0) - timeFromDeath * 3;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    const f = frames[bestIdx];
    const fNext = frames[Math.min(bestIdx + 1, frames.length - 1)];
    const m = game.motor;

    // estimate velocities from consecutive frames
    const dt = Math.max(0.001, fNext.t - f.t);
    const vx = (fNext.bx - f.bx) / dt;
    const vy = (fNext.by - f.by) / dt;
    const lwx = ((fNext.bx + fNext.lx) - (f.bx + f.lx)) / dt;
    const lwy = ((fNext.by + fNext.ly) - (f.by + f.ly)) / dt;
    const rwx = ((fNext.bx + fNext.rx) - (f.bx + f.rx)) / dt;
    const rwy = ((fNext.by + fNext.ry) - (f.by + f.ry)) / dt;
    let dwL = fNext.wL - f.wL;
    let dwR = fNext.wR - f.wR;
    if (dwL > Math.PI) dwL -= 2 * Math.PI;
    if (dwL < -Math.PI) dwL += 2 * Math.PI;
    if (dwR > Math.PI) dwR -= 2 * Math.PI;
    if (dwR < -Math.PI) dwR += 2 * Math.PI;
    const bvx = ((fNext.bx + fNext.bodyX) - (f.bx + f.bodyX)) / dt;
    const bvy = ((fNext.by + fNext.bodyY) - (f.by + f.bodyY)) / dt;

    // restore motor state WITH velocities
    m.bike.r.x = f.bx;
    m.bike.r.y = f.by;
    m.bike.rotation = f.rot;
    m.bike.v.x = vx;
    m.bike.v.y = vy;
    m.bike.angular_velocity = 0;
    m.left_wheel.r.x = f.bx + f.lx;
    m.left_wheel.r.y = f.by + f.ly;
    m.left_wheel.rotation = f.wL;
    m.left_wheel.v.x = lwx;
    m.left_wheel.v.y = lwy;
    m.left_wheel.angular_velocity = dwL / dt;
    m.right_wheel.r.x = f.bx + f.rx;
    m.right_wheel.r.y = f.by + f.ry;
    m.right_wheel.rotation = f.wR;
    m.right_wheel.v.x = rwx;
    m.right_wheel.v.y = rwy;
    m.right_wheel.angular_velocity = dwR / dt;
    m.head_r.x = f.bx + f.hx;
    m.head_r.y = f.by + f.hy;
    m.body_r.x = f.bx + f.bodyX;
    m.body_r.y = f.by + f.bodyY;
    m.body_v.x = bvx;
    m.body_v.y = bvy;
    m.flipped_bike = (f.flags & 2) ? 1 : 0;
    // see step() replay branch: gravity bits are port-internal only
    m.gravity_direction = game._replayData && game._replayData.fromNativeRec ? 1 : (f.flags >> 2) & 3;
    m.apple_count = f.apples || 0;
    m.last_volt_time = -100;
    m.last_turn_time = -100;

    // restore apples to the state at the rewind point: an apple stays eaten
    // iff it was eaten BEFORE the rewind frame's time; apples eaten after it
    // (between rewind point and death) become active again.
    if (game.level) {
      const eatTimes = game._appleEatTimes || {};
      for (const obj of game.level.objects) {
        if (obj.type !== "apple") continue;
        const t = eatTimes[obj.__idx];
        obj.active = !(t !== undefined && t <= f.t);
      }
    }
    m.apple_count = f.apples || 0;

    // trim the recording to this point
    game._recorder.frames = frames.slice(0, bestIdx + 1);
    game._recorder._accum = 0;

    // apply penalty
    game._rewindPenalty += REWIND_PENALTY;
    game._rewindCount++;

    // resume playing
    game.status = "riding";
    game.eddig = f.t;
    game.death_time = 0;
    game.input.turn = false;
    game.prevTurn = false;
    game.last_volt = -100;
    game.lastFlip = game.eddig;
    m.last_turn_time = game.eddig;
    // rebuild held input from physical keys (keyup events during the death
    // screen may have been missed)
    if (game._restoreInput) {
      game.input.gas = false;
      game.input.brake = false;
      game.input.leftVolt = false;
      game.input.rightVolt = false;
      game._restoreInput();
    }

    // reset motor state so physics doesn't carry stale values
    m.prev_brake = 0;
    m.left_wheel_brake_rotation = m.left_wheel.rotation - m.bike.rotation;
    m.right_wheel_brake_rotation = m.right_wheel.rotation - m.bike.rotation;
    m.volting_right = 0;
    m.volting_left = 0;
    m.right_volt_time = -1;
    m.left_volt_time = -1;
    m.angular_velocity_pre_right_volt = -1;
    m.angular_velocity_pre_left_volt = -1;

    // 1s countdown (real time — use wall clock to avoid dt scaling issue)
    game._rewindCountdown = 1.0;
    game._rewindCountdownStart = performance.now();

    return true;
  }

  return {
    PHYS_DT,
    createGame,
    reset,
    step,
    advance,
    serialize,
    autotest,
    switchLevel,
    loadLevelByUrl,
    LEVELS,
    OLP_LEVELS,
    LI_LEVELS,
    ALP_LEVELS,
    ABULA_LEVELS,
    EOL_LEVELS,
    getActiveLevels,
    getPackNames,
    loadLevelNamesJson,
    loadWrTimesJson,
    getWrTime,
    get _levelNamesMap() { return _levelNamesMap; },
    preloadOlpLevelNames,
    preloadLiLevelNames,
    preloadAlpLevelNames,
    preloadAbulaLevelNames,
    boot,
    bindInput,
    buildSegmentsFromFile,
    startReplay,
    rewind,
    getStats,
  };
})();
