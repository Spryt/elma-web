// Primitive test level for the physics prototype.
// Coordinates are PHYSICS space: y-UP, meters (the game flips level-file y
// when building collision segments, see segments.cpp; we define vertices
// directly in y-up space).
// NOTE: the Elma bike at rotation 0 faces LEFT (front wheel on the left,
// rear on the right — confirmed by the LGR bike sprite and rendered frames),
// so the track runs from right (start) to left (exit).
window.EM = window.EM || {};

EM.Level = (function () {
  const V = EM.V;

  // Polygons: closed vertex lists. Only non-grass polygons are solid
  // (see segments.cpp: if (poly->is_grass) continue;).
  function makeLevel() {
    const polygons = [
      // Main ground slab: riding surface is the top edge (y = 0).
      { grass: false, pts: [[12, -6], [-55, -6], [-55, 0], [12, 0]] },
      // Bump (triangle).
      { grass: false, pts: [[-6, 0], [-2.5, 0], [-4.25, 1.05]] },
      // Low step box.
      { grass: false, pts: [[-12, 0], [-14.5, 0], [-14.5, 0.8], [-12, 0.8]] },
      // Plateau box.
      { grass: false, pts: [[-21, 0], [-27.5, 0], [-27.5, 1.5], [-21, 1.5]] },
      // Ramp down from the plateau.
      { grass: false, pts: [[-27.5, 1.5], [-33.5, 0], [-27.5, 0]] },
    ];

    const objects = [
      { type: "start", x: 2, y: 0.4, active: true },
      { type: "apple", x: -4.25, y: 2.3, active: true },
      { type: "apple", x: -13.25, y: 2.0, active: true },
      { type: "apple", x: -24.25, y: 2.9, active: true },
      { type: "apple", x: -40, y: 1.4, active: true },
      { type: "exit", x: -48, y: 0.5, active: true },
    ];

    return { polygons, objects, name: "prototype" };
  }

  // ---- Tutorial levels (file coords y-down, same as .lev files) ----
  // File coords: y increases downward. Ground surface is near y=0.
  // Objects use x/y directly (file coords); physics coords computed by buildSegmentsFromFile.

  function makeTutorial1() {
    // "First Ride" — gentle ground, hills, 3 apples, exit
    const polygons = [
      // ground slab (file y-down: ground at y=0, below is positive y)
      { grass: false, pts: [[15, 8], [-50, 8], [-50, 0], [15, 0]] },
      // grass on ground surface
      { grass: true, pts: [[15, 0], [-5, 0], [-5, -0.4], [15, -0.4]] },
      { grass: true, pts: [[-5, 0], [-15, 0], [-15, -0.4], [-5, -0.4]] },
      { grass: true, pts: [[-15, 1.5], [-25, 1.5], [-25, 1.1], [-15, 1.1]] },
      { grass: true, pts: [[-25, 3], [-35, 3], [-35, 2.6], [-25, 2.6]] },
      // hill 1 (bump up = file y going negative)
      { grass: false, pts: [[3, 0], [8, 0], [5.5, -1.2]] },
      // hill 2
      { grass: false, pts: [[12, 0], [18, 0], [15, -1.5]] },
      // step down (file y increases = lower)
      { grass: false, pts: [[-5, 0], [-8, 0], [-8, 1.5], [-5, 1.5]] },
      // landing
      { grass: false, pts: [[-15, 1.5], [-25, 1.5], [-25, 3], [-15, 3]] },
      // ramp up
      { grass: false, pts: [[-25, 3], [-30, 1.5], [-25, 1.5]] },
    ];
    const objects = [
      { type: "start", x: 10, y: -0.8 },
      { type: "apple", x: 5.5, y: -2.5 },
      { type: "apple", x: -6.5, y: -0.8 },
      { type: "apple", x: -20, y: 1.2 },
      { type: "exit", x: -40, y: 2.2 },
    ];
    // add physics coords (px=x, py=-y) and a stable index (apple eat tracking)
    objects.forEach((o, i) => { o.px = o.x; o.py = -o.y; o.__idx = i; });
    return {
      polygons, objects: objects.map(o => ({ ...o, active: true, prop: 0, anim: 0 })),
      pics: [], ground: "ground", sky: "sky",
      name: "Tutorial 1: First Ride",
      segments: buildSegmentsFromFile(polygons),
    };
  }

  function makeTutorial2() {
    // "Volt & Flip" — wall, ceiling tunnel, exit
    const polygons = [
      // ground
      { grass: false, pts: [[15, 8], [-55, 8], [-55, 0], [15, 0]] },
      // grass
      { grass: true, pts: [[15, 0], [-8, 0], [-8, -0.4], [15, -0.4]] },
      { grass: true, pts: [[-14, -2], [-8, -2], [-8, -2.4], [-14, -2.4]] },
      { grass: true, pts: [[-35, 0], [-25, 0], [-25, -0.4], [-35, -0.4]] },
      // wall
      { grass: false, pts: [[-8, 0], [-7, 0], [-7, -3], [-8, -3]] },
      // platform
      { grass: false, pts: [[-14, -2], [-7, -2], [-7, -3], [-14, -3]] },
      // ceiling
      { grass: false, pts: [[-25, -4], [-14, -4], [-14, -5], [-25, -5]] },
      // floor under ceiling
      { grass: false, pts: [[-25, -0.5], [-14, -0.5], [-14, -1.5], [-25, -1.5]] },
      // landing
      { grass: false, pts: [[-35, 0], [-25, 0], [-25, -0.5], [-35, -0.5]] },
    ];
    const objects = [
      { type: "start", x: 10, y: -0.8 },
      { type: "apple", x: -7.5, y: -4.2 },
      { type: "apple", x: -19, y: -2.5 },
      { type: "apple", x: -30, y: -1.8 },
      { type: "exit", x: -45, y: -0.3 },
    ];
    // add physics coords (px=x, py=-y) and a stable index (apple eat tracking)
    objects.forEach((o, i) => { o.px = o.x; o.py = -o.y; o.__idx = i; });
    return {
      polygons, objects: objects.map(o => ({ ...o, active: true, prop: 0, anim: 0 })),
      pics: [], ground: "ground", sky: "sky",
      name: "Tutorial 2: Volt & Flip",
      segments: buildSegmentsFromFile(polygons),
    };
  }

  // Build the segment list used for collision (order: polygon by polygon,
  // vertex by vertex, closing edge included).
  function buildSegments(level) {
    const segs = [];
    for (const poly of level.polygons) {
      if (poly.grass) continue;
      const n = poly.pts.length;
      for (let i = 0; i < n; i++) {
        const a = { x: poly.pts[i][0], y: poly.pts[i][1] };
        const b = { x: poly.pts[(i + 1) % n][0], y: poly.pts[(i + 1) % n][1] };
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

  // Build segments from file coords (y-down), converting to physics (y-up)
  function buildSegmentsFromFile(polygons) {
    const segs = [];
    let warned = false;
    for (const poly of polygons) {
      if (poly.grass) continue;
      const n = poly.pts.length;
      for (let i = 0; i < n; i++) {
        const a = { x: poly.pts[i][0], y: -poly.pts[i][1] };
        const b = { x: poly.pts[(i + 1) % n][0], y: -poly.pts[(i + 1) % n][1] };
        const v = V.sub(b, a);
        const length = V.len(v);
        if (length <= 0 && !warned) {
          // The original rejects such levels at load (segments.cpp "too
          // short!"); we warn once and skip the degenerate edge instead of
          // building a phantom collision point at the vertex.
          console.warn("level contains zero-length polygon edge(s) — skipped");
          warned = true;
        }
        if (length <= 0) continue;
        segs.push({
          r: a,
          v: v,
          unit: V.mul(v, 1 / length),
          length: length,
        });
      }
    }
    return segs;
  }

  function resetObjects(level) {
    for (const o of level.objects) o.active = true;
  }

  return { makeLevel, buildSegments, buildSegmentsFromFile, resetObjects, makeTutorial1, makeTutorial2 };
})();
