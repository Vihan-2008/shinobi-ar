// Dōjutsu (eye technique) pattern generation and the AR eye renderer.
// Every pattern is drawn procedurally into a 256px texture, then mapped onto the tracked iris.

import { EYES } from './config.js';
import { glowSprite, mulberry32, clamp, easeOut } from './particles.js';
import { FACE_IDX } from './tracking.js';

const S = 256, C = 128, R = 122;
const TAU = Math.PI * 2;
const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
const INK = '#0b0002';

function disc(ctx, r) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); }

function fibers(ctx, color, alpha, seed, r0 = 0.22, r1 = 0.95, n = 110) {
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.05;
    ctx.lineWidth = 0.6 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(...polar(R * (r0 + rnd() * 0.08), a));
    ctx.lineTo(...polar(R * (r1 - rnd() * 0.2), a + (rnd() - 0.5) * 0.08));
    ctx.stroke();
  }
  ctx.restore();
}

function limbal(ctx, color = '#120002', w = 0.07) {
  ctx.lineWidth = R * w;
  ctx.strokeStyle = color;
  disc(ctx, R * (1 - w / 2));
  ctx.stroke();
}

function redIris(ctx, seed = 7) {
  // Deep crimson rather than poster red: it is blended with the real eye's shading at render time.
  const g = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
  g.addColorStop(0, '#f2412c');
  g.addColorStop(0.42, '#c8101b');
  g.addColorStop(0.82, '#82070f');
  g.addColorStop(1, '#4a0307');
  ctx.fillStyle = g;
  disc(ctx, R);
  ctx.fill();
  fibers(ctx, '#2a0004', 0.28, seed);
  fibers(ctx, '#ff9a86', 0.1, seed + 1, 0.3, 0.8, 60);
  limbal(ctx, '#1a0204', 0.08);
}

function pupil(ctx, r = 0.17, color = INK) {
  ctx.fillStyle = color;
  disc(ctx, R * r);
  ctx.fill();
}

function ring(ctx, r, w = 0.03, color = 'rgba(20,0,0,0.8)') {
  ctx.lineWidth = R * w;
  ctx.strokeStyle = color;
  disc(ctx, R * r);
  ctx.stroke();
}

/** A single tomoe (comma): head on the ring, tail sweeping along it. */
function tomoe(ctx, ringR, ang, hr, color = INK) {
  ctx.save();
  ctx.rotate(ang);
  ctx.translate(ringR, 0);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, hr, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hr, 0);
  ctx.quadraticCurveTo(hr * 1.1, hr * 1.95, -hr * 0.6, hr * 2.9);
  ctx.quadraticCurveTo(-hr * 0.12, hr * 1.5, -hr * 0.8, hr * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function sharingan(ctx, n) {
  redIris(ctx);
  ring(ctx, 0.56, 0.028, 'rgba(25,0,0,0.75)');
  pupil(ctx, 0.17);
  for (let k = 0; k < n; k++) tomoe(ctx, R * 0.56, -Math.PI / 2 + (k * TAU) / n, R * 0.135);
}

function pinwheelBlades(ctx, count, opts) {
  const { inner = 0.16, outer = 0.93, lead = 0.5, span = 0.9, back = 1.2, c1 = 0.55, c2 = 0.5, rot = -Math.PI / 2 } = opts;
  for (let k = 0; k < count; k++) {
    const a = rot + (k * TAU) / count;
    ctx.beginPath();
    ctx.moveTo(...polar(R * inner, a - lead));
    ctx.quadraticCurveTo(...polar(R * c1, a - lead * 1.1), ...polar(R * outer, a + 0.05));
    ctx.arc(0, 0, R * outer, a + 0.05, a + span);
    ctx.quadraticCurveTo(...polar(R * c2, a + span * 0.6), ...polar(R * inner, a + back));
    ctx.closePath();
    ctx.fill();
  }
}

function msItachi(ctx) {
  redIris(ctx, 11);
  ctx.fillStyle = INK;
  pinwheelBlades(ctx, 3, { lead: 0.55, span: 0.95, back: 1.25 });
  pupil(ctx, 0.25);
  ctx.fillStyle = '#c40d1d';
  disc(ctx, R * 0.07);
  ctx.fill();
}

function msKakashi(ctx) {
  redIris(ctx, 13);
  ring(ctx, 0.3, 0.02, 'rgba(20,0,0,0.5)');
  ctx.fillStyle = INK;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 3;
    ctx.beginPath();
    ctx.moveTo(...polar(R * 0.18, a - 0.2));
    ctx.quadraticCurveTo(...polar(R * 1.0, a + 0.25), ...polar(R * 0.9, a + 1.6));
    ctx.quadraticCurveTo(...polar(R * 0.6, a + 0.7), ...polar(R * 0.18, a + 0.95));
    ctx.closePath();
    ctx.fill();
  }
  pupil(ctx, 0.2);
}

function sasukeLenses(ctx, fill, stroke) {
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 3;
    ctx.beginPath();
    ctx.moveTo(...polar(R * 0.12, a + Math.PI));
    ctx.quadraticCurveTo(...polar(R * 0.62, a - 0.5), ...polar(R * 0.95, a));
    ctx.quadraticCurveTo(...polar(R * 0.5, a + 0.3), ...polar(R * 0.12, a + Math.PI));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = R * 0.035;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
}

function msSasuke(ctx) {
  redIris(ctx, 17);
  sasukeLenses(ctx, INK);
  ring(ctx, 0.46, 0.04, INK);
  ctx.fillStyle = '#c40d1d';
  disc(ctx, R * 0.14);
  ctx.fill();
  pupil(ctx, 0.08);
}

function msShisui(ctx) {
  redIris(ctx, 19);
  ctx.fillStyle = INK;
  pinwheelBlades(ctx, 4, { inner: 0.14, lead: 0.4, span: 0.55, back: 0.85, c1: 0.62, c2: 0.42, rot: -Math.PI / 4 });
  pupil(ctx, 0.2);
}

function madaraArcs(ctx, color) {
  ctx.fillStyle = color;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 3;
    ctx.beginPath();
    ctx.moveTo(...polar(R * 0.26, a));
    ctx.quadraticCurveTo(...polar(R * 0.78, a - 0.35), ...polar(R * 0.93, a + 0.55));
    ctx.arc(0, 0, R * 0.93, a + 0.55, a + 0.95);
    ctx.quadraticCurveTo(...polar(R * 0.6, a + 0.5), ...polar(R * 0.26, a + 0.75));
    ctx.closePath();
    ctx.fill();
  }
}

function msMadara(ctx) {
  redIris(ctx, 23);
  madaraArcs(ctx, INK);
  ring(ctx, 0.26, 0.06, INK);
  pupil(ctx, 0.12);
}

function emsSasuke(ctx) {
  redIris(ctx, 29);
  ctx.fillStyle = INK;
  pinwheelBlades(ctx, 3, { lead: 0.55, span: 0.95, back: 1.25, rot: -Math.PI / 2 + Math.PI / 3 });
  sasukeLenses(ctx, '#d4101f', INK);
  ring(ctx, 0.46, 0.035, INK);
  pupil(ctx, 0.12);
}

function emsMadara(ctx) {
  redIris(ctx, 31);
  madaraArcs(ctx, INK);
  ctx.strokeStyle = '#d4101f';
  ctx.lineWidth = R * 0.05;
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 3 + 0.72;
    ctx.beginPath();
    ctx.moveTo(...polar(R * 0.34, a));
    ctx.lineTo(...polar(R * 0.82, a));
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = R * 0.035;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 3 + Math.PI / 3 + 0.4;
    ctx.beginPath();
    ctx.moveTo(...polar(R * 0.2, a));
    ctx.lineTo(...polar(R * 0.92, a));
    ctx.stroke();
  }
  ring(ctx, 0.26, 0.06, INK);
  pupil(ctx, 0.12);
}

function ripples(ctx, inner, mid, outer, ringColor) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  disc(ctx, R);
  ctx.fill();
  for (let i = 1; i <= 4; i++) ring(ctx, 0.12 + i * 0.21, 0.04, ringColor);
}

function rinnegan(ctx, withTomoe) {
  ripples(ctx, '#efe8ff', '#c0aef0', '#8a74cc', 'rgba(52,36,96,0.9)');
  fibers(ctx, '#5a4790', 0.08, 41, 0.15, 1, 70);
  pupil(ctx, 0.1, '#2a1d4a');
  if (withTomoe) {
    for (let k = 0; k < 3; k++) tomoe(ctx, R * 0.33, -Math.PI / 2 + (k * TAU) / 3, R * 0.07, '#140a26');
    for (let k = 0; k < 3; k++) tomoe(ctx, R * 0.54, -Math.PI / 6 + (k * TAU) / 3, R * 0.075, '#140a26');
  }
}

function rinneSharingan(ctx) {
  ripples(ctx, '#ff5a4a', '#d40f22', '#7c0012', 'rgba(45,0,6,0.9)');
  fibers(ctx, '#3a0005', 0.15, 43, 0.15, 1, 80);
  pupil(ctx, 0.1, '#1a0003');
  const rings = [0.33, 0.54, 0.75];
  rings.forEach((rr, j) => {
    for (let k = 0; k < 3; k++) tomoe(ctx, R * rr, -Math.PI / 2 + (k * TAU) / 3 + j * 0.5, R * (0.062 + j * 0.006), '#160002');
  });
}

function byakugan(ctx) {
  // Near-white iris: a faint lavender-grey disc, a ring of fine radial fibres, and only an outline
  // where the pupil would be.
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, 'rgba(250,248,253,1)');
  g.addColorStop(0.7, 'rgba(236,231,244,1)');
  g.addColorStop(1, 'rgba(214,206,232,1)');
  ctx.fillStyle = g;
  disc(ctx, R);
  ctx.fill();
  const rnd = mulberry32(47);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * TAU + rnd() * 0.04;
    const r0 = R * (0.48 + rnd() * 0.07), r1 = r0 + R * (0.06 + rnd() * 0.1);
    ctx.strokeStyle = `rgba(78,70,98,${0.35 + rnd() * 0.3})`;
    ctx.lineWidth = 1 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(...polar(r0, a));
    ctx.lineTo(...polar(r1, a + (rnd() - 0.5) * 0.04));
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(70,62,92,0.6)';
  ctx.lineWidth = R * 0.028;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.15, R * 0.19, 0, 0, TAU);
  ctx.stroke();
  ring(ctx, 0.975, 0.035, 'rgba(110,100,140,0.5)');
}

function tenseigan(ctx) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, '#effcff');
  g.addColorStop(0.22, '#8ae6ff');
  g.addColorStop(0.65, '#1f8fe0');
  g.addColorStop(1, '#0a3a86');
  ctx.fillStyle = g;
  disc(ctx, R);
  ctx.fill();
  fibers(ctx, '#bff2ff', 0.18, 53, 0.25, 0.95, 90);
  ctx.fillStyle = 'rgba(240,252,255,0.9)';
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8;
    ctx.beginPath();
    ctx.moveTo(...polar(R * 0.12, a));
    ctx.quadraticCurveTo(...polar(R * 0.5, a + 0.16), ...polar(R * 0.86, a));
    ctx.quadraticCurveTo(...polar(R * 0.5, a - 0.16), ...polar(R * 0.12, a));
    ctx.fill();
  }
  ring(ctx, 0.3, 0.035, 'rgba(230,250,255,0.9)');
  limbal(ctx, '#062a62', 0.05);
  pupil(ctx, 0.08, '#0b2a5a');
}

function natural(ctx) {
  const g = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
  g.addColorStop(0, '#7a5232');
  g.addColorStop(0.6, '#4b2f1b');
  g.addColorStop(1, '#22150c');
  ctx.fillStyle = g;
  disc(ctx, R);
  ctx.fill();
  fibers(ctx, '#c08a55', 0.15, 3);
  pupil(ctx, 0.3, '#050302');
}

const DRAW = {
  none: natural,
  sharingan1: c => sharingan(c, 1),
  sharingan2: c => sharingan(c, 2),
  sharingan3: c => sharingan(c, 3),
  ms_itachi: msItachi,
  ms_kakashi: msKakashi,
  ms_sasuke: msSasuke,
  ms_shisui: msShisui,
  ms_madara: msMadara,
  ems_sasuke: emsSasuke,
  ems_madara: emsMadara,
  rinnegan: c => rinnegan(c, false),
  rinnegan_tomoe: c => rinnegan(c, true),
  rinne_sharingan: rinneSharingan,
  byakugan,
  tenseigan,
};

const cache = new Map();
export function patternCanvas(type) {
  if (cache.has(type)) return cache.get(type);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.translate(C, C);
  (DRAW[type] || natural)(ctx);
  // Feather the rim so the overlay melts into the eye like a contact lens instead of a sticker.
  // The fade is radial, so it survives any rotation applied at draw time.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(C, C, R * 0.84, C, C, R * 1.02);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  cache.set(type, cv);
  return cv;
}

/** Almond eye icon for the GUI. */
export function drawEyeIcon(canvas, type, { sclera = true } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const def = EYES[type] || EYES.none;
  if (!sclera) {
    const r = Math.min(w, h) / 2 - 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.clip();
    if (def.fullEye) { ctx.fillStyle = def.sclera; ctx.fill(); }
    const rr = r * (def.fullEye ? 1.25 : 1);
    ctx.drawImage(patternCanvas(type), -rr, -rr, rr * 2, rr * 2);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.03, h * 0.52);
  ctx.quadraticCurveTo(w * 0.5, -h * 0.28, w * 0.97, h * 0.48);
  ctx.quadraticCurveTo(w * 0.5, h * 1.22, w * 0.03, h * 0.52);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = def.fullEye ? def.sclera : '#f2ece2';
  ctx.fillRect(0, 0, w, h);
  const r = h * 0.42 * (def.fullEye ? (def.scale || 1) * 0.95 : 1);
  ctx.drawImage(patternCanvas(type), w / 2 - r, h / 2 - r, r * 2, r * 2);
  const sh = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = 'rgba(10,6,6,0.9)';
  ctx.stroke();
  ctx.restore();
}

/* ───────────────────────── Byakugan veins ───────────────────────── */

/**
 * Byakugan veins: thin raised veins that fan from the outer half of the eye, out toward the temple
 * and down the side of the cheek, curving away from the nose and forking in clean Y shapes. Units are
 * eye widths, x points from the inner to the outer corner and y points down. Each vein carries a
 * delay so the network grows outward when the eye activates.
 */
function genVeins(seed) {
  const rnd = mulberry32(seed);
  const veins = [];
  const walk = (x, y, ang, len, bend, n = 8) => {
    const pts = [];
    let a = ang, px = x, py = y;
    const step = len / n;
    for (let i = 0; i <= n; i++) {
      pts.push([px, py]);
      a += bend / n + (rnd() - 0.5) * 0.08;
      px += Math.cos(a) * step;
      py += Math.sin(a) * step;
    }
    return pts;
  };
  const add = (pts, width, delay, fade = 1) => { veins.push({ pts, width, delay, fade, phase: rnd() * TAU }); return pts; };
  // Clean Y-shaped forks: short twigs leaving at a narrow angle, alternating sides, so the network
  // splits like a real vein instead of crossing its neighbours.
  const branchOff = (pts, width, delay, depth) => {
    const n = pts.length - 1;
    const forks = [Math.floor(n * 0.4), Math.floor(n * 0.7)];
    forks.forEach((k, b) => {
      const [bx, by] = pts[k];
      const [nx, ny] = pts[k + 1];
      const side = b % 2 === 0 ? 1 : -1;
      const dir = Math.atan2(ny - by, nx - bx) + side * (0.35 + rnd() * 0.2);
      const child = add(walk(bx, by, dir, 0.16 + rnd() * 0.12, side * 0.15, 6), width * 0.6, delay + (k / n) * 0.5, 0.85);
      if (depth > 0) branchOff(child, width * 0.6, delay + (k / n) * 0.5 + 0.15, depth - 1);
    });
  };
  // Stems start along the lower lid and at the outer corner and run down the cheek, leaning
  // slightly outward, with small twig-like forks. Little or nothing climbs above the eye.
  // Mostly from the outer half of the eye: they fan diagonally outward and down the side of the
  // cheek, curving away from the nose (negative bend), and reach about mid-cheek.
  const stems = [
    { x: -0.42, y: 0.28, ang: 1.85, len: 0.38, bend: 0.2 },   // short one by the inner corner
    { x: 0.05, y: 0.4, ang: 1.5, len: 0.5, bend: -0.3 },      // short, under the eye
    { x: 0.3, y: 0.38, ang: 1.25, len: 0.78, bend: -0.45 },
    { x: 0.5, y: 0.24, ang: 0.95, len: 0.88, bend: -0.4 },    // outer corner, down and out
    { x: 0.58, y: 0.06, ang: 0.5, len: 0.72, bend: -0.25 },
    { x: 0.6, y: -0.06, ang: 0.12, len: 0.55, bend: -0.15 },  // out toward the temple
    { x: 0.55, y: -0.2, ang: -0.35, len: 0.32, bend: 0.1 },
  ];
  const trunks = [];
  for (const s of stems) {
    const pts = add(walk(s.x, s.y, s.ang + (rnd() - 0.5) * 0.1, s.len * (0.9 + rnd() * 0.2), s.bend + (rnd() - 0.5) * 0.2, 10), 0.04, 0, 1);
    trunks.push(pts);
    if (s.len > 0.45) branchOff(pts, 0.04, 0.1, 0);
  }
  return veins;
}

/**
 * Tapered ribbon along the first m segments of a vein (m may be fractional while it grows).
 * `tip` is the index where the vein ends; it narrows smoothly to a point there, so a vein that is
 * stopped early by the edge of the face still ends the way a real vein does.
 */
function veinPath(ctx, pts, m, w, ox, oy, tip) {
  const n = Math.min(tip, Math.ceil(m));
  const P = pts.slice(0, n + 1).map(p => [p[0], p[1]]);
  const frac = m - Math.floor(m);
  if (frac > 0 && n === Math.ceil(m) && n > 0) {
    const [x0, y0] = pts[n - 1], [x1, y1] = pts[n];
    P[n] = [x0 + (x1 - x0) * frac, y0 + (y1 - y0) * frac];
  }
  const L = [], R = [];
  for (let i = 0; i < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(P.length - 1, i + 1)];
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const t = i / tip;
    const half = (w * (t >= 1 ? 0 : 0.1 + 0.9 * Math.pow(1 - t, 0.75))) / 2;
    L.push([P[i][0] - dy * half + ox, P[i][1] + dx * half + oy]);
    R.push([P[i][0] + dy * half + ox, P[i][1] - dx * half + oy]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (const p of L) ctx.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
}

function drawVeins(ctx, eye, veins, growth, strength, now, outline) {
  const dx = eye.outer.x - eye.inner.x, dy = eye.outer.y - eye.inner.y;
  const len = Math.hypot(dx, dy) || 1;
  const xa = { x: dx / len, y: dy / len };
  let ya = { x: -xa.y, y: xa.x };
  if (ya.y < 0) ya = { x: -ya.x, y: -ya.y };
  const s = eye.width;
  // Each vein ends at its last point that is still on the face (tested in screen space, before the
  // eye transform is applied), and tapers to a point there.
  for (const v of veins) {
    let k = 0;
    if (outline) {
      while (k < v.pts.length) {
        const [px, py] = v.pts[k];
        const sx = eye.center.x + (xa.x * px + ya.x * py) * s, sy = eye.center.y + (xa.y * px + ya.y * py) * s;
        if (!ctx.isPointInPath(outline, sx, sy)) break;
        k++;
      }
    } else k = v.pts.length;
    v.tip = k - 1;
  }
  ctx.save();
  ctx.transform(xa.x * s, xa.y * s, ya.x * s, ya.y * s, eye.center.x, eye.center.y);
  ctx.globalAlpha = strength;
  // A soft swelling on the skin, the vein body, then a highlight along its top so it reads as raised.
  const passes = [
    { op: 'multiply', rgb: '180,125,132', a: 0.24, w: 2.2, ox: 0, oy: 0 },
    { op: 'multiply', rgb: '110,62,82', a: 0.55, w: 0.9, ox: 0, oy: 0 },
    { op: 'screen', rgb: '255,232,222', a: 0.24, w: 0.35, ox: -0.006, oy: -0.009 },
  ];
  for (const pass of passes) {
    ctx.globalCompositeOperation = pass.op;
    // Strongest beside the eye, dissolving smoothly outward, so the network never shows an edge.
    const fade = ctx.createRadialGradient(0.4, 0.3, 0.3, 0.4, 0.3, 1.25);
    fade.addColorStop(0, `rgba(${pass.rgb},${pass.a})`);
    fade.addColorStop(0.35, `rgba(${pass.rgb},${pass.a})`);
    fade.addColorStop(0.7, `rgba(${pass.rgb},${pass.a * 0.35})`);
    fade.addColorStop(1, `rgba(${pass.rgb},0)`);
    ctx.fillStyle = fade;
    for (const v of veins) {
      if (v.tip < 2) continue;
      const g = clamp((growth - v.delay) / (1 - v.delay));
      if (g <= 0) continue;
      const throb = 1 + 0.12 * Math.sin(now * 0.006 + v.phase);
      ctx.globalAlpha = strength * v.fade;
      veinPath(ctx, v.pts, Math.min(g * (v.pts.length - 1), v.tip), v.width * 1.15 * pass.w * throb, pass.ox, pass.oy, v.tip);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * The face outline from the tracker, pulled 8% toward its centre so veins stop short of the
 * hairline, ears and jaw edge.
 */
function faceOutline(pts) {
  const idx = FACE_IDX.faceOval;
  let cx = 0, cy = 0;
  for (const i of idx) { cx += pts[i].x; cy += pts[i].y; }
  cx /= idx.length; cy /= idx.length;
  const path = new Path2D();
  idx.forEach((i, k) => {
    const x = cx + (pts[i].x - cx) * 0.95, y = cy + (pts[i].y - cy) * 0.95;
    if (k) path.lineTo(x, y); else path.moveTo(x, y);
  });
  path.closePath();
  return path;
}

/** Activation pulse: two soft rings rippling out from the eye as the Byakugan opens. */
function drawAwakenRings(ctx, eye, k) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const lag of [0, 0.22]) {
    const p = clamp((k - lag) / (1 - lag));
    if (p <= 0 || p >= 1) continue;
    ctx.globalAlpha = (1 - p) * 0.55;
    ctx.strokeStyle = 'rgb(232,224,255)';
    ctx.lineWidth = eye.width * 0.05 * (1 - p) + 0.5;
    ctx.beginPath();
    ctx.arc(eye.iris.x, eye.iris.y, eye.width * (0.35 + 1.5 * easeOut(p)), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/* ───────────────────────── Renderer ───────────────────────── */

// Patterns hold still by default and spin up only when activated; the Spin slider adds idle rotation.
const SPIN_FACTOR = { sharingan: 1, mangekyo: 0.55, eternal: 0.55, rinnegan: 0.18, rinne: 0.4, byakugan: 0, tenseigan: 0.35, none: 0 };

function slot(type) { return { type, prev: type, t0: -1e9 }; }

export class DojutsuRenderer {
  constructor() {
    this.state = { left: slot('none'), right: slot('none'), third: slot('none') };
    this.params = { size: 1.0, glow: 0.35, spin: 0, opacity: 0.92 };
    this.spin = 0;
    this.veins = { left: genVeins(11), right: genVeins(29) };
    this.scratch = { left: document.createElement('canvas'), right: document.createElement('canvas') };
  }

  get(slotName) { return this.state[slotName].type; }

  set(slotName, type, now) {
    const s = this.state[slotName];
    if (s.type === type) return false;
    s.prev = s.type;
    s.type = type;
    s.t0 = now;
    return true;
  }

  families() {
    return ['left', 'right', 'third'].map(k => EYES[this.state[k].type].family);
  }

  /** Draws onto a context with an identity transform (the base video layer). */
  render(ctx, face, now, dt) {
    this.spin += dt * this.params.spin * 1.4;
    if (!face) return;
    this.faceClip = face.pts ? faceOutline(face.pts) : null;
    this.renderEye(ctx, face.left, this.state.left, face.roll, now, this.veins.left, 'left');
    this.renderEye(ctx, face.right, this.state.right, face.roll, now, this.veins.right, 'right');
    this.renderThird(ctx, face, this.state.third, now);
  }

  layers(st, now) {
    const k = clamp((now - st.t0) / 520);
    const out = [];
    if (k < 1 && st.prev !== st.type && st.prev !== 'none') out.push({ type: st.prev, a: 1 - k, k: 1 });
    if (st.type !== 'none') out.push({ type: st.type, a: easeOut(k), k });
    return out;
  }

  angleFor(type, k) {
    const fam = EYES[type].family;
    const burst = fam === 'byakugan' ? 0 : (1 - easeOut(k)) * Math.PI * 3;
    return this.spin * (SPIN_FACTOR[fam] ?? 0.5) + burst;
  }

  /** Copy the real eye region before painting so its shading can be laid back on top. */
  grab(src, key, x, y, w, h) {
    const c = this.scratch[key];
    if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.drawImage(src, x, y, w, h, 0, 0, w, h);
    return c;
  }

  renderEye(ctx, eye, st, roll, now, veins, key) {
    const layers = this.layers(st, now);
    if (!layers.length) return;
    const p = this.params;

    // Byakugan: veins push out from the eye on activation (with a ripple), then settle and throb.
    for (const L of layers) {
      if (!EYES[L.type].veins) continue;
      // Veins live on the skin only: each one stops and tapers before the face outline, so none
      // spill onto hair or the background and none look cut off.
      drawVeins(ctx, eye, veins, clamp(L.k * 1.25), Math.min(1, L.a * 1.5) * (0.8 + 0.2 * (1 - L.k)), now, this.faceClip);
      if (L.k < 1 && st.type === L.type) drawAwakenRings(ctx, eye, L.k);
    }

    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const q of eye.poly) {
      if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
    }
    const open = eye.aperture > 0.09;
    if (open) {
      const bx = Math.max(0, Math.floor(minX) - 2), by = Math.max(0, Math.floor(minY) - 2);
      const bw = Math.min(ctx.canvas.width - bx, Math.ceil(maxX - minX) + 5);
      const bh = Math.min(ctx.canvas.height - by, Math.ceil(maxY - minY) + 5);
      const real = bw > 2 && bh > 2 ? this.grab(ctx.canvas, key, bx, by, bw, bh) : null;
      let fullEye = false, rrMax = 0;
      ctx.save();
      ctx.beginPath();
      eye.poly.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.clip();
      for (const L of layers) {
        const def = EYES[L.type];
        const alpha = L.a * p.opacity;
        if (alpha <= 0.01) continue;
        if (def.fullEye) {
          // Tint the eye white while keeping its real shading (multiply) instead of painting it flat.
          fullEye = true;
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = def.sclera;
          ctx.fillRect(bx, by, bw, bh);
          if (def.scleraLift) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = alpha * def.scleraLift;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bx, by, bw, bh);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        const rr = eye.irisR * p.size * (def.scale || 1) * (0.85 + 0.15 * easeOut(L.k));
        rrMax = Math.max(rrMax, rr);
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(eye.iris.x, eye.iris.y);
        ctx.rotate(roll + this.angleFor(L.type, L.k));
        ctx.drawImage(patternCanvas(L.type), -rr, -rr, rr * 2, rr * 2);
        ctx.restore();
      }
      // Lay the real eye back over the overlay: its shadows, wetness and reflections.
      if (real) {
        ctx.save();
        if (!fullEye) { ctx.beginPath(); ctx.arc(eye.iris.x, eye.iris.y, rrMax, 0, TAU); ctx.clip(); }
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(real, 0, 0, bw, bh, bx, by, bw, bh);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.16;
        ctx.drawImage(real, 0, 0, bw, bh, bx, by, bw, bh);
        ctx.restore();
      }
      // Soft shadow cast by the upper lid.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, minY - 2, 0, minY + (maxY - minY) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0.32)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw, bh);
      ctx.restore();
    }

    // Chakra glow: faint and steady, with a brief flare when the eye activates.
    const top = layers[layers.length - 1];
    const def = EYES[top.type];
    if (def.glow && p.glow > 0) {
      const k = clamp((now - st.t0) / 650);
      const burst = 1 - easeOut(k);
      const gr = eye.irisR * (2 + burst * 4) * (0.7 + p.glow * 0.5);
      const a = (0.09 + burst * 0.45) * p.glow * top.a * (open ? 1 : 0.3);
      if (a > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(a);
        ctx.drawImage(glowSprite(def.glow, 64, 0.05), eye.iris.x - gr, eye.iris.y - gr, gr * 2, gr * 2);
        ctx.restore();
      }
    }
  }

  renderThird(ctx, face, st, now) {
    const layers = this.layers(st, now);
    if (!layers.length) return;
    const c = face.thirdEye;
    const L = face.eyeSpan * 0.4;
    const k = clamp((now - st.t0) / 700);
    const openAmt = st.type === 'none' ? 1 - easeOut(k) : easeOut(k);
    const Wd = L * 0.38 * openAmt;
    if (Wd < 0.5) return;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(face.roll);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, -L / 2);
      ctx.quadraticCurveTo(Wd * 1.25, 0, 0, L / 2);
      ctx.quadraticCurveTo(-Wd * 1.25, 0, 0, -L / 2);
      ctx.closePath();
    };
    // A soft socket shadow multiplied into the skin, so it reads as a fold rather than a sticker.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.5;
    const sg = ctx.createRadialGradient(0, 0, Wd * 0.4, 0, 0, L * 0.65);
    sg.addColorStop(0, 'rgba(120,70,60,0.9)');
    sg.addColorStop(1, 'rgba(120,70,60,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-L, -L, L * 2, L * 2);
    ctx.restore();
    path();
    ctx.save();
    ctx.clip();
    for (const Ly of layers) {
      const def = EYES[Ly.type];
      ctx.globalAlpha = Ly.a * this.params.opacity;
      ctx.fillStyle = def.fullEye ? def.sclera : '#ece4d8';
      ctx.fillRect(-Wd * 2, -L, Wd * 4, L * 2);
      const rr = L * 0.32 * (def.fullEye ? 1.25 : 0.8);
      ctx.save();
      ctx.rotate(this.angleFor(Ly.type, Ly.k));
      ctx.drawImage(patternCanvas(Ly.type), -rr, -rr, rr * 2, rr * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(-Wd, 0, Wd, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.38)');
    g.addColorStop(0.35, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(-Wd * 2, -L, Wd * 4, L * 2);
    ctx.restore();
    path();
    ctx.lineWidth = Math.max(1.2, L * 0.035);
    ctx.strokeStyle = 'rgba(40,12,10,0.75)';
    ctx.stroke();
    const def = EYES[layers[layers.length - 1].type];
    if (def.glow && this.params.glow > 0) {
      const burst = 1 - easeOut(k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp((0.08 + burst * 0.4) * this.params.glow);
      const gr = L * (0.8 + burst);
      ctx.drawImage(glowSprite(def.glow, 64, 0.05), -gr, -gr, gr * 2, gr * 2);
    }
    ctx.restore();
  }
}
