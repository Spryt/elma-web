// 2D vector math, mirroring elma-miyoo/src/vect2.*
// Note: physics space is y-UP, meters. The level file coordinates are y-down,
// they are flipped when building collision segments (see segments.cpp).
window.EM = window.EM || {};

EM.V = (function () {
  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }
  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }
  function mul(a, s) {
    return { x: a.x * s, y: a.y * s };
  }
  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }
  function len(a) {
    return Math.hypot(a.x, a.y);
  }
  // rotate_90deg
  function rot90(a) {
    return { x: -a.y, y: a.x };
  }
  // rotate_minus90deg
  function rotm90(a) {
    return { x: a.y, y: -a.x };
  }
  function unit(a) {
    const l = len(a);
    return l === 0 ? { x: 0, y: 0 } : mul(a, 1 / l);
  }
  function eq(a, b, eps) {
    eps = eps === undefined ? 1e-9 : eps;
    return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
  }
  // V.add(a, b, c, ...) -> a+b+c+...
  function sum() {
    let r = { x: 0, y: 0 };
    for (let i = 0; i < arguments.length; i++) r = add(r, arguments[i]);
    return r;
  }

  return {
    zero: { x: 0, y: 0 },
    add: add,
    sub: sub,
    mul: mul,
    dot: dot,
    len: len,
    rot90: rot90,
    rotm90: rotm90,
    unit: unit,
    eq: eq,
    sum: sum,
  };
})();
