// .lev file parser (Elma level format v14), ported from elma-imager/levReader.js.
// NOTE: the file stores y-UP (math convention), which matches our physics
// space exactly — no y-inversion needed (the real game inverts to y-down).
window.EM = window.EM || {};

EM.LevFile = (function () {
  function parse(buffer) {
    const dv = new DataView(buffer);
    let o = 0;
    const magic = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3), dv.getUint8(o + 4));
    // Level id ("belyeg"): 4 bytes at offset 7 (after 5-byte magic + 2-byte
    // version checksum). Replay files store it so the original game can pair
    // a .rec with its .lev (RECORDER.CPP header; verified against 01mopo.rec).
    const levelId = dv.getInt32(7, true);
    o += 5 + 2 + 4 + 32;

    const str = (len) => {
      let s = "";
      for (let i = 0; i < len; i++) {
        const c = dv.getUint8(o + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      o += len;
      return s;
    };

    const name = str(51).trim();
    const lgr = str(16).trim();
    const ground = str(10).trim();
    const sky = str(10).trim();

    const npolys = Math.trunc(dv.getFloat64(o, true)); o += 8;
    const polygons = [];
    for (let i = 0; i < npolys; i++) {
      const grass = dv.getInt32(o, true); o += 4;
      const nv = dv.getUint32(o, true); o += 4;
      const pts = [];
      for (let v = 0; v < nv; v++) {
        pts.push([dv.getFloat64(o, true), dv.getFloat64(o + 8, true)]);
        o += 16;
      }
      polygons.push({ grass: grass !== 0, pts });
    }

    const nobj = Math.trunc(dv.getFloat64(o, true)); o += 8;
    const objects = [];
    for (let i = 0; i < nobj; i++) {
      const x = dv.getFloat64(o, true);
      const y = dv.getFloat64(o + 8, true);
      o += 16;
      const type = dv.getInt32(o, true); o += 4;
      const prop = dv.getInt32(o, true); o += 4;
      const anim = dv.getInt32(o, true); o += 4;
      objects.push({ x, y, type, prop, anim });
    }

    const npic = Math.trunc(dv.getFloat64(o, true)); o += 8;
    const pics = [];
    for (let i = 0; i < npic; i++) {
      const picture = str(10);
      const texture = str(10);
      const mask = str(10);
      const x = dv.getFloat64(o, true);
      const y = dv.getFloat64(o + 8, true);
      o += 16;
      const dist = dv.getInt32(o, true); o += 4;
      const clipIdx = dv.getInt32(o, true); o += 4;
      const clip = ["u", "g", "s"][clipIdx] || "u";
      pics.push({ picture, texture, mask, x, y, dist, clip });
    }

    return { magic, name, lgr, ground, sky, levelId, polygons, objects, pics };
  }

  // Convert parsed objects into the engine's object list.
  // x/y = level file coords (used for rendering); px/py = physics coords
  // (the real game's physics space is the y-mirror of the file: y_phys = -y_file)
  function makeObjects(parsed) {
    const TYPES = { 1: "exit", 2: "apple", 3: "killer", 4: "start" };
    const TYPE_ORDER = { killer: 0, apple: 1, exit: 2, start: 3 };
    const objects = parsed.objects
      .filter((o) => TYPES[o.type])
      .map((o) => ({
        type: TYPES[o.type],
        x: o.x,
        y: o.y,
        px: o.x,
        py: -o.y,
        prop: o.prop, // apple gravity: 1 up, 2 down, 3 left, 4 right
        anim: o.anim,
        active: true,
      }));
    // The original stable-sorts Killer→Apple→Exit→Start before play
    // (level.cpp:1157-1184), so overlapping objects resolve in that order —
    // a killer wins over an apple touched in the same step.
    objects.sort(
      (a, b) =>
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    );
    return objects;
  }

  return { parse, makeObjects };
})();
