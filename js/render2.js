// Elma-style renderer with real LGR art (ported from elma-imager's levRender/
// recRender/objRender, which in turn derive from the original game).
// Coordinate spaces:
//  - physics: y-up (=-level file y), meters  (the real game does the same)
//  - render:  level file coords, y-down canvas
window.EM = window.EM || {};

EM.Render2 = (function () {
  const V = EM.V;

  // Per-frame name cleaning is wasteful; compile the patterns once.
  const RE_OLP_PREFIX = /^OLP#\d+\s*/i;
  const RE_LEADNUM = /^\d+[\s:._-]+\s*/;

  // ------------------------------------------------------------------
  // polygon containment tree (for correct ground fill with holes)
  // ------------------------------------------------------------------
  function isSub(v, outer) {
    function hits(a, b) {
      const left = Math.min(a[0], b[0]), right = Math.max(a[0], b[0]);
      if (v[0] < left || v[0] >= right) return false;
      const m = (b[1] - a[1]) / (b[0] - a[0]);
      const yint = m * (v[0] - a[0]) + a[1];
      return yint > v[1];
    }
    let n = 0;
    for (let z = 0; z < outer.length; z++) {
      if (hits(outer[z], outer[(z + 1) % outer.length])) n++;
    }
    return n % 2 !== 0;
  }

  function addPoly(vertices, tree) {
    const newTree = [];
    for (let x = 0; x < tree.length; x++) {
      if (isSub(vertices[0], tree[x].vertices)) {
        return addPoly(vertices, tree[x].inner);
      }
      if (isSub(tree[x].vertices[0], vertices)) {
        newTree.push(tree[x]);
        if (x + 1 === tree.length) tree.pop();
        else tree[x] = tree.pop();
        x--;
      }
    }
    tree[tree.length] = { vertices, inner: newTree };
  }

  // ------------------------------------------------------------------
  // level renderer: pre-renders the static level to an offscreen canvas
  // ------------------------------------------------------------------
  function LevelRenderer(level, imgs, picts, grassUps, grassDowns, renderScale, onProgress) {
    // When a progress callback is provided the tile rendering (the dominant
    // load cost) runs ASYNC in small batches, yielding to the event loop so
    // the loading screen can repaint and the progress bar can advance.
    // Without a callback (boot, tutorials — small levels) it renders
    // synchronously, exactly as before.
    let renderReady;
    const ready = new Promise((res) => { renderReady = res; });
    // solid polys in file coords
    const solidTree = [];
    const grassPolys = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of level.polygons) {
      const pts = poly.pts;
      for (const [x, y] of pts) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (poly.grass) grassPolys.push(pts);
      else addPoly(pts, solidTree);
    }
    // small margin
    // Extend bounds so the baked sky texture covers every possible camera
    // position. The camera can be up to half a viewport (w/2/s ≈ 6.7 m)
    // beyond the terrain bbox, so the sky margin must exceed that; 16 m
    // covers it with room to spare.
    const EXT = 300 / 48;
    const EXTLR = 16; // wider for left/right (sky + camera half-view)
    minX -= EXTLR; maxX += EXTLR;
    maxY += EXT;
    // Check if level is enclosed on top (solid polys near top edge)
    let hasGroundAbove = false;
    for (const poly of level.polygons) {
      if (poly.grass) continue;
      for (const [px, py] of poly.pts) {
        if (Math.abs(py - minY) < 2) { hasGroundAbove = true; break; }
      }
      if (hasGroundAbove) break;
    }
    if (hasGroundAbove) minY -= EXT;

    // Extend the canvas to also cover sky-clipped pictures (walls/cliffs
    // placed beyond the terrain's bbox). Their extents come from the LGR
    // asset sizes; without this a background tile poking past the terrain
    // bounds would be clipped out of the baked static canvas.
    for (const p of level.pics) {
      if (p.clip !== "s") continue;
      let w = 0, h = 0;
      if (p.picture && imgs[p.picture]) { w = imgs[p.picture].width / 48; h = imgs[p.picture].height / 48; }
      else if (p.mask && imgs[p.mask]) { w = imgs[p.mask].width / 48; h = imgs[p.mask].height / 48; }
      if (w <= 0) continue;
      minX = Math.min(minX, p.x - 0.01);
      maxX = Math.max(maxX, p.x + w);
      minY = Math.min(minY, p.y - 0.01);
      maxY = Math.max(maxY, p.y + h);
    }

    // ---- grass strip placement (levRender calcGrassPoly) ----
    const grassPics = []; // {x, y, pict}
    for (const poly of grassPolys) calcGrassPoly(48, poly);

    function calcGrassPoly(scale, poly) {
      let minX = Infinity, maxX = -Infinity, minXi, maxXi;
      for (let z = 0; z < poly.length; z++) {
        if (minX !== (minX = Math.min(minX, poly[z][0]))) minXi = z;
        if (maxX !== (maxX = Math.max(maxX, poly[z][0]))) maxXi = z;
      }
      let maxW = 0;
      for (let z = minXi; z % poly.length !== maxXi; z++)
        maxW = Math.max(maxW, Math.abs(poly[z % poly.length][0] - poly[(z + 1) % poly.length][0]));
      let dir = -1;
      for (let z = poly.length + minXi; z % poly.length !== maxXi; z--)
        if (maxW !== (maxW = Math.max(maxW, Math.abs(poly[z % poly.length][0] - poly[(z - 1) % poly.length][0]))))
          dir = 1;
      function yAt(x) {
        for (let z = poly.length + minXi; z % poly.length !== maxXi; z += dir) {
          const from = poly[z % poly.length], to = poly[(z + dir) % poly.length];
          if (from[0] <= x && x < to[0]) {
            const m = (to[1] - from[1]) / (to[0] - from[0]);
            return m * (x - from[0]) + from[1];
          }
        }
        return poly[minXi][1];
      }
      // Work in pixels like the original
      let curX = poly[minXi][0] * scale, curY = poly[minXi][1] * scale;
      while (curX < maxX * scale) {
        let bestD = Infinity, bestA = null, bestI = -1;
        for (let a = 0; a < grassUps.length; a++) {
          if (curX + grassUps[a].width >= maxX * scale) continue;
          const dist = Math.abs(yAt((curX + grassUps[a].width) / scale) * scale - (curY - (grassUps[a].height - 41)));
          if (dist < bestD) { bestD = dist; bestA = grassUps; bestI = a; }
        }
        for (let a = 0; a < grassDowns.length; a++) {
          if (curX + grassDowns[a].width >= maxX * scale) continue;
          const dist = Math.abs(yAt((curX + grassDowns[a].width) / scale) * scale - (curY + (grassDowns[a].height - 41)));
          if (dist < bestD) { bestD = dist; bestA = grassDowns; bestI = a; }
        }
        if (!bestA) { curX++; continue; }
        const pict = bestA[bestI];
        const fall = (pict.height - 41) * (bestA === grassUps ? -1 : 1);
        const fcx = Math.floor(curX);
        const fcyTop = Math.floor(curY) - Math.ceil((pict.height - fall) / 2);
        grassPics.push({ x: fcx / scale, y: fcyTop / scale, pict });
        curX += pict.width;
        curY += fall;
      }
    }

    // ---- static level canvas ----
    // Always render at 96 px/m (1-px camera steps, smooth scroll, consistent
    // texture scale across all levels). Giant levels that the browser can't
    // allocate at 96 px/m fall back to 48 px/m via the allocation probe below.
    let target = renderScale || 96;
    const SCALES = [];
    for (let d = 1; d <= 8; d++) if (target % d === 0) SCALES.push(target / d);
    let scale = SCALES[0];

    // Build the static layer at `scale` and VERIFY the canvas actually got
    // its backing store — oversized canvases fail SILENTLY in some browsers:
    // the width/height assignment is ignored and the canvas keeps its old
    // size, so a getImageData probe on the stale small canvas would lie.
    // Use a fresh canvas per attempt and check the dimensions actually took.
    function buildStaticCanvas() {
      const w = Math.max(1, Math.ceil((maxX - minX) * scale));
      const h = Math.max(1, Math.ceil((maxY - minY) * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      if (c.width !== w || c.height !== h) return null; // allocation refused
      const cx = c.getContext("2d");
      try {
        cx.fillStyle = "#FF0000";
        cx.fillRect(0, 0, 1, 1);
        const px = cx.getImageData(0, 0, 1, 1).data;
        if (px[0] === 255) return { canvas: c, ctx: cx };
      } catch (e) { /* allocation failed */ }
      return null;
    }

    // Chrome draws from canvases > ~6 Mpx at ~4 ms per blit (30x slower than
    // small canvases). To keep per-frame blit fast on every level, the static
    // layer is split into CHUNK-sized tiles; blit() draws only the visible
    // tiles, each a fast small-canvas copy.
    const CHUNK = 2048;
    const cw = Math.max(1, Math.ceil((maxX - minX) * scale / CHUNK));
    const ch = Math.max(1, Math.ceil((maxY - minY) * scale / CHUNK));
    const tiles = [];
    let built = null;
    function buildTile(ci, cj) {
      const w = Math.min(CHUNK, Math.ceil((maxX - minX) * scale) - ci * CHUNK);
      const h = Math.min(CHUNK, Math.ceil((maxY - minY) * scale) - cj * CHUNK);
      const c = document.createElement("canvas");
      c.width = Math.max(1, w); c.height = Math.max(1, h);
      if (c.width !== Math.max(1, w) || c.height !== Math.max(1, h)) return null;
      const cx = c.getContext("2d");
      try {
        cx.fillStyle = "#FF0000";
        cx.fillRect(0, 0, 1, 1);
        const px = cx.getImageData(0, 0, 1, 1).data;
        if (px[0] === 255) return { canvas: c, ctx: cx, ci, cj, w, h };
      } catch (e) { /* allocation failed */ }
      return null;
    }
    let allocOk = true;
    for (let cj = 0; cj < ch; cj++) {
      for (let ci = 0; ci < cw; ci++) {
        const t = buildTile(ci, cj);
        if (!t) { allocOk = false; break; }
        tiles.push(t);
      }
      if (!allocOk) break;
    }
    if (!allocOk && tiles.length === 0) {
      // fall back to a single smaller canvas
      console.error("could not allocate static level tiles");
    }
    const canvas = null; // tiles used instead

    // Render every tile: drawStatic fills each tile's canvas with the
    // static level content (ground, grass, pictures) in that tile's region.
    // This is the dominant cost of level loading, so it runs ASYNC in small
    // batches: each batch yields to the event loop, letting the loading
    // screen repaint (and the progress bar advance) between batches.
    // Large levels (several dozen 2048px tiles) would otherwise freeze the
    // main thread for seconds with a static "Loading..." and no progress.
    const ctx = null;
    let done = 0;
    const total = tiles.length;
    if (onProgress) {
      // async path: small batches, yield between them (loading bar animates)
      const BATCH = 1;
      const renderAll = () => new Promise((resolve) => {
        function renderBatch() {
          const end = Math.min(done + BATCH, total);
          for (; done < end; done++) {
            const t = tiles[done];
            const tx = minX + t.ci * CHUNK / scale;
            const ty = minY + t.cj * CHUNK / scale;
            drawStatic(t.ctx, tx, ty, t.w / scale, t.h / scale, scale);
          }
          if (onProgress) onProgress(done / total);
          if (done < total) {
            // yield to the event loop so the loading screen can repaint
            setTimeout(renderBatch, 0);
          } else {
            resolve();
          }
        }
        renderBatch();
      });
      renderAll().then(() => renderReady());
    } else {
      // sync path (boot/tutorial): unchanged behavior, no reentrancy issues
      for (; done < total; done++) {
        const t = tiles[done];
        const tx = minX + t.ci * CHUNK / scale;
        const ty = minY + t.cj * CHUNK / scale;
        drawStatic(t.ctx, tx, ty, t.w / scale, t.h / scale, scale);
      }
      renderReady();
    }

    // Sky pattern cache (built once per sky texture + scale). Declared before
    function drawStatic(c, x, y, w, h, s) {
      const pw = Math.floor(w * s), ph = Math.floor(h * s);

      // sky-clipped pictures (walls like stone3/brick, clouds, stars): baked
      // into the static canvas so they share the terrain's integer pixel
      // grid. They sit at fixed file positions inside the level bounds
      // (checked for every shipped level), so nothing is lost by baking.
      // They are drawn FIRST — in the original the sky-clipped phase gets
      // +10000 distance, so terrain always draws over them where they
      // overlap (a wall tile behind a ledge must not punch through).
      c.save();
      c.translate(-x * s, -y * s);
      drawPictures(level.pics, c, s, "s", x, y, w, h);
      c.restore();

      // solid ground: clip — compound path: viewport rect + reversed polygon
      // vertices; nonzero winding fills the terrain polygons (the rect runs
      // the other way, so it cancels inside each polygon and the ground
      // texture lands exactly on the terrain).
      c.save();
      c.beginPath();
      c.rect(0, 0, pw, ph);
      (function addClip(tree) {
        for (const node of tree) {
          const verts = node.vertices;
          c.moveTo(s * (verts[verts.length - 1][0] - x), s * (verts[verts.length - 1][1] - y));
          for (let z = verts.length - 2; z >= 0; z--) {
            c.lineTo(s * (verts[z][0] - x), s * (verts[z][1] - y));
          }
          c.closePath();
          addClip(node.inner);
        }
      })(solidTree);
      c.clip();
      const ground = imgs[level.ground] || imgs["ground"];
      // The ground texture is a 48 px/m asset: tile it scaled by s/48 so the
      // repeat period matches the world at any static canvas resolution
      // (otherwise a 96 px/m canvas makes the texture pack twice as dense).
      const gscale = s / 48;
      const gw = Math.max(1, Math.round(ground.width * gscale));
      const gh = Math.max(1, Math.round(ground.height * gscale));
      // Phase anchored to the WORLD origin (minX/minY), not the tile origin —
      // otherwise each chunk starts its own texture phase and the pattern
      // jumps at chunk borders while riding.
      const gpx = Math.floor(minX * s), gpy = Math.floor(minY * s);
      const goffsX = minX >= 0 ? gpx % gw : gw - (-gpx % gw);
      const goffsY = minY >= 0 ? gpy % gh : gh - (-gpy % gh);
      c.save();
      c.translate(-gw - goffsX, -gh - goffsY);
      c.scale(gscale, gscale);
      ground.repeat(c, (pw + gw * 2) / gscale, (ph + gh * 2) / gscale);
      c.restore();
      // ground-clipped pictures
      c.save();
      c.translate(-x * s, -y * s);
      drawPictures(level.pics, c, s, "g", x, y, w, h);
      c.restore();

      // ---- grass (ported from elma-imager levRender.js) ----
      // On the original engine every grass polygon in the .lev gets a thin
      // qgrass-textured band along its top edge — the band is NOT the whole
      // polygon (those can be many metres tall and would fill the entire
      // terrain with green). Instead the fill is confined to the union of the
      // tuft sprites placed along the top edge, clipped to each sprite's
      // per-column top alpha (pict.borders). That yields a consistent
      // ~half-a-wheel-thick grass strip on every level, respecting the
      // ground/island boundaries. The tuft sprites themselves are drawn on top.
      const grass = imgs["qgrass"];
      if (grass && grassPics.length) {
        c.save();
        // clip = union of tuft silhouettes (top edge follows the per-column alpha)
        c.beginPath();
        for (const gp of grassPics) {
          const b = gp.pict.borders;
          const gx = gp.x * s - x * s, gy = gp.y * s - y * s;
          const pw = gp.pict.width, ph = gp.pict.height;
          c.moveTo(gx, gy - 24 * s / 48);
          for (let z = 0; z < pw; z++) {
            const by = gy + ((b ? b[z] : 0) + 1) * s / 48;
            c.lineTo(gx + z * s / 48, by);
            c.lineTo(gx + (z + 1) * s / 48, by);
          }
          c.lineTo(gx + pw * s / 48, gy - 24 * s / 48);
          c.closePath();
        }
        c.clip();
        // tiled qgrass over the whole static canvas (already clipped + within
        // the ground clip, so it can only paint on the terrain)
        const gscale = s / 48;
        const gsw = Math.max(1, Math.round(grass.width * gscale));
        const gsh = Math.max(1, Math.round(grass.height * gscale));
        const gpx = Math.floor(minX * s), gpy = Math.floor(minY * s);
        const goffsX = minX >= 0 ? gpx % gsw : gsw - (-gpx % gsw);
        const goffsY = minY >= 0 ? gpy % gsh : gsh - (-gpy % gsh);
        c.save();
        c.translate(-gsw - goffsX, -gsh - goffsY);
        c.scale(gscale, gscale);
        grass.repeat(c, (pw + gsw * 2) / gscale, (ph + gsh * 2) / gscale);
        c.restore();
        c.restore();
      }
      // tuft sprites along the top edge of each grass polygon
      for (const gp of grassPics) {
        c.save();
        c.translate(gp.x * s - x * s, gp.y * s - y * s);
        c.scale(s / 48, s / 48);
        gp.pict.drawAt(c);
        c.restore();
      }

      c.restore();

      // unclipped pictures
      c.save();
      c.translate(-x * s, -y * s);
      drawPictures(level.pics, c, s, "u", x, y, w, h);
      c.restore();
    }

    // draw pictures with the given clipping into a context already in *scale space
    function drawPictures(pics, c, s, clipping, x, y, w, h) {
      // Paint order (matches elma-imager levRender.js:279-281 and recplay
      // levRender.ts:322, both derived from the original): higher distance =
      // further back painted first; within equal distance, HIGHER .lev index
      // painted first so earlier entries end up on top.
      const sorted = pics
        .filter((p) => p.clip === clipping)
        .sort((a, b) => (b.dist - a.dist) || (b.num - a.num));
      for (const pic of sorted) {
        let img = pic.picture && imgs[pic.picture];
        if (img && img.drawAt) {
          c.save();
          c.translate(pic.x * s, pic.y * s);
          c.scale(s / 48, s / 48);
          img.drawAt(c);
          c.restore();
          continue;
        }
        img = pic.texture && imgs[pic.texture];
        const mask = pic.mask && imgs[pic.mask];
        if (img && img.drawAt && mask && mask.width) {
          // Masked texture fill. The texture is a 48 px/m asset: tile it
          // scaled by s/48 (like the ground). The phase is anchored to the
          // GLOBAL world pixel grid, exactly like the original engine
          // (textura2mutato: x % texture_width on the world column), NOT to
          // the per-sprite position — that is what keeps adjacent/overlapping
          // wall tiles seamless instead of showing a striped boundary between
          // them. Each sprite just clips a window of the same world-aligned
          // texture via its mask.
          const tex = img;
          const gscale = s / 48;
          const tw = tex.width, th = tex.height;
          const mwPx = mask.width * gscale, mhPx = mask.height * gscale;
          // world grid phase in native texture pixels (48 px/m base)
          const wx = Math.round(pic.x * 48), wy = Math.round(pic.y * 48);
          const phaseX = wx >= 0 ? wx % tw : tw - (-wx % tw);
          const phaseY = wy >= 0 ? wy % th : th - (-wy % th);
          c.save();
          c.translate(pic.x * s, pic.y * s);
          c.beginPath();
          c.rect(0, 0, mwPx, mhPx);
          c.clip();
          c.translate(-phaseX * gscale, -phaseY * gscale);
          c.scale(gscale, gscale);
          tex.repeat(c, (phaseX + mwPx / gscale + tw), (phaseY + mhPx / gscale + th));
          c.restore();
        }
      }
    }

    // blit the visible part of the static level to the screen canvas
    function blit(ctx, camF, s, w, h) {
      // Snap the camera to the static canvas pixel grid (scale px/m). The
      // static canvas is half the screen resolution, so drawing it with a
      // fractional source offset would re-sample it every frame (bilinear
      // blend) — that is what makes sprite/terrain borders shimmer and
      // "shake" while riding. Snapping to whole static pixels makes the
      // upscale exact: the layer moves in clean whole-pixel steps, like the
      // original game's integer-pixel renderer. The same snapped camera is
      // used for the bike/objects/ghosts (see _camSnap), so everything stays
      // on one grid and nothing slides relative to the terrain.
      // Snap the camera to the static pixel grid (whole source pixels). The
      // 2x upscale then samples exact pixels — crisp edges, no 1px shimmer
      // on terrain borders while riding. The bike/objects use the same
      // snapped camera, so nothing slides relative to the ground.
      const snap = scale;
      const camSnap = {
        x: Math.round(camF.x * snap) / snap,
        y: Math.round(camF.y * snap) / snap,
      };
      this._camSnap = camSnap;

      // view in file coords: top-left (vx, vy), size (vw, vh); file y-down
      const vw = w / s, vh = h / s;
      const vx = camSnap.x - vw / 2, vy = camSnap.y - vh / 2;

      // Sky/background texture: tiled continuously across the whole screen,
      // world-anchored (no parallax). Works for ANY sky texture (sky.png,
      // brick, stone, ground-as-sky). Drawn here (not per-chunk) so there
      // are never seams from chunk boundaries cutting the tile.
      const sky = imgs[level.sky] || imgs["sky"];
      if (sky) {
        // The level can use a *ground-style material* (e.g. "ground", "brick",
        // "stone1") as its sky. Those are 48 px/m textures, so on a 96 px/m
        // screen they must be drawn 2x larger — otherwise the pattern comes
        // out twice as small/dense as the real game. A real sky picture
        // (sky.png etc.) is a full-screen backdrop and is drawn 1:1.
        const tw = sky.img.width, th = sky.img.height;
        const isGroundLike = /^(ground|brick|stone\d*)$/i.test(level.sky);
        const sMul = isGroundLike ? scale / 48 : 1;
        const stw = tw * sMul, sth = th * sMul;
        const mod = (v, m) => ((v % m) + m) % m;
        // world-anchored phase: left/top of the view in static px, mod tile
        const offsX = mod(Math.round(vx * scale), stw);
        const offsY = mod(Math.round(vy * scale), sth);
        const isBrick = /brick|stone/i.test(level.sky);
        if (isBrick) { ctx.save(); ctx.filter = "saturate(0.35) brightness(1.1)"; }
        for (let ty = -offsY; ty < h; ty += sth) {
          for (let tx = -offsX; tx < w; tx += stw) {
            if (sMul === 1) ctx.drawImage(sky.img, tx, ty);
            else ctx.drawImage(sky.img, 0, 0, tw, th, tx, ty, stw, sth);
          }
        }
        if (isBrick) ctx.restore();
      }

      // Static level content (ground, grass, ground/unclipped/sky pictures).
      // Render the static canvas with FULLY INTEGER source/destination rects:
      // the camera is already snapped to whole static pixels (so vx*scale is
      // an integer), and every scale ratio s/scale is an integer (SCALES are
      // divisors of 96). Any fractional remainder (minX offset, sub-pixel
      // camera) is dropped — exactly like the original integer renderer.
      if (tiles.length === 0) return;
      // Visible region in static-canvas pixels. Snap to WHOLE pixels: the
      // snapped camera makes vx*scale integer, but minX*scale is fractional,
      // so the region is rounded here and the sub-pixel remainder is carried
      // into the destination offset. That keeps every tile blit sampling
      // exact pixels (crisp edges, no shimmer) while the camera still moves
      // in 1-px steps.
      const viewLeft = Math.round(vx * scale - minX * scale);
      const viewTop = Math.round(vy * scale - minY * scale);
      const viewW = vw * scale, viewH = vh * scale;
      // iterate the tiles overlapping the viewport
      const tileW = CHUNK, tileH = CHUNK;
      const c0 = Math.max(0, Math.floor(viewLeft / tileW));
      const c1 = Math.min(cw - 1, Math.floor((viewLeft + viewW) / tileW));
      const r0 = Math.max(0, Math.floor(viewTop / tileH));
      const r1 = Math.min(ch - 1, Math.floor((viewTop + viewH) / tileH));
      for (let cj = r0; cj <= r1; cj++) {
        for (let ci = c0; ci <= c1; ci++) {
          const t = tiles[cj * cw + ci];
          if (!t) continue;
          // visible part of this tile in static-canvas px
          const sx0 = Math.max(ci * tileW, viewLeft);
          const sy0 = Math.max(cj * tileH, viewTop);
          const sx1 = Math.min(ci * tileW + t.w, viewLeft + viewW);
          const sy1 = Math.min(cj * tileH + t.h, viewTop + viewH);
          if (sx1 <= sx0 || sy1 <= sy0) continue;
          const sxs = sx0 - ci * tileW, sys = sy0 - cj * tileH;
          const sw = sx1 - sx0, sh = sy1 - sy0;
          // destination = the same visible span on screen (1:1 or 2x),
          // positioned by the tile's own origin — NOT stretched to CHUNK.
          const dx = (sx0 - viewLeft) * s / scale;
          const dy = (sy0 - viewTop) * s / scale;
          const dw = sw * s / scale, dh = sh * s / scale;
          if (window.__BL) console.log("BL", JSON.stringify({ sxs, sys, sw, sh, dx, dy, dw, dh }));
          ctx.drawImage(t.canvas, sxs, sys, sw, sh, dx, dy, dw, dh);
        }
      }
    }

    return {
      blit,
      bounds: { minX, minY, maxX, maxY },
      _canvas: tiles.length ? tiles[0].canvas : null,
      _staticScale: scale,
      _tiles: tiles,
      ready,
    };
  }

  // ------------------------------------------------------------------
  // objects (apple / exit / killer), animated
  // ------------------------------------------------------------------
  function drawObjects(ctx, game, imgs) {
    const frame = Math.floor(game.eddig * 70);
    for (const obj of game.level.objects) {
      if (!obj.active) continue;
      if (obj.type === "start") continue;
      const p = fileToScreen(game, { x: obj.x, y: obj.y });
      ctx.save();
      ctx.translate(p.x, p.y);
      const sc = game.scale * 40 / 48;
      ctx.scale(sc, sc);
      ctx.translate(-0.5, -0.5);
      if (obj.type === "apple") {
        const img = obj.anim ? imgs["qfood2"] : imgs["qfood1"];
        const of = obj.anim ? 51 : 34;
        img.frame(ctx, frame % of, of);
      } else if (obj.type === "exit") {
        imgs["qexit"].frame(ctx, frame % 50, 50);
      } else if (obj.type === "killer") {
        imgs["qkiller"].frame(ctx, frame % 33, 33);
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------
  // bike + rider (port of elma-imager/recRender.js draw())
  // ------------------------------------------------------------------
  function skewimage(c, img, bx, by, br, ih, x1, y1, x2, y2, box) {
    const o = x2 - x1, a = y2 - y1;
    c.save();
    c.translate(x1, y1);
    c.rotate(Math.atan2(a, o));
    c.translate(-bx, -by * ih);
    c.scale(bx + br + Math.hypot(o, a), ih);
    img.draw(c);
    c.restore();
  }

  function drawBike(ctx, game, imgs) {
    const m = game.motor;
    const frame = Math.floor(game.eddig * 70);
    const scale = game.scale;

    const bikePx = fileToScreen(game, { x: m.bike.r.x, y: -m.bike.r.y });

    ctx.save();
    ctx.translate(bikePx.x, bikePx.y);
    ctx.scale(scale, scale); // y-down local space, like the original

    const bikeR = m.bike.rotation; // y-up physics rotation
    const leftX = m.left_wheel.r.x - m.bike.r.x;
    const leftY = m.left_wheel.r.y - m.bike.r.y;
    const leftR = m.left_wheel.rotation;
    const rightX = m.right_wheel.r.x - m.bike.r.x;
    const rightY = m.right_wheel.r.y - m.bike.r.y;
    const rightR = m.right_wheel.rotation;
    const headX = m.head_r.x - m.bike.r.x;
    const headY = m.head_r.y - m.bike.r.y;
    const turn = m.flipped_bike ? 1 : 0;

    // volt arm animation (recRender: lastVolt = [frame, isRight])
    const animlen = 28;
    let animpos = 0;
    let lastVolt = null;
    if (m.last_volt_time >= 0) {
      lastVolt = [Math.floor(m.last_volt_time * 70), m.last_volt_side >= 0];
      animpos = frame - lastVolt[0] < animlen ? (frame - lastVolt[0]) / animlen : 0;
    }
    const lastTurnF = m.last_turn_time >= 0 ? Math.floor(m.last_turn_time * 70) - 1 : -1;
    const turnpos = lastTurnF >= 0 && lastTurnF + 24 > frame ? (frame - lastTurnF) / 24 : 0;

    const backX = !turn ? rightX : leftX;
    const backY = !turn ? rightY : leftY;
    const backR = !turn ? rightR : leftR;
    const frontX = turn ? rightX : leftX;
    const frontY = turn ? rightY : leftY;
    const frontR = turn ? rightR : leftR;

    // Always draw both wheels. During turn animation, swap which is drawn
    // before vs after the bike body (z-layering). No wheel should disappear.
    if (turnpos <= 0.5) {
      wheel(ctx, imgs, backX, backY, backR);
      wheel(ctx, imgs, frontX, frontY, frontR);
    } else {
      wheel(ctx, imgs, frontX, frontY, frontR);
      wheel(ctx, imgs, backX, backY, backR);
    }

    ctx.save();
    ctx.rotate(-bikeR);
    if (turn) ctx.scale(-1, 1);
    if (turnpos > 0) ctx.scale(turnScale(turnpos), 1);

    let wx, wy, a, r;
    const hbarsX = -21.5, hbarsY = -17;
    ctx.save();
    ctx.scale(1 / 48, 1 / 48);
    // front suspension
    wx = turn ? rightX : leftX;
    wy = turn ? -rightY : -leftY;
    a = Math.atan2(wy, (turn ? -1 : 1) * wx) + (turn ? -1 : 1) * bikeR;
    r = Math.hypot(wx, wy);
    skewimage(ctx, imgs["susp1"], 2, 0.5, 5, 6, 48 * r * Math.cos(a), 48 * r * Math.sin(a), hbarsX, hbarsY);
    // rear suspension
    wx = turn ? leftX : rightX;
    wy = turn ? -leftY : -rightY;
    a = Math.atan2(wy, (turn ? -1 : 1) * wx) + (turn ? -1 : 1) * bikeR;
    r = Math.hypot(wx, wy);
    skewimage(ctx, imgs["susp2"], 0, 0.5, 5, 6, 9, 20, 48 * r * Math.cos(a), 48 * r * Math.sin(a));
    ctx.restore();

    // bike body sprite
    ctx.save();
    ctx.translate(-43 / 48, -12 / 48);
    ctx.rotate(-Math.PI * 0.197);
    ctx.scale(0.215815 * 380 / 48, 0.215815 * 301 / 48);
    imgs["bike"].draw(ctx);
    ctx.restore();

    // ---- kuski (rider): port of elma-classic KIRAJ320.CPP ----
    // All points are computed in the TRUE bike-local physics frame
    // (toLocal of real world deltas — body_r/head_r land exactly on their
    // physics spots), using sgn-aware KIRAJ320 offsets: hatra_f negates
    // the jobbra basis, which mirrors the OFFSET X only (Y is untouched).
    // Finished points are then x-negated once at draw time (mx) to cancel
    // the settled bike mirror scale(-1,1); mid-animation the envelope
    // cos(turnpos*pi) squashes the figure — the classic flat flip.
    const cosr = Math.cos(bikeR), sinr = Math.sin(bikeR);
    const toLocal = (p) => ({ x: p.x * cosr + p.y * sinr, y: p.x * sinr - p.y * cosr });
    const MX = (p) => ({ x: turn ? -p.x : p.x, y: p.y });
    const MM = 0.0045;
    const mca = Math.cos(0.62), msa = Math.sin(0.62);
    const bodyRaw = toLocal({ x: m.body_r.x - m.bike.r.x, y: m.body_r.y - m.bike.r.y });
    const headRaw = toLocal({ x: headX, y: headY });
    // canvas-space offset of "A*Mi + B*Mj" (LGR px -> meters, y-down):
    //   upright: ( A*mca - B*msa, -(A*msa + B*mca) )
    //   turned:  ( B*msa - A*mca, -(A*msa + B*mca) )   (exact X mirror)
    const offx = (A, B) => MM * (turn ? B * msa - A * mca : A * mca - B * msa);
    const offy = (A, B) => -MM * (A * msa + B * mca);
    const bodyOff = (A, B) => MX({ x: bodyRaw.x + offx(A, B), y: bodyRaw.y + offy(A, B) });

    const hip    = bodyOff(75, -47);   // csipo — the seat
    const sh     = bodyOff(47, 65);    // vall — arm anchor
    const shBody = bodyOff(41, 70);    // valltest — torso top
    const foot   = MX({ x: offx(-44, -94), y: offy(-44, -94) }); // pedal (labfej)
    const hbar   = MX({ x: offx(-25, 128), y: offy(-25, 128) }); // grip (fogantyu)

    // Draw order (KIRAJ320): head → thigh → shin → torso → upper arm → forearm
    // head: kidobozkerek(fejr, Fejsugar=0.238, alfa=bike rot) — upright square,
    // drawn at the mirrored true head position (lands on the red circle)
    const headDraw = MX(headRaw);
    ctx.save();
    ctx.translate(headDraw.x, headDraw.y);
    ctx.scale(2 * 0.238, 2 * 0.238);
    ctx.translate(-0.5, -0.5);
    if (imgs["head"]) imgs["head"].draw(ctx);
    ctx.restore();

    // legs: knee from circle intersection (comb 0.51 / labszar 0.51).
    // Inside the draw frame the turned figure is IDENTICAL to the upright
    // one (offsets were pre-mirrored, MX cancels the ctx mirror), so the
    // pick side never flips: +1 bends the knee forward in both directions.
    const knee = joint2(foot, hip, 0.51, 0.51, 1);
    kidobozL(ctx, imgs["q1thigh"], knee, hip, 0.14, 0.03, 0.1);
    kidobozL(ctx, imgs["q1leg"], foot, knee, 0.21, 0.03, 0.03);

    // torso: hip -> shoulder-body
    kidobozL(ctx, imgs["q1body"], hip, shBody, 0.2, 0.1, 0.05);

    // arm with the original volt swing (ugrasnagysag logic, KIRAJ320)
    let hand = { x: hbar.x, y: hbar.y };
    if (animpos > 0 && lastVolt) {
      // fellendit = 1 (swing up) iff NOT (right-volt XOR flipped)
      const fellendit = lastVolt[1] === !!turn ? 1 : 0;
      let alfa = 0, hosszit = 0.1;
      if (fellendit) {
        const hatar = 0.25, maxalfa = 2.7, maxh = -0.3;
        if (animpos < hatar) { alfa = maxalfa * animpos / hatar; hosszit = maxh * animpos / hatar + 1; }
        else { const mk = 1 - (animpos - hatar) / (1 - hatar); alfa = maxalfa * mk; hosszit = maxh * mk + 1; }
      } else {
        const hatar = 0.2, maxalfa = -1.6, maxh = 0.15;
        if (animpos < hatar) { alfa = maxalfa * animpos / hatar; hosszit = maxh * animpos / hatar + 1; }
        else { const mk = 1 - (animpos - hatar) / (1 - hatar); alfa = maxalfa * mk; hosszit = maxh * mk + 1; }
      }
      // game: kar.forgatas(-alfa) in world y-up; canvas angle is negated.
      // NO turn-flip here: base points are pre-mirrored (MX) and drawn
      // through the ctx mirror, which together reflect the swing arc
      // automatically; an extra negation reverses it (arm up instead of
      // down, elbow folding into the head).
      const phi = alfa;
      const cph = Math.cos(phi), sph = Math.sin(phi);
      const kx = hand.x - sh.x, ky = hand.y - sh.y;
      hand = {
        x: sh.x + (kx * cph - ky * sph) * hosszit,
        y: sh.y + (kx * sph + ky * cph) * hosszit,
      };
    }
    const elbow = joint2(sh, hand, 0.3444, 0.3234, 1);
    kidobozL(ctx, imgs["q1up_arm"], elbow, sh, 0.11, 0.08, 0.1);
    kidobozL(ctx, imgs["q1forarm"], hand, elbow, 0.076, 0.08, 0.1);

    ctx.restore(); // end rotate(-bikeR)
    ctx.restore(); // end translate+scale


  }

  function wheel(ctx, imgs, wheelX, wheelY, wheelR) {
    ctx.save();
    ctx.translate(wheelX, -wheelY);
    ctx.rotate(-wheelR);
    ctx.scale(38.4 / 48, 38.4 / 48);
    ctx.translate(-0.5, -0.5);
    imgs["wheel"].draw(ctx);
    ctx.restore();
  }

  function turnScale(x) {
    const result = -Math.cos(x * Math.PI);
    if (Math.abs(result) < 0.0001) return 0.0001;
    return result;
  }


  // ketkormetszete (VEKT2.CPP): circle-circle intersection for joints
  // (knee/elbow), clamped when segments can't reach. side = +1 picks the
  // "left of a→b" side in world y-up terms (canvas normal (uy, -ux)).
  function joint2(a, b, l1, l2, side) {
    const vx = b.x - a.x, vy = b.y - a.y;
    let l = Math.hypot(vx, vy);
    if (l >= l1 + l2) l = l1 + l2 - 1e-6;
    if (l1 >= l + l2) l1 = l + l2 - 1e-5;
    if (l2 >= l + l1) l2 = l + l1 - 1e-5;
    const ux = vx / l, uy = vy / l;
    const nx = uy, ny = -ux;
    const x = (l1 * l1 - l2 * l2 + l * l) / (2 * l);
    const m = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    return { x: a.x + x * ux + m * nx * side, y: a.y + x * uy + m * ny * side };
  }

  // kidoboz (KIRAJ320.CPP): draw an image as an affine quad between local
  // points a→b — extended by tulloga/tullogb past the ends, full width
  // 2*szelesseg across, image perpendicular side as in the original's
  // non-mirrored case (the ctx scale(-1,1) handles the flipped bike).
  function kidobozL(c, img, a, b, szelesseg, tulloga, tullogb) {
    if (!img) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) return;
    const ux = dx / l, uy = dy / l;
    const ax = a.x - ux * tulloga, ay = a.y - uy * tulloga;
    const bx = b.x + ux * tullogb, by = b.y + uy * tullogb;
    // v2fel = rot-90(vegys) * szelesseg (world y-up) == (-uy, ux) in canvas
    const px = -uy * szelesseg, py = ux * szelesseg;
    c.save();
    c.transform(bx - ax, by - ay, 2 * px, 2 * py, ax - px, ay - py);
    img.draw(c);
    c.restore();
  }

  // ------------------------------------------------------------------
  // ghost bike — simplified semi-transparent silhouette from replay data
  // ------------------------------------------------------------------
  // ghost bike — draw a ghost from replay data with given color tint
  // ------------------------------------------------------------------
  function drawGhostBike(ctx, game, ghostData, alpha, tint) {
    if (!ghostData) return;
    const pose = EM.Recorder.interpolate(ghostData, game.eddig);
    if (!pose) return;

    const savedMotor = game.motor;
    const flipped = (pose.flags & 2) ? 1 : 0;
    game.motor = {
      bike: {
        r: { x: pose.bx, y: pose.by },
        rotation: pose.rot,
        v: { x: 0, y: 0 },
        angular_velocity: 0,
        radius: 0.3, mass: 200, inertia: 60.5, contact: 0,
      },
      left_wheel: {
        r: { x: pose.bx + pose.lx, y: pose.by + pose.ly },
        rotation: pose.wL,
        v: { x: 0, y: 0 },
        angular_velocity: 0,
        radius: 0.4, mass: 10, inertia: 0.32, contact: 0,
      },
      right_wheel: {
        r: { x: pose.bx + pose.rx, y: pose.by + pose.ry },
        rotation: pose.wR,
        v: { x: 0, y: 0 },
        angular_velocity: 0,
        radius: 0.4, mass: 10, inertia: 0.32, contact: 0,
      },
      head_r: { x: pose.bx + pose.hx, y: pose.by + pose.hy },
      flipped_bike: flipped,
      body_r: { x: pose.bx + pose.bodyX, y: pose.by + pose.bodyY },
      last_volt_time: -100,
      last_volt_side: 1,
      last_turn_time: -100,
    };

    ctx.save();
    ctx.globalAlpha = alpha;
    // NOTE: no ctx.filter here — CSS filters on canvas are very expensive on
    // many GPUs, and with two ghosts drawn every frame they can tank the fps.
    // The ghost is still distinguishable via globalAlpha.
    drawBike(ctx, game, game.imgs);
    ctx.restore();

    game.motor = savedMotor;
  }

  function drawGhost(ctx, game) {
    if (game.status === "replaying") return;
    // personal best ghost — blue tint
    drawGhostBike(ctx, game, game._ghostData, 0.35, 200);
    // world record ghost — red tint
    drawGhostBike(ctx, game, game._worldRecordGhost, 0.25, 0);
  }

  // ------------------------------------------------------------------
  // camera + screen helpers
  // ------------------------------------------------------------------
  // camera is stored in physics coords; file coords = (x, -y)
  function fileToScreen(game, f) {
    const s = game.scale;
    // Use the same camera the terrain was blitted with (snapped to the
    // static canvas pixel grid), so the bike/objects never slide relative
    // to the ground by a sub-pixel amount (that is what makes sprites and
    // their neighbours visibly vibrate against the background).
    const lr = game.levelRenderer;
    const camF = lr && lr._camSnap
      ? lr._camSnap
      : { x: game.cam.x, y: -game.cam.y };
    return {
      x: (f.x - camF.x) * s + game.view.w / 2,
      y: (f.y - camF.y) * s + game.view.h / 2,
    };
  }

  // ---- 7-segment timer (ported from elma-classic DIGIT.CPP / elma-miyoo timer.cpp) ----
  // Segments: 0=bottom, 1=bottom-left, 2=bottom-right, 3=top-left, 4=top-right, 5=middle, 6=top
  const DIGIT_SEGMENTS = {
    '0': [0,1,2,3,4,6],
    '1': [2,4],
    '2': [0,1,4,5,6],
    '3': [0,2,4,5,6],
    '4': [2,3,4,5],
    '5': [0,2,3,5,6],
    '6': [0,1,2,3,5,6],
    '7': [2,4,6],
    '8': [0,1,2,3,4,5,6],
    '9': [0,2,3,4,5,6],
  };

  function drawSegment(ctx, seg, x, y, lw, lh) {
    const t = Math.max(1, Math.round(lw * 0.18)); // line thickness
    switch (seg) {
      case 6: // top horizontal
        ctx.fillRect(x + 1, y, lw, t); break;
      case 5: // middle horizontal
        ctx.fillRect(x + 1, y + lh + 1, lw, t); break;
      case 0: // bottom horizontal
        ctx.fillRect(x + 1, y + 2 * lh + 2, lw, t); break;
      case 3: // top-left vertical
        ctx.fillRect(x, y + 1, t, lh); break;
      case 1: // bottom-left vertical
        ctx.fillRect(x, y + lh + 2, t, lh); break;
      case 4: // top-right vertical
        ctx.fillRect(x + lw + 1 - t, y + 1, t, lh); break;
      case 2: // bottom-right vertical
        ctx.fillRect(x + lw + 1 - t, y + lh + 2, t, lh); break;
    }
  }

  function drawDigit(ctx, ch, x, y, lw, lh) {
    const segs = DIGIT_SEGMENTS[ch];
    if (!segs) return;
    for (const s of segs) drawSegment(ctx, s, x, y, lw, lh);
  }

  function drawColon(ctx, x, y, lh) {
    const r = Math.max(1, Math.round(lh * 0.15));
    const cx1 = x + 1, cy1 = y + Math.round(lh * 0.5);
    const cy2 = y + Math.round(lh * 1.5) + 1;
    ctx.fillRect(cx1 - r, cy1 - r, r * 2, r * 2);
    ctx.fillRect(cx1 - r, cy2 - r, r * 2, r * 2);
  }

  // Format seconds -> "MM:SS:cc"
  function formatTime(sec) {
    const total = Math.max(0, Math.floor(sec * 100));
    const cs = total % 100;
    const s = Math.floor(total / 100) % 60;
    const m = Math.floor(total / 6000);
    if (m === 0) return `${String(s).padStart(2,'0')}:${String(cs).padStart(2,'0')}`;
    if (m < 10) return `${m}:${String(s).padStart(2,'0')}:${String(cs).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(cs).padStart(2,'0')}`;
  }

  // Format seconds as "Xh XXm XXs" for total time display
  function formatTimeH(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
    return `${m}m ${String(s).padStart(2,'0')}s`;
  }

  // Draw a full 7-segment timer at (x, y) — "MM:SS:cc"
  function drawTimer(ctx, timeStr, x, y, scale) {
    const lh = Math.round(16 * scale); // digit line height
    const lw = Math.round(10 * scale); // digit line width
    const digitW = lw + 2;
    const colonGap = Math.round(4 * scale);
    const digitGap = Math.round(4 * scale);
    const digitStep = digitW + digitGap;
    const colonStep = digitW + colonGap;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#cfd8ea";
    let cx = x;
    for (let i = 0; i < timeStr.length; i++) {
      const ch = timeStr[i];
      if (ch === ':') {
        drawColon(ctx, cx, y, lh);
        cx += colonStep;
      } else {
        drawDigit(ctx, ch, cx, y, lw, lh);
        cx += digitStep;
      }
    }
    ctx.restore();
  }

  // Draw the full HUD: left panel (compact info) + right timer
  function drawHud(ctx, game) {
    const m = game.motor;
    const w = game.view.w, h = game.view.h;
    const sc = h / 480; // scale factor relative to 640x480
    const timerScale = sc * 0.7;

    // ---- left: best time (7-segment), only if completed ----
    const bestEntry = EM.Win.getBest(game._levelFile);
    if (bestEntry) {
      drawTimer(ctx, formatTime(bestEntry.best), 14, 14, timerScale);
    }

    // ---- right: 7-segment timer ----
    const timeStr = formatTime(game.status === "replaying" ? game.eddig : game.realTime);
    const digitW = Math.round(10 * timerScale) + 2;
    const colonGap = Math.round(4 * timerScale);
    const timerWidth = 6 * (digitW + Math.round(4 * timerScale)) + 2 * colonGap;
    drawTimer(ctx, timeStr, w - timerWidth - 60, 14, timerScale);

    // ---- replay overlay: big controls at bottom center ----
    if (game.status === "replaying") {
      const cx = w / 2;
      const by = h - 50;

      // speed indicator
      ctx.textAlign = "center";
      ctx.font = "bold 22px ui-monospace, Menlo, monospace";
      if (game.replaySpeed === 0) {
        ctx.fillStyle = "#e57373";
        ctx.fillText("▮▮ PAUSED", cx, by - 50);
      } else if (game.replaySpeed < 0) {
        ctx.fillStyle = "#e57373";
        ctx.fillText(`◀◀ REWIND ${Math.abs(game.replaySpeed).toFixed(1)}x`, cx, by - 50);
      } else {
        ctx.fillStyle = "#ffd54f";
        ctx.fillText(`▶ ${game.replaySpeed.toFixed(1)}x`, cx, by - 50);
      }

      // mode indicator
      ctx.font = "14px ui-monospace, Menlo, monospace";
      ctx.fillStyle = game.replayFrameMode ? "#a5d6a7" : "#78909c";
      ctx.fillText(game.replayFrameMode ? "[ FRAME BY FRAME ]" : "[ CONTINUOUS ]", cx, by - 28);

      // controls bar
      ctx.font = "14px ui-monospace, Menlo, monospace";
      const ctrlY = by + 4;
      const items = [
        { key: "←", label: "rewind", active: game.replayArrowLeft },
        { key: "↓", label: "0.5x", active: game.replayArrowDown },
        { key: "SPACE", label: game.replayFrameMode ? "continue" : "frame mode", active: false },
        { key: "→", label: "2x", active: game.replayArrowRight },
        { key: "↑", label: "3x", active: game.replayArrowUp },
      ];
      const totalW = items.length * 120;
      let ix = cx - totalW / 2;
      for (const item of items) {
        // key box
        const kw = ctx.measureText(item.key).width + 16;
        ctx.fillStyle = item.active ? "rgba(255,213,79,0.25)" : "rgba(255,255,255,0.08)";
        ctx.strokeStyle = item.active ? "#ffd54f" : "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(ix, ctrlY - 14, kw, 22);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = item.active ? "#ffd54f" : "#8a9ab0";
        ctx.textAlign = "center";
        ctx.fillText(item.key, ix + kw / 2, ctrlY + 2);
        // label below
        ctx.font = "10px ui-monospace, Menlo, monospace";
        ctx.fillStyle = "#5a6a80";
        ctx.fillText(item.label, ix + kw / 2, ctrlY + 20);
        ctx.font = "14px ui-monospace, Menlo, monospace";
        ix += kw + 20;
      }

      // N/P hint
      ctx.textAlign = "center";
      ctx.font = "12px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "#5a6a80";
      ctx.fillText("N/P — next/prev level  ·  M — menu", cx, by + 42);
      ctx.textAlign = "left";
    }

    // ---- rewind countdown ----
    if (game._rewindCountdown > 0) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(w / 2 - 120, h / 2 - 40, 240, 80);
      ctx.font = "bold 48px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd54f";
      ctx.fillText(Math.ceil(game._rewindCountdown).toString(), w / 2, h / 2 + 16);
      ctx.font = "14px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "#cfd8ea";
      ctx.fillText("GET READY", w / 2, h / 2 + 36);
      ctx.restore();
    }

    // ---- overlays ----
    if (game.status === "dead") {
      const rewindsLeft = (game._rewindCount < 3 && game.realTime >= 30) ? 3 - game._rewindCount : 0;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = "bold 42px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff5a5a";
      ctx.fillText("KUSKI DIED", w / 2, h / 2 - 30);
      ctx.font = "16px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "#cfd8ea";
      if (rewindsLeft > 0) {
        ctx.fillText(`Space rewind (${rewindsLeft} left, +5s penalty)`, w / 2, h / 2 + 10);
        ctx.fillStyle = "#7d8db0";
        ctx.fillText("R restart", w / 2, h / 2 + 34);
      } else {
        ctx.fillText("press R to restart", w / 2, h / 2 + 10);
      }
    } else if (game.status === "finished") {
      EM.Win.drawFinishScreen(ctx, game);
    }
  }

  function draw(ctx, game, imgs) {
    ctx.fillStyle = "#0b1424";
    ctx.fillRect(0, 0, game.view.w, game.view.h);
    if (!game.levelRenderer) return;
    // Smooth (bilinear) upscale — preferred look; the static layer is built
    // at the render scale when it fits (96 px/m, 1:1) and at an integer
    // divisor otherwise (48 px/m, 2x). blit() snaps the camera to the
    // static pixel grid so the upscale is exact and nothing shimmers.
    game.levelRenderer.blit(ctx, { x: game.cam.x, y: -game.cam.y }, game.scale, game.view.w, game.view.h);
    drawObjects(ctx, game, imgs);
    drawBike(ctx, game, imgs);
    // Ghosts drawn ON TOP of the live bike so they stay visible even when
    // overlapping the rider (e.g. right after a restart both start at the
    // same spot and the ghost would otherwise be hidden underneath).
    drawGhost(ctx, game);
    drawHud(ctx, game);
    drawMinimap(ctx, game);
  }

  // ------------------------------------------------------------------
  // Minimap — inspired by the original Elasto Mania "view window"
  // (KIRAJ320.CPP kiview / ECSET.CPP kiteszview).
  //
  // The original shows a small framed inset centered on the rider that
  // renders surrounding terrain at a zoomed-out scale with:
  //   - light-blue sky background (viewegsor) — always visible
  //   - dark-blue terrain silhouettes (viewfoldsor)
  //   - colored dots for objects (viewfood, viewexit, viewkiller)
  //   - rider position dot (viewmotorindex)
  //   - green 1px border frame (keretindex)
  //
  // File coords are y-DOWN (sky=small y, ground=large y), same as canvas.
  // ------------------------------------------------------------------
  // Minimap containment-tree cache: the tree is view-independent (only the
  // rider-centered window moves), so build it once per level object.
  const _minimapTreeCache = new WeakMap(); // level -> { tree, version }
  function getMinimapTree(level) {
    let cached = _minimapTreeCache.get(level);
    if (!cached) {
      const tree = [];
      for (const poly of level.polygons) {
        if (poly.grass) continue;
        addPoly(poly.pts, tree); // built in FILE coords, mapped per-frame below
      }
      cached = tree;
      _minimapTreeCache.set(level, cached);
    }
    return cached;
  }

  function drawMinimap(ctx, game) {
    const level = game.level;
    const m = game.motor;
    if (!level || !level.polygons || !m || !m.bike) return;

    // --- inset geometry: bottom-left with generous margin ---
    const mw = 242;   // +10% from 220
    const mh = 121;   // +10% from 110
    const bx = 58;                          // 58px from left edge
    const by = game.view.h - mh - 58;       // 58px from bottom edge

    // --- zoom: tight view around rider (original shows ~10m radius) ---
    const worldHalfW = 10;
    const worldHalfH = worldHalfW * (mh / mw);
    const sc = mw / (2 * worldHalfW); // file-units → inset px

    const px = m.bike.r.x;            // rider file x (= physics x)
    const py = -m.bike.r.y;           // rider file y (file y-DOWN = -physics y-UP)
    const viewMinX = px - worldHalfW;
    const viewMinY = py - worldHalfH;

    // file coords are y-DOWN, canvas is y-DOWN → direct mapping (no flip)
    const mx = (x) => bx + (x - viewMinX) * sc;
    const my = (y) => by + (y - viewMinY) * sc;

    ctx.save();

    // --- clip to the inset box ---
    ctx.beginPath();
    ctx.rect(bx, by, mw, mh);
    ctx.clip();

    // --- sky background (light blue) ---
    ctx.fillStyle = "#59a4e1";
    ctx.fillRect(bx, by, mw, mh);

    // --- terrain: clip-fill using the CACHED containment tree (file coords),
    // mapping vertices to minimap space only for the visible part ---
    const solidTree = getMinimapTree(level);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, mw, mh);
    (function addClip(tree) {
      for (const node of tree) {
        // cheap reject: polygon bbox vs minimap viewport
        const v0 = node.vertices;
        let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
        for (let z = 0; z < v0.length; z++) {
          const X = v0[z][0], Y = v0[z][1];
          if (X < minx) minx = X; if (X > maxx) maxx = X;
          if (Y < miny) miny = Y; if (Y > maxy) maxy = Y;
        }
        if (maxx * sc < viewMinX * sc - bx || minx * sc > (viewMinX * sc + mw)) {
          // bbox entirely outside horizontally — skip subtree
          if ((minx - px) * sc > mw / 2 + bx || (px - maxx) * sc > mw / 2 + bx) continue;
        }
        const v = v0.map((pt) => [mx(pt[0]), my(pt[1])]);
        ctx.moveTo(v[v.length - 1][0], v[v.length - 1][1]);
        for (let z = v.length - 2; z >= 0; z--)
          ctx.lineTo(v[z][0], v[z][1]);
        ctx.closePath();
        addClip(node.inner);
      }
    })(solidTree);
    ctx.clip();
    ctx.fillStyle = "#192841";  // dark blue terrain
    ctx.fillRect(bx, by, mw, mh);
    ctx.restore();

    // --- objects as colored dots (viewfood/viewexit/viewkiller) ---
    if (level.objects) {
      for (const o of level.objects) {
        if (!o.active) continue;
        if (o.x < viewMinX || o.x > px + worldHalfW) continue;
        let col = null, r = 2.5;
        if (o.type === "apple") col = "#ff4444";
        else if (o.type === "exit") col = "#ff8800";
        else if (o.type === "killer") col = "#cc44ff";
        else if (o.type === "start") col = "#ffdd00";
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(mx(o.x), my(o.y), r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- rider dot (viewmotorindex) — always visible at center ---
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(mx(px), my(py), 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // --- green border frame (keretindex) ---
    ctx.strokeStyle = "#22aa22";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 1, by - 1, mw + 2, mh + 2);

    // --- level name + number below the minimap ---
    const levelNum = (game.levelIndex != null) ? (game.levelIndex + 1) : 0;
    const rawName = level.name || '';
    const cleanName = rawName.replace(RE_OLP_PREFIX, '').replace(RE_LEADNUM, '');
    const isOlpLevel = game.activePack === "olp";
    const isElmapackLevel = game.activePack === "elmapack";
    const packSfx = game.activePack === "internal" ? '' :
                    game.activePack === "olp" ? ' (OLP)' :
                    game.activePack === "li" ? ' (LI)' :
                    game.activePack === "alp" ? ' (ALP)' :
                    game.activePack === "abula" ? ' (Abula)' :
                    game.activePack === "eol" ? ' (EOL)' :
                    game.activePack === "elmapack" ? ' (Elmapack)' : '';
    const suffix = packSfx;
    ctx.fillStyle = "#cfd8ea";
    ctx.font = "bold 12px ui-monospace, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillText(levelNum + ". '" + cleanName + "'" + suffix, bx, by + mh + 16);
  }

  // ------------------------------------------------------------------
  // Level select overlay (Tab)
  // ------------------------------------------------------------------
  function drawLevelSelect(ctx, game) {
    if (!game.showLevelSelect) return;
    const w = game.view.w, h = game.view.h;
    const isOlp = game.activePack === "olp";
    const isElmapack = game.activePack === "elmapack";
    const levels = isElmapack ? (game.elmapackLevels || []) :
                   isOlp ? EM.Main.OLP_LEVELS :
                   game.activePack === "li" ? EM.Main.LI_LEVELS :
                   game.activePack === "alp" ? EM.Main.ALP_LEVELS :
                   game.activePack === "abula" ? EM.Main.ABULA_LEVELS :
                   game.activePack === "eol" ? EM.Main.EOL_LEVELS :
                   EM.Main.LEVELS;
    const total = levels.length;
    const sc = h / 960;

    // dark overlay
    ctx.fillStyle = "rgba(4,8,16,0.88)";
    ctx.fillRect(0, 0, w, h);

    // === ELMAPACK: per-gen column layout ===
    if (isElmapack && game.elmapackGenInfo && game.elmapackGenInfo.length > 0) {
      const genInfo = game.elmapackGenInfo;
      const genNames = game.elmapackGenNames || {};
      const numGens = genInfo.length;
      const cols = numGens;
      const maxRows = Math.max(...genInfo.map(g => g.count));

      // title
      let completed = 0, totalTime = 0;
      for (let ai = 0; ai < (game.elmapackNames || []).length; ai++) {
        const b = EM.Win.getBest(game.elmapackLevels[ai]);
        if (b) { completed++; totalTime += b.best; }
        else { totalTime += 600; }
      }
      const packLabel = "ELMAPACK · " + EM.Elmapack.getGroupLabel(game.elmapackGroupIdx);
      ctx.fillStyle = "#cfd8ea";
      ctx.font = "bold " + Math.round(20 * sc) + "px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText(packLabel + "  ·  " + completed + "/" + total + " completed", w / 2, 38 * sc);

      // per-gen columns
      const cellW = Math.round(360 * sc);
      const cellH = Math.round(22 * sc);
      const headerH = Math.round(28 * sc);
      const gapX = Math.round(20 * sc);
      const gapY = Math.round(3 * sc);
      const totalW = cols * cellW + (cols - 1) * gapX;
      const startX = Math.round((w - totalW) / 2);
      const startY = Math.round(58 * sc);

      for (let col = 0; col < cols; col++) {
        const gi = genInfo[col];
        const gNames = genNames[gi.gen] || [];
        const lx = startX + col * (cellW + gapX);

        // column header
        const genCompleted = gNames.filter((nm, ri) => EM.Win.getBest(game.elmapackLevels[gi.startIdx + ri])).length;
        ctx.font = "bold " + Math.round(14 * sc) + "px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = genCompleted === gi.count ? "#7ddf7d" : "#ffd54f";
        ctx.fillText("ElmaPack " + gi.gen + "  (" + genCompleted + "/" + gi.count + ")", lx + cellW / 2, startY);
        ctx.textAlign = "left";

        // levels under header
        for (let row = 0; row < gi.count; row++) {
          const ly = startY + headerH + row * (cellH + gapY);
          const flatIdx = gi.startIdx + row;
          const nm = gNames[row] || ('Level ' + (row + 1));
          const best = EM.Win.getBest(game.elmapackLevels[flatIdx]);
          const isCursor = col === game.elmapackCursorGen && row === game.elmapackCursorInGen;

          if (isCursor) {
            ctx.fillStyle = "rgba(255,255,255,0.18)";
            ctx.fillRect(lx, ly, cellW, cellH);
          }

          const label = (row + 1) + ". " + nm;
          const timeStr = best ? formatTime(best.best) : "";
          ctx.font = Math.round(11 * sc) + "px ui-monospace, Menlo, monospace";

          if (best) {
            ctx.fillStyle = "#7ddf7d";
            ctx.textAlign = "left";
            ctx.fillText(label, lx + 6, ly + cellH * 0.68);
            ctx.textAlign = "right";
            ctx.fillText(timeStr, lx + cellW - 6, ly + cellH * 0.68);
          } else {
            ctx.fillStyle = "#6a7a94";
            ctx.textAlign = "left";
            ctx.fillText(label, lx + 6, ly + cellH * 0.68);
          }
          ctx.textAlign = "left";
        }
      }

      // total time banner
      ctx.fillStyle = "#ffd54f";
      ctx.font = "bold " + Math.round(22 * sc) + "px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Total: " + formatTimeH(totalTime) + "  (" + completed + "/" + total + ")", w / 2, h - 55 * sc);

      // stats + controls
      const stats = EM.Main.getStats ? EM.Main.getStats() : { gamesPlayed: 0, totalPlayTime: 0 };
      ctx.fillStyle = "#5a6a80";
      ctx.font = Math.round(11 * sc) + "px ui-monospace, Menlo, monospace";
      ctx.fillText("played: " + stats.gamesPlayed + "  ·  time: " + formatTimeH(stats.totalPlayTime), w / 2, h - 38 * sc);
      ctx.fillText("↑↓ within gen  ·  ←→ between gens  ·  Enter select  ·  Tab / Esc close", w / 2, h - 22 * sc);
      ctx.textAlign = "left";
      return;
    }

    // === STANDARD FLAT 3-COLUMN GRID (all packs except elmapack) ===
    const pack = game.activePack;
    const prefixes = { olp: 'OLP', li: 'LI', alp: 'ALP', abula: 'Abula', eol: 'EOL' };
    const names = EM.Main.getPackNames(levels, prefixes[pack] || 'Level');
    const packLabel = pack === "olp" ? "OFFICIAL LEVEL PACK" :
                      pack === "li" ? "LOST INTERNALS" :
                      pack === "alp" ? "ALTERNATIVE LEVEL PACK" :
                      pack === "abula" ? "ABULA" :
                      pack === "eol" ? "ELMA ONLINE LEVELPACK" :
                      "INTERNAL LEVELS";

    // dark overlay
    ctx.fillStyle = "rgba(4,8,16,0.88)";
    ctx.fillRect(0, 0, w, h);

    // --- title: completed count ---
    let completed = 0, totalTime = 0;
    for (let i = 0; i < total; i++) {
      const b = EM.Win.getBest(levels[i]);
      if (b) { completed++; totalTime += b.best; }
      else { totalTime += 600; } // 10 minutes for uncompleted levels
    }
    ctx.fillStyle = "#cfd8ea";
    ctx.font = "bold " + Math.round(22 * sc) + "px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(packLabel + "  ·  " + completed + "/" + total + " completed", w / 2, 42 * sc);

    // --- level grid: column-major (levels fill DOWN each column) ---
    const packNameMap = { internal: "Internal", olp: "OLP", li: "LI", alp: "ALP", eol: "EOL", abula: "Abula" };
    const apiPack = packNameMap[pack] || null;
    const cols = 3;
    const rowsPerCol = Math.ceil(total / cols);
    const cellW = Math.round(380 * sc);
    const cellH = Math.round(22 * sc);
    const gapX = Math.round(14 * sc);
    const gapY = Math.round(3 * sc);
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = Math.round((w - totalW) / 2);
    const startY = Math.round(68 * sc);

    // map grid position -> level index (column-major)
    function levelAt(col, row) {
      const idx = col * rowsPerCol + row;
      return idx < total ? idx : -1;
    }

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rowsPerCol; row++) {
        const i = levelAt(col, row);
        if (i < 0) continue;
        const lx = startX + col * (cellW + gapX);
        const ly = startY + row * (cellH + gapY);

        const nm = names[i] || '';
        const best = EM.Win.getBest(levels[i]);
        const isCurrent = i === game.levelIndex;
        const isCursor = i === (game.levelSelectCursor || 0);

        // cell background
        if (isCursor) {
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fillRect(lx, ly, cellW, cellH);
        } else if (isCurrent) {
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(lx, ly, cellW, cellH);
        }

        // text — strip OLP#XX prefix from name if present
        const displayName = nm.replace(RE_OLP_PREFIX, '') || "...";
        const label = (i + 1) + ". " + displayName;
        const timeStr = best ? formatTime(best.best) : "";

        ctx.font = Math.round(11 * sc) + "px ui-monospace, Menlo, monospace";

        if (best) {
          ctx.fillStyle = "#7ddf7d";
          ctx.textAlign = "left";
          ctx.fillText(label, lx + 6, ly + cellH * 0.68);
          ctx.textAlign = "right";
          ctx.fillText(timeStr, lx + cellW - 6, ly + cellH * 0.68);
          // show gap to WR in gray after user time
          if (apiPack) {
            const wrTimeCs = EM.Main.getWrTime(apiPack, i + 1);
            if (wrTimeCs) {
              const diff = Math.max(0, best.best - wrTimeCs / 100);
              if (diff > 0.005) {
                const gapStr = "+" + formatTime(diff);
                const tw = ctx.measureText(timeStr).width;
                ctx.fillStyle = "#4a5a6a";
                ctx.fillText(gapStr, lx + cellW - 6 - tw - 12 * sc, ly + cellH * 0.68);
              }
            }
          }
        } else {
          // show WR time from elmaonline.net API (centiseconds) if no personal best
          let wrStr = "";
          if (apiPack) {
            const wrTimeCs = EM.Main.getWrTime(apiPack, i + 1);
            if (wrTimeCs) wrStr = formatTime(wrTimeCs / 100);
          }
          ctx.fillStyle = "#6a7a94";
          ctx.textAlign = "left";
          ctx.fillText(label, lx + 6, ly + cellH * 0.68);
          if (wrStr) {
            ctx.fillStyle = "#4a5a6a";
            ctx.textAlign = "right";
            ctx.fillText(wrStr, lx + cellW - 6, ly + cellH * 0.68);
          }
        }
        ctx.textAlign = "left";
      }
    }

    // --- total time banner ---
    ctx.fillStyle = "#ffd54f";
    ctx.font = "bold " + Math.round(28 * sc) + "px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("Total: " + formatTimeH(totalTime) + "  (" + completed + "/" + total + ")", w / 2, h - 70 * sc);

    // --- stats ---
    const stats = EM.Main.getStats ? EM.Main.getStats() : { gamesPlayed: 0, totalPlayTime: 0 };
    ctx.fillStyle = "#5a6a80";
    ctx.font = Math.round(12 * sc) + "px ui-monospace, Menlo, monospace";
    ctx.fillText("played: " + stats.gamesPlayed + "  ·  time: " + formatTimeH(stats.totalPlayTime), w / 2, h - 42 * sc);

    // --- controls hint ---
    ctx.fillText("↑↓←→ / click  ·  Enter select  ·  Tab / Esc close", w / 2, h - 20 * sc);
    ctx.fillStyle = "#3a4a5a";
    ctx.font = Math.round(10 * sc) + "px ui-monospace, Menlo, monospace";
    ctx.fillText("unfinished levels count as 10 min", w / 2, h - 6 * sc);
    ctx.textAlign = "left";
  }

  // ------------------------------------------------------------------
  // Elmapack group selection screen
  // ------------------------------------------------------------------
  function drawElmapackGroups(ctx, game) {
    if (!game.showElmapackGroups) return;
    const w = game.view.w, h = game.view.h;
    const sc = h / 960;
    const groups = EM.Elmapack.ELMAPACK_GROUPS;
    const total = groups.length;
    const totalLvls = EM.Elmapack.totalLevels();

    // dark overlay
    ctx.fillStyle = "rgba(4,8,16,0.88)";
    ctx.fillRect(0, 0, w, h);

    // title
    ctx.fillStyle = "#cfd8ea";
    ctx.font = "bold " + Math.round(22 * sc) + "px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("ELMAPACK  ·  " + totalLvls + " levels", w / 2, 42 * sc);

    // grid: 3 columns, column-major
    const cols = 3;
    const rowsPerCol = Math.ceil(total / cols);
    const cellW = Math.round(380 * sc);
    const cellH = Math.round(30 * sc);
    const gapX = Math.round(14 * sc);
    const gapY = Math.round(6 * sc);
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = Math.round((w - totalW) / 2);
    const startY = Math.round(72 * sc);

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rowsPerCol; row++) {
        const i = col * rowsPerCol + row;
        if (i >= total) continue;
        const lx = startX + col * (cellW + gapX);
        const ly = startY + row * (cellH + gapY);
        const isCursor = i === game.elmapackGroupCursor;

        // background
        if (isCursor) {
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fillRect(lx, ly, cellW, cellH);
        }

        // label
        const label = EM.Elmapack.getGroupLabel(i);
        const groupTotal = EM.Elmapack.getGroupLevels(i).length;
        ctx.font = "bold " + Math.round(13 * sc) + "px ui-monospace, Menlo, monospace";
        ctx.fillStyle = isCursor ? "#ffd54f" : "#cfd8ea";
        ctx.textAlign = "left";
        ctx.fillText(label, lx + 8, ly + cellH * 0.38);
        ctx.font = Math.round(10 * sc) + "px ui-monospace, Menlo, monospace";
        ctx.fillStyle = "#6a7a94";
        ctx.fillText(groupTotal + " levels", lx + 8, ly + cellH * 0.72);
        ctx.textAlign = "left";
      }
    }

    // controls
    ctx.fillStyle = "#5a6a80";
    ctx.font = Math.round(12 * sc) + "px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("↑↓←→ / click  ·  Enter select  ·  Esc close", w / 2, h - 30 * sc);
    ctx.textAlign = "left";
  }

  // ------------------------------------------------------------------
  // WR Replays table — shows all levels with WR times, click to watch
  // ------------------------------------------------------------------
  function drawWrReplays(ctx, game) {
    if (!game.showWrReplays) return;
    const w = game.view.w, h = game.view.h;
    const total = EM.Main.LEVELS.length;
    const names = EM.Main.getPackNames(EM.Main.LEVELS, 'Level');
    const sc = h / 960;

    ctx.fillStyle = "rgba(4,8,16,0.88)";
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd54f";
    ctx.font = "bold " + Math.round(22 * sc) + "px ui-monospace, Menlo, monospace";
    ctx.fillText("REPLAYS WR INTERNALS", w / 2, 42 * sc);

    const cols = 3;
    const rowsPerCol = Math.ceil(total / cols);
    const cellW = Math.round(380 * sc);
    const cellH = Math.round(22 * sc);
    const gapX = Math.round(14 * sc);
    const gapY = Math.round(3 * sc);
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = Math.round((w - totalW) / 2);
    const startY = Math.round(68 * sc);

    function levelAt(col, row) {
      const idx = col * rowsPerCol + row;
      return idx < total ? idx : -1;
    }

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rowsPerCol; row++) {
        const i = levelAt(col, row);
        if (i < 0) continue;
        const lx = startX + col * (cellW + gapX);
        const ly = startY + row * (cellH + gapY);

        const recNum = String(i + 1).padStart(2, "0");
        const nm = names[i] || ('Level ' + (i + 1));
        const isCursor = i === (game.wrCursor || 0);

        // try to get WR time from .rec file
        const wrEntry = game._wrTimes && game._wrTimes[recNum];
        const wrTime = wrEntry && wrEntry.duration;

        // background
        ctx.fillStyle = isCursor ? "rgba(255,213,79,0.15)" : "rgba(255,255,255,0.04)";
        ctx.fillRect(lx, ly, cellW, cellH);
        if (isCursor) {
          ctx.strokeStyle = "#ffd54f";
          ctx.lineWidth = 1;
          ctx.strokeRect(lx, ly, cellW, cellH);
        }

        const label = `${String(i + 1).padStart(2, "0")}  ${nm}`;
        ctx.fillStyle = isCursor ? "#ffd54f" : "#8a9ab0";
        ctx.font = Math.round(13 * sc) + "px ui-monospace, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillText(label, lx + 6, ly + cellH * 0.68);

        if (wrTime) {
          ctx.fillStyle = "#7ddf7d";
          ctx.textAlign = "right";
          ctx.fillText(formatTime(wrTime), lx + cellW - 6, ly + cellH * 0.68);
        }
        ctx.textAlign = "left";
      }
    }

    ctx.fillStyle = "#5a6a80";
    ctx.font = Math.round(12 * sc) + "px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("↑↓←→  ·  Enter watch replay  ·  Esc close", w / 2, h - 16 * sc);
    ctx.textAlign = "left";
  }

  return { draw, LevelRenderer, fileToScreen, drawHud, drawLevelSelect, drawElmapackGroups, drawWrReplays };
})();
