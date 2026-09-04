// Canvas renderer for the prototype. Primitive shapes only — the LGR-based
// art reproduction is a later phase.
window.EM = window.EM || {};

EM.Render = (function () {
  const V = EM.V;

  function toScreen(p, game) {
    return {
      x: (p.x - game.cam.x) * game.scale + game.view.w / 2,
      y: game.view.h / 2 - (p.y - game.cam.y) * game.scale,
    };
  }

  function drawPolygon(ctx, pts, game, fill, stroke, lw) {
    ctx.beginPath();
    const p0 = toScreen({ x: pts[0][0], y: pts[0][1] }, game);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = toScreen({ x: pts[i][0], y: pts[i][1] }, game);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1.5;
      ctx.stroke();
    }
  }

  function drawGrassEdge(ctx, a, b, game) {
    const pa = toScreen(a, game);
    const pb = toScreen(b, game);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = "#3e9c4f";
    ctx.lineWidth = Math.max(3, 0.1 * game.scale);
    ctx.stroke();
  }

  function drawLevel(ctx, game) {
    // sky
    const grad = ctx.createLinearGradient(0, 0, 0, game.view.h);
    grad.addColorStop(0, "#0b1424");
    grad.addColorStop(1, "#1c2c4a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, game.view.w, game.view.h);

    // polygons
    for (const poly of game.level.polygons) {
      if (poly.grass) continue;
      drawPolygon(ctx, poly.pts, game, "#33364a", "#565a75", 1.5);
      // grass highlight on horizontal top edges
      let maxY = -Infinity;
      for (const pt of poly.pts) if (pt[1] > maxY) maxY = pt[1];
      const n = poly.pts.length;
      for (let i = 0; i < n; i++) {
        const a = { x: poly.pts[i][0], y: poly.pts[i][1] };
        const b = { x: poly.pts[(i + 1) % n][0], y: poly.pts[(i + 1) % n][1] };
        const horiz = Math.abs(b.y - a.y) < 0.01;
        if (horiz && Math.abs(a.y - maxY) < 0.01) drawGrassEdge(ctx, a, b, game);
      }
    }

    // objects
    for (const obj of game.level.objects) {
      if (!obj.active) continue;
      const p = toScreen({ x: obj.x, y: obj.y }, game);
      if (obj.type === "apple") {
        const isGrav = obj.prop >= 1 && obj.prop <= 4;
        const r = 0.4 * game.scale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isGrav ? "#c040d0" : "#d93a3a"; // magenta for gravity apples
        ctx.fill();
        ctx.strokeStyle = isGrav ? "#6a1a7a" : "#7c1616";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y - r * 0.95, r * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = "#3e9c4f";
        ctx.fill();
        // gravity direction arrow for gravity apples
        if (isGrav) {
          const dirs = [[0,-1],[0,1],[-1,0],[1,0]]; // up,down,left,right in file coords (y-down)
          const d = dirs[obj.prop - 1];
          const ax = p.x + d[0] * r * 1.5, ay = p.y + d[1] * r * 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x + d[0] * r * 0.6, p.y + d[1] * r * 0.6);
          ctx.lineTo(ax, ay);
          ctx.strokeStyle = "#ffee55";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      } else if (obj.type === "exit") {
        // flag pole + flag
        const top = toScreen({ x: obj.x, y: obj.y + 1.3 }, game);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(top.x, top.y);
        ctx.strokeStyle = "#b9bec9";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(top.x + 0.9 * game.scale, top.y + 0.28 * game.scale);
        ctx.lineTo(top.x, top.y + 0.55 * game.scale);
        ctx.closePath();
        ctx.fillStyle = "#ff8c1a";
        ctx.fill();
        ctx.strokeStyle = "#9c5200";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (obj.type === "start") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.25 * game.scale, 0, Math.PI * 2);
        ctx.fillStyle = "#f2d53d";
        ctx.fill();
        ctx.strokeStyle = "#8f7c12";
        ctx.stroke();
      }
    }
  }

  function drawBike(ctx, game) {
    const m = game.motor;
    const rot = m.bike.rotation;
    const i = { x: Math.cos(rot), y: Math.sin(rot) };
    const j = V.rot90(i);

    const mountL = V.add(m.bike.r, V.add(V.mul(i, EM.Physics.LeftWheelDX), V.mul(j, EM.Physics.LeftWheelDY)));
    const mountR = V.add(m.bike.r, V.add(V.mul(i, EM.Physics.RightWheelDX), V.mul(j, EM.Physics.RightWheelDY)));

    // suspension lines (mount -> wheel center)
    for (const [mount, wheel] of [
      [mountL, m.left_wheel],
      [mountR, m.right_wheel],
    ]) {
      const a = toScreen(mount, game);
      const b = toScreen(wheel.r, game);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "#7c8198";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // wheels (with visible rotation)
    for (const wheel of [m.left_wheel, m.right_wheel]) {
      const p = toScreen(wheel.r, game);
      const r = wheel.radius * game.scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#15161c";
      ctx.fill();
      ctx.strokeStyle = "#d8d8d8";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // spokes
      ctx.strokeStyle = "#9aa0b5";
      ctx.lineWidth = 1.5;
      for (let s = 0; s < 3; s++) {
        const ang = wheel.rotation + (s * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(ang) * r * 0.85, p.y - Math.sin(ang) * r * 0.85);
        ctx.lineTo(p.x + Math.cos(ang) * r * 0.85, p.y + Math.sin(ang) * r * 0.85);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#c62f2f";
      ctx.fill();
    }

    // frame: line between mounts + engine box
    const a = toScreen(mountL, game);
    const b = toScreen(mountR, game);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = "#2a2d3a";
    ctx.lineWidth = 5;
    ctx.stroke();

    // engine box at bike center, rotated
    const c = toScreen(m.bike.r, game);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(-rot); // canvas y is down
    ctx.fillStyle = "#c62f2f";
    ctx.strokeStyle = "#6e1414";
    ctx.lineWidth = 2;
    ctx.fillRect(-0.55 * game.scale, -0.14 * game.scale, 1.1 * game.scale, 0.28 * game.scale);
    ctx.strokeRect(-0.55 * game.scale, -0.14 * game.scale, 1.1 * game.scale, 0.28 * game.scale);
    ctx.restore();

    // rider: head + torso
    const hp = toScreen(m.head_r, game);
    const hr = EM.Physics.C.HeadRadius * game.scale;
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, hr, 0, Math.PI * 2);
    ctx.fillStyle = "#d9a066";
    ctx.fill();
    ctx.strokeStyle = "#8a5a2b";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const hip = toScreen(m.body_r, game);
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(hp.x, hp.y);
    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 4;
    ctx.stroke();

    // air indicator
    if (m.left_wheel.contact === 0 && m.right_wheel.contact === 0) {
      const cp = toScreen({ x: m.bike.r.x, y: m.bike.r.y + 1.1 }, game);
      ctx.font = "12px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.textAlign = "center";
      ctx.fillText("AIR", cp.x, cp.y);
    }
  }

  function drawHud(ctx, game) {
    const m = game.motor;
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.textAlign = "left";
    const GRAV_NAMES = ["UP", "DOWN", "LEFT", "RIGHT"];
    const lines = [
      `time  ${game.eddig.toFixed(2)}s`,
      `speed ${(V.len(m.bike.v) * 3.6).toFixed(1)} km/h`,
      `bike ω ${m.bike.angular_velocity.toFixed(2)} rad/s`,
      `wheel ω L ${m.left_wheel.angular_velocity.toFixed(1)} / R ${m.right_wheel.angular_velocity.toFixed(1)}`,
      `rot ${(m.bike.rotation * 180 / Math.PI).toFixed(1)}°`,
      `contacts L${m.left_wheel.contact} R${m.right_wheel.contact}`,
      `flipped ${m.flipped_bike ? "yes" : "no"}`,
      `gravity ${GRAV_NAMES[m.gravity_direction] || "?"}`,
      `friction ${m.max_friction.toFixed(2)}`,
      `apples ${m.apple_count}/${game.level.objects.filter((o) => o.type === "apple").length}`,
    ];
    ctx.fillStyle = "rgba(8,12,22,0.72)";
    ctx.fillRect(8, 8, 210, 16 * lines.length + 10);
    ctx.fillStyle = "#cfe3ff";
    lines.forEach((l, idx) => ctx.fillText(l, 14, 24 + idx * 16));

    // right: fps / input
    const right = [];
    right.push(`fps ${game.fps || 0}`);
    right.push(
      `in g:${game.input.gas ? 1 : 0} b:${game.input.brake ? 1 : 0} ` +
        `l:${game.input.leftVolt ? 1 : 0} r:${game.input.rightVolt ? 1 : 0} t:${game.input.turn ? 1 : 0}`
    );
    right.push(`state: ${game.status}`);
    ctx.fillStyle = "rgba(8,12,22,0.72)";
    ctx.fillRect(game.view.w - 230, 8, 222, 16 * right.length + 10);
    ctx.fillStyle = "#cfe3ff";
    right.forEach((l, idx) => ctx.fillText(l, game.view.w - 216, 24 + idx * 16));

    // status overlay
    if (game.status === "dead") {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, game.view.w, game.view.h);
      ctx.font = "bold 42px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff5a5a";
      ctx.fillText("KUSKI DIED", game.view.w / 2, game.view.h / 2 - 10);
      ctx.font = "16px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "#cfd8ea";
      ctx.fillText("press R to restart", game.view.w / 2, game.view.h / 2 + 28);
    } else if (game.status === "finished") {
      EM.Win.drawFinishScreen(ctx, game);
    }
  }

  function draw(ctx, game) {
    ctx.save();
    // camera shake (deterministic, strongest right after a volt)
    const ugrasnagysag = Math.max(0, 1 - (game.eddig - game.motor.last_volt_time) / EM.Physics.C.VoltDelay);
    if (ugrasnagysag > 0 && game.status === "riding") {
      const s = ugrasnagysag * 2.2 * Math.min(1, game.scale / 48);
      game.cam.x += Math.sin(game.eddig * 83) * s / game.scale;
      game.cam.y += Math.cos(game.eddig * 61) * s / game.scale;
    }
    drawLevel(ctx, game);
    drawBike(ctx, game);
    ctx.restore();
    drawHud(ctx, game);
  }

  return { draw: draw, toScreen: toScreen };
})();
