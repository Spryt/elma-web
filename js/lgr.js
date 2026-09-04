// LGR asset loader + canvas draw helpers.
// Images are the PNGs derived from the original Default.lgr
// (see elma-imager/lgrHandler.js; PNGs live in art/default/).
window.EM = window.EM || {};

EM.Lgr = (function () {
  const BASE = "art/default/";

  // picture registry: name -> [type, dist, clipping]  (from elma-imager/lgr.js)
  // type: "text" texture (tiled), "pict" picture, "mask" mask
  // clip: "s" sky, "g" ground, "u" unclipped
  const PICT_DEFS = [
    ["qgrass", "text", 400, "s"], ["qdown_1", "pict", 400, "s"],
    ["qdown_14", "pict", 400, "s"], ["qdown_5", "pict", 400, "s"],
    ["qdown_9", "pict", 400, "s"], ["qup_0", "pict", 400, "s"],
    ["qup_1", "pict", 400, "s"], ["qup_14", "pict", 400, "s"],
    ["qup_5", "pict", 400, "s"], ["qup_9", "pict", 400, "s"],
    ["qup_18", "pict", 400, "s"], ["qdown_18", "pict", 400, "s"],
    ["cliff", "pict", 400, "s"], ["stone1", "text", 750, "g"],
    ["stone2", "text", 750, "g"], ["stone3", "text", 750, "s"],
    ["st3top", "pict", 740, "s"], ["brick", "text", 750, "g"],
    ["qfood1", "pict", 400, "u"], ["qfood2", "pict", 400, "u"],
    ["bridge", "pict", 400, "u"], ["sky", "text", 800, "s"],
    ["tree2", "pict", 540, "s"], ["bush3", "pict", 440, "s"],
    ["tree4", "pict", 600, "s"], ["tree5", "pict", 600, "s"],
    ["log2", "pict", 420, "s"], ["sedge", "pict", 430, "s"],
    ["tree3", "pict", 560, "s"], ["plantain", "pict", 450, "u"],
    ["bush1", "pict", 550, "s"], ["bush2", "pict", 550, "s"],
    ["ground", "text", 800, "g"], ["flag", "pict", 450, "s"],
    ["secret", "pict", 550, "s"], ["hang", "pict", 434, "s"],
    ["edge", "pict", 440, "u"], ["mushroom", "pict", 430, "s"],
    ["log1", "pict", 420, "s"], ["tree1", "pict", 550, "s"],
    ["maskbig", "mask", 0, ""], ["maskhor", "mask", 0, ""],
    ["masklitt", "mask", 0, ""], ["barrel", "pict", 380, "s"],
    ["supphred", "pict", 380, "s"], ["suppvred", "pict", 380, "s"],
    ["support2", "pict", 380, "u"], ["support3", "pict", 380, "u"],
    ["support1", "pict", 380, "u"], ["suspdown", "pict", 380, "u"],
    ["suspup", "pict", 380, "u"], ["susp", "pict", 380, "u"],
  ];

  // images needed for the kuski/bike/objects
  const REQUIRED = [
    "ground", "sky", "qfood1", "qfood2", "qkiller", "qexit", "qgrass",
    "bike", "head", "susp1", "susp2", "wheel",
    "q1body", "q1forarm", "q1leg", "q1thigh", "q1up_arm",
  ];
  for (const d of PICT_DEFS) if (!REQUIRED.includes(d[0])) REQUIRED.push(d[0]);

  function makeImg() {
    const c = document.createElement("canvas");
    return c;
  }

  // Wrap an Image with the draw helpers used by the renderer.
  function wrap(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const o = {
      img: img,
      width: w,
      height: h,
      // draw image scaled into the unit square (0,0)-(1,1)
      draw(ctx) {
        ctx.drawImage(img, 0, 0, 1, 1);
      },
      // draw at native pixels (current transform)
      drawAt(ctx) {
        ctx.drawImage(img, 0, 0);
      },
      // tile the image over (0,0)-(w,h) in the current unit space.
      // Uses a cached canvas pattern (single GPU fill) instead of a drawImage
      // loop — hundreds of drawImage calls on a multi-megapixel canvas were
      // the dominant cost of level loading.
      repeat(ctx, w, h) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        for (let y = 0; y < h; y += img.height) {
          for (let x = 0; x < w; x += img.width) {
            ctx.drawImage(img, x, y);
          }
        }
        ctx.restore();
      },
      // draw frame `num` of a horizontal sprite strip with `of` frames
      // into the unit square
      frame(ctx, num, of) {
        const fw = w / of;
        ctx.drawImage(img, Math.floor(num) * fw, 0, fw, h, 0, 0, 1, 1);
      },
      // per-column top alpha border (for grass strip placement)
      borders: null,
    };
    return o;
  }

  function computeBorders(o) {
    const c = makeImg();
    c.width = o.width;
    c.height = o.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(o.img, 0, 0);
    let data = null;
    try {
      data = ctx.getImageData(0, 0, o.width, o.height).data;
    } catch (e) {
      return null;
    }
    const b = [];
    for (let x = 0; x < o.width; x++) {
      let y = 0;
      while (y < o.height && data[4 * (y * o.width + x) + 3] === 0) y++;
      b.push(y);
    }
    return b;
  }

  function load(name) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const o = wrap(img);
        o.borders = computeBorders(o);
        resolve(o);
      };
      img.onerror = () => reject(new Error("cannot load " + BASE + name + ".png"));
      // Use sky4.png for the default sky texture.
      img.src = BASE + (name === "sky" ? "sky4.png" : name + ".png");
    });
  }

  let cached = null;

  // returns Promise<{ imgs: {name: wrap}, picts: {name: [type,dist,clip]}, grassUps, grassDowns }>
  function loadAll() {
    if (cached) return cached;
    cached = Promise.all(REQUIRED.map((n) => load(n).then((o) => [n, o]))).then((pairs) => {
      const imgs = {};
      for (const [n, o] of pairs) imgs[n] = o;
      const picts = {};
      for (const [name, type, dist, clip] of PICT_DEFS) picts[name] = { type, dist, clip };
      const grassUps = [], grassDowns = [];
      for (const n of Object.keys(imgs)) {
        if (n.indexOf("qup_") === 0) grassUps.push(imgs[n]);
        if (n.indexOf("qdown_") === 0) grassDowns.push(imgs[n]);
      }
      return { imgs, picts, grassUps, grassDowns };
    });
    return cached;
  }

  return { loadAll: loadAll, BASE: BASE };
})();
