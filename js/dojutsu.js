// Dōjutsu (eye technique) pattern generation and the AR eye renderer.
// Every pattern is drawn procedurally into a 256px texture, then mapped onto the tracked iris.

import { EYES } from './config.js';
import { glowSprite, mulberry32, clamp, easeOut } from './particles.js';

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
  const g = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
  g.addColorStop(0, '#ff4a3a');
  g.addColorStop(0.45, '#e0101f');
  g.addColorStop(0.85, '#9a0014');
  g.addColorStop(1, '#5c0009');
  ctx.fillStyle = g;
  disc(ctx, R);
  ctx.fill();
  fibers(ctx, '#3a0005', 0.22, seed);
  fibers(ctx, '#ff8a7a', 0.08, seed + 1, 0.3, 0.8, 50);
  limbal(ctx);
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
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, 'rgba(252,250,255,1)');
  g.addColorStop(0.6, 'rgba(232,226,250,1)');
  g.addColorStop(1, 'rgba(196,186,230,1)');
  ctx.fillStyle = g;
  disc(ctx, R);
  ctx.fill();
  fibers(ctx, '#8f86b8', 0.12, 47, 0.2, 0.98, 90);
  ring(ctx, 0.97, 0.05, 'rgba(150,140,195,0.55)');
  ctx.fillStyle = 'rgba(205,196,236,0.65)';
  disc(ctx, R * 0.16);
  ctx.fill();
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

function genVeins(seed) {
  const rnd = mulberry32(seed);
  const veins = [];
  const starts = [];
  for (let i = 0; i < 6; i++) starts.push(-1.15 + i * 0.46 + (rnd() - 0.5) * 0.2);
  starts.push(-1.75 + rnd() * 0.25, -2.25 + rnd() * 0.25, 1.75 + rnd() * 0.25, 2.35 + rnd() * 0.25, 2.95 + rnd() * 0.2);
  const grow = (x, y, ang, len, width, depth) => {
    const pts = [[x, y]];
    let a = ang;
    const n = 5 + Math.floor(rnd() * 5) - depth;
    for (let i = 0; i < n; i++) {
      a += (rnd() - 0.5) * 0.75;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      pts.push([x, y]);
      if (depth < 2 && rnd() < 0.25) grow(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * 0.8, width * 0.62, depth + 1);
    }
    veins.push({ pts, width });
  };
  for (const ang of starts) grow(Math.cos(ang) * 0.6, Math.sin(ang) * 0.46, ang, 0.075, 0.05, 0);
  return veins;
}

function drawVeins(ctx, eye, veins, growth) {
  const dx = eye.outer.x - eye.inner.x, dy = eye.outer.y - eye.inner.y;
  const len = Math.hypot(dx, dy) || 1;
  const xa = { x: dx / len, y: dy / len };
  let ya = { x: -xa.y, y: xa.x };
  if (ya.y < 0) ya = { x: -ya.x, y: -ya.y };
  const s = eye.width;
  ctx.save();
  ctx.transform(xa.x * s, xa.y * s, ya.x * s, ya.y * s, eye.center.x, eye.center.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = [
    { op: 'multiply', color: 'rgba(150,110,160,0.55)', w: 1.0, off: 0 },
    { op: 'source-over', color: 'rgba(70,40,80,0.28)', w: 0.42, off: 0 },
    { op: 'screen', color: 'rgba(255,255,255,0.14)', w: 0.3, off: -0.012 },
  ];
  for (const pass of passes) {
    ctx.globalCompositeOperation = pass.op;
    ctx.strokeStyle = pass.color;
    for (const v of veins) {
      const n = v.pts.length - 1;
      const m = Math.floor(n * growth);
      for (let i = 0; i < m; i++) {
        ctx.lineWidth = v.width * pass.w * (1 - (i / n) * 0.75);
        ctx.beginPath();
        ctx.moveTo(v.pts[i][0], v.pts[i][1] + pass.off);
        ctx.lineTo(v.pts[i + 1][0], v.pts[i + 1][1] + pass.off);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/* ───────────────────────── Renderer ───────────────────────── */

const SPIN_FACTOR = { sharingan: 1, mangekyo: 0.55, eternal: 0.55, rinnegan: 0.18, rinne: 0.4, byakugan: 0, tenseigan: 0.35, none: 0 };

function slot(type) { return { type, prev: type, t0: -1e9 }; }

export class DojutsuRenderer {
  constructor() {
    this.state = { left: slot('none'), right: slot('none'), third: slot('none') };
    this.params = { size: 1.04, glow: 0.65, spin: 0.6, opacity: 0.93 };
    this.spin = 0;
    this.veins = { left: genVeins(11), right: genVeins(29) };
    this.flash = 0;
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

  render(ctx, face, now, dt) {
    this.spin += dt * this.params.spin * 1.4;
    if (!face) return;
    this.renderEye(ctx, face.left, this.state.left, face.roll, now, this.veins.left);
    this.renderEye(ctx, face.right, this.state.right, face.roll, now, this.veins.right);
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
    const extra = (1 - easeOut(k)) * Math.PI * 3;
    return this.spin * (SPIN_FACTOR[fam] ?? 0.5) + extra;
  }

  renderEye(ctx, eye, st, roll, now, veins) {
    const layers = this.layers(st, now);
    if (!layers.length) return;
    const p = this.params;

    // Byakugan veins sit on the skin, outside the eye opening.
    for (const L of layers) {
      if (EYES[L.type].veins) drawVeins(ctx, eye, veins, clamp(L.k * 1.4) * Math.min(1, L.a * 1.5));
    }

    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const q of eye.poly) {
      if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
    }
    const open = eye.aperture > 0.09;
    if (open) {
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
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = def.sclera;
          ctx.fillRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4);
        }
        const rr = eye.irisR * p.size * (def.scale || 1) * (0.8 + 0.2 * easeOut(L.k));
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(eye.iris.x, eye.iris.y);
        ctx.rotate(roll + this.angleFor(L.type, L.k));
        ctx.drawImage(patternCanvas(L.type), -rr, -rr, rr * 2, rr * 2);
        ctx.restore();
      }
      // Upper-lid shadow and a wet specular highlight keep it looking like a real eye.
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, minY - 2, 0, minY + (maxY - minY) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0.42)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4);
      const r = eye.irisR;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(eye.iris.x - r * 0.38, eye.iris.y - r * 0.36, r * 0.17, r * 0.12, -0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Chakra glow
    const top = layers[layers.length - 1];
    const def = EYES[top.type];
    if (def.glow && p.glow > 0) {
      const k = clamp((now - st.t0) / 520);
      const burst = (1 - k) * 1.8;
      const gr = eye.irisR * (3 + burst * 2.5) * (0.6 + p.glow * 0.6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp((0.22 + burst * 0.4) * p.glow * top.a * (open ? 1 : 0.35));
      ctx.drawImage(glowSprite(def.glow, 64, 0.05), eye.iris.x - gr, eye.iris.y - gr, gr * 2, gr * 2);
      ctx.restore();
    }
  }

  renderThird(ctx, face, st, now) {
    const layers = this.layers(st, now);
    if (!layers.length) return;
    const c = face.thirdEye;
    const L = face.eyeSpan * 0.46;
    const k = clamp((now - st.t0) / 700);
    const openAmt = st.type === 'none' ? 1 - easeOut(k) : easeOut(k);
    const Wd = L * 0.4 * openAmt;
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
    // socket shadow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#2a0e0a';
    ctx.scale(1.25, 1.12);
    path();
    ctx.fill();
    ctx.restore();
    path();
    ctx.save();
    ctx.clip();
    for (const Ly of layers) {
      const def = EYES[Ly.type];
      ctx.globalAlpha = Ly.a * this.params.opacity;
      ctx.fillStyle = def.fullEye ? def.sclera : '#efe7dc';
      ctx.fillRect(-Wd * 2, -L, Wd * 4, L * 2);
      const rr = L * 0.32 * (def.fullEye ? 1.25 : 0.8);
      ctx.save();
      ctx.rotate(this.angleFor(Ly.type, Ly.k));
      ctx.drawImage(patternCanvas(Ly.type), -rr, -rr, rr * 2, rr * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(-Wd, 0, Wd, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.4)');
    g.addColorStop(0.4, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(-Wd * 2, -L, Wd * 4, L * 2);
    ctx.restore();
    path();
    ctx.lineWidth = Math.max(1.5, L * 0.045);
    ctx.strokeStyle = 'rgba(30,6,6,0.9)';
    ctx.stroke();
    const def = EYES[layers[layers.length - 1].type];
    if (def.glow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * this.params.glow;
      const gr = L * 1.1;
      ctx.drawImage(glowSprite(def.glow, 64, 0.05), -gr, -gr, gr * 2, gr * 2);
    }
    ctx.restore();
  }
}
