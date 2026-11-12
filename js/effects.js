// Jutsu & dōjutsu-ability visual effects, plus the FX manager that layers them.

import {
  glowSprite, puffSprite, blackFlameSprite, rockSprite, ParticleSystem,
  rand, clamp, lerp, easeOut, easeIn, easeInOut, mulberry32,
} from './particles.js';
import { patternCanvas } from './dojutsu.js';
import { HAND_CONNECTIONS, FACE_IDX } from './tracking.js';

const TAU = Math.PI * 2;
const pick = arr => arr[(Math.random() * arr.length) | 0];

/* ═════════════════════════ FX manager ═════════════════════════ */

export class FX {
  constructor(sfx) {
    this.sfx = sfx;
    this.ps = new ParticleSystem(3500);
    this.effects = [];
    this.world = { face: null, hands: [], W: 1280, H: 720 };
    this.shakeAmt = 0;
    this.flashes = [];
    this.callouts = [];
    this.hud = [];
    this.snapshot = null;      // canvas copy of the frame (set by main)
    this.person = null;        // { ready, canvas, history(delay) } (set by main)
    this.mask = null;          // { ready, canvas, mirror, edges } (set by main)
    this.auraCanvas = document.createElement('canvas');
    this.spr = {
      fire: [glowSprite('#fff7d0', 64, 0.35), glowSprite('#ffd04a', 64, 0.25), glowSprite('#ff8a1a', 64, 0.18), glowSprite('#e0400e', 64, 0.12), glowSprite('#8a1a06', 64, 0.1)],
      fireSmoke: puffSprite('#2c2420', 96, 3),
      smoke: [puffSprite('#f4f1ea', 128, 1), puffSprite('#e2ddd4', 128, 2), puffSprite('#cfcac0', 128, 3), puffSprite('#ffffff', 128, 4)],
      blue: glowSprite('#3d8bff', 64, 0.1),
      cyan: glowSprite('#9fe6ff', 48, 0.25),
      white: glowSprite('#ffffff', 64, 0.3),
      spark: glowSprite('#e6f6ff', 32, 0.45),
      purple: glowSprite('#b48cff', 64, 0.15),
      violetRim: glowSprite('#8c1450', 48, 0.1),
      black: [blackFlameSprite(96, 1), blackFlameSprite(96, 2), blackFlameSprite(96, 3), blackFlameSprite(96, 4)],
      dust: [puffSprite('#8a735a', 96, 5), puffSprite('#a08868', 96, 6)],
      rocks: [rockSprite(32, 1), rockSprite(32, 2), rockSprite(32, 3), rockSprite(32, 4)],
      water: glowSprite('#7fd3ff', 48, 0.35),
      foam: glowSprite('#effcff', 32, 0.5),
      ember: glowSprite('#ffb347', 32, 0.45),
      chakra: glowSprite('#58b4ff', 48, 0.3),
      moonlight: glowSprite('#f2e8ff', 64, 0.2),
    };
  }

  get W() { return this.world.W; }
  get H() { return this.world.H; }

  add(e) { this.effects.push(e); return e; }
  find(Cls) { return this.effects.find(e => e instanceof Cls && !e.done); }
  has(Cls) { return !!this.find(Cls); }

  clearAll() {
    for (const e of this.effects) e.finish();
    this.effects = [];
    this.ps.clear();
    this.callouts = [];
  }

  update(dt) {
    for (const e of this.effects) if (!e.done) e.update(dt);
    this.effects = this.effects.filter(e => !e.done);
    this.ps.update(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    for (const f of this.flashes) f.a -= dt * f.decay;
    this.flashes = this.flashes.filter(f => f.a > 0);
    for (const c of this.callouts) c.t += dt;
    this.callouts = this.callouts.filter(c => c.t < c.dur);
  }

  needsSeg() { return this.effects.some(e => e.needsSeg); }
  wantsHistory() { return this.effects.some(e => e.wantsHistory); }
  hasBack() { return this.effects.some(e => e.hasBack); }

  modes() {
    const m = {};
    for (const e of this.effects) if (e.mode) m[e.mode] = Math.max(m[e.mode] || 0, e.modeWeight());
    return m;
  }

  drawBack(ctx) { for (const e of this.effects) e.hasBack && e.drawBack(ctx); }
  draw(ctx) { for (const e of this.effects) e.draw(ctx); }
  drawParticles(ctx) { this.ps.draw(ctx); }
  drawTop(ctx) {
    for (const e of this.effects) e.drawTop(ctx);
    for (const h of this.hud) drawChargeRing(ctx, h);
    this.hud.length = 0;
  }

  drawScreen(ctx) {
    const { W, H } = this;
    for (const f of this.flashes) {
      ctx.save();
      ctx.globalCompositeOperation = f.blend;
      ctx.globalAlpha = clamp(f.a);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    for (const c of this.callouts) drawCallout(ctx, c, W, H);
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  flash(color, a = 0.6, decay = 2, blend = 'lighter') { this.flashes.push({ color, a, decay, blend }); }

  callout(data) {
    this.callouts = [];
    this.callouts.push({ ...data, t: 0, dur: data.dur || 2.6, brush: makeBrush(data.seed || Math.random() * 1e5) });
  }

  ring(x, y, r, p, color) { this.hud.push({ x, y, r, p, color }); }

  /** Additive coloured silhouette glow from the segmentation mask. */
  drawAura(ctx, color, scale, blur, alpha, cx) {
    const m = this.mask;
    if (!m || !m.ready) return false;
    const { W, H } = this;
    const aw = Math.round(W / 4), ah = Math.round(H / 4);
    const a = this.auraCanvas;
    if (a.width !== aw || a.height !== ah) { a.width = aw; a.height = ah; }
    const x = a.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, aw, ah);
    x.save();
    x.filter = `blur(${Math.max(1, blur / 4)}px)`;
    if (m.mirror) { x.translate(aw, 0); x.scale(-1, 1); }
    x.drawImage(m.canvas, 0, 0, aw, ah);
    x.restore();
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, aw, ah);
    x.globalCompositeOperation = 'source-over';
    const ax = cx ?? W / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(alpha);
    ctx.drawImage(a, ax - ax * scale, H - H * scale, W * scale, H * scale);
    ctx.restore();
    return true;
  }

  nearestHand(p, maxD = Infinity) {
    let best = null, bd = maxD;
    for (const h of this.world.hands) {
      const d = Math.hypot(h.palm.x - p.x, h.palm.y - p.y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  poof(x, y, scale = 1) {
    const S = this.spr;
    const n = Math.round(34 * this.ps.scale);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(80, 340) * scale;
      this.ps.emit({
        x: x + Math.cos(a) * 20 * scale, y: y + Math.sin(a) * 20 * scale,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, drag: 2.6,
        life: rand(0.6, 1.1), size: rand(70, 130) * scale, size1: rand(180, 280) * scale,
        sprite: pick(S.smoke), blend: 'source-over', alpha: 0.9, rot: rand(0, TAU), vr: rand(-1, 1), fadeIn: 0.02,
      });
    }
    this.sfx.poof();
  }
}

function drawChargeRing(ctx, { x, y, r, p, color }) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, r * 0.08);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p));
  ctx.stroke();
  ctx.restore();
}

/* ───────── Callout banner ───────── */

function makeBrush(seed) {
  const rnd = mulberry32(seed | 0);
  const c = document.createElement('canvas');
  c.width = 1000; c.height = 220;
  const x = c.getContext('2d');
  x.fillStyle = '#0a0808';
  x.beginPath();
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const taper = Math.sin(u * Math.PI) ** 0.35;
    top.push([20 + u * 960, 110 - 78 * taper + (rnd() - 0.5) * 16]);
    bot.push([20 + u * 960, 110 + 70 * taper + (rnd() - 0.5) * 16]);
  }
  x.moveTo(...top[0]);
  top.forEach(p => x.lineTo(...p));
  bot.reverse().forEach(p => x.lineTo(...p));
  x.closePath();
  x.fill();
  // dry-brush streaks
  for (let i = 0; i < 26; i++) {
    x.globalAlpha = 0.25 + rnd() * 0.5;
    x.lineWidth = 1 + rnd() * 5;
    x.strokeStyle = '#0a0808';
    const y = 40 + rnd() * 140;
    x.beginPath();
    x.moveTo(rnd() * 120, y);
    x.bezierCurveTo(300, y + (rnd() - 0.5) * 20, 700, y + (rnd() - 0.5) * 20, 880 + rnd() * 120, y + (rnd() - 0.5) * 30);
    x.stroke();
  }
  // splatter
  x.globalAlpha = 1;
  for (let i = 0; i < 12; i++) {
    x.beginPath();
    x.arc(60 + rnd() * 880, rnd() < 0.5 ? 18 + rnd() * 20 : 185 + rnd() * 20, rnd() * 3 + 1, 0, TAU);
    x.fill();
  }
  return c;
}

function drawCallout(ctx, c, W, H) {
  const kIn = easeOut(c.t / 0.28);
  const kOut = c.t > c.dur - 0.45 ? clamp((c.dur - c.t) / 0.45) : 1;
  const cy = H * 0.19;
  const bw = Math.min(W * 0.64, H * 1.15), bh = bw * 0.24;
  ctx.save();
  ctx.globalAlpha = kOut;
  // brush stroke wipes in from the left
  ctx.save();
  ctx.beginPath();
  ctx.rect(W / 2 - bw / 2, cy - bh, bw * kIn, bh * 2);
  ctx.clip();
  ctx.globalAlpha = 0.86 * kOut;
  ctx.drawImage(c.brush, W / 2 - bw / 2, cy - bh / 2, bw, bh);
  ctx.restore();
  // accent bar in the jutsu colour
  ctx.fillStyle = c.color || '#e0312b';
  ctx.globalAlpha = 0.9 * kOut;
  ctx.fillRect(W / 2 - bw * 0.36, cy + bh * 0.3, bw * 0.72 * kIn, Math.max(2, bh * 0.025));
  // kanji
  const s = 1 + (1 - kIn) * 0.35;
  ctx.globalAlpha = kOut * kIn;
  ctx.translate(W / 2, cy - bh * 0.02);
  ctx.scale(s, s);
  let kSize = Math.round(bh * 0.4);
  ctx.font = `${kSize}px "Yuji Syuku", "Yu Mincho", serif`;
  const tw = ctx.measureText(c.kanji).width;
  if (tw > bw * 0.8) { kSize = Math.floor(kSize * (bw * 0.8) / tw); ctx.font = `${kSize}px "Yuji Syuku", "Yu Mincho", serif`; }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = kSize * 0.12;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(c.kanji, 0, 0);
  ctx.shadowColor = c.color || '#e0312b';
  ctx.shadowBlur = kSize * 0.35;
  ctx.fillStyle = '#fff';
  ctx.fillText(c.kanji, 0, 0);
  ctx.shadowBlur = 0;
  ctx.font = `700 ${Math.round(bh * 0.15)}px "Barlow Condensed", sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(bh * 0.02)}px`;
  ctx.fillStyle = '#f3ead8';
  ctx.fillText(c.title.toUpperCase(), 0, bh * 0.43);
  if (c.sub) {
    ctx.font = `500 ${Math.round(bh * 0.1)}px "Barlow Condensed", sans-serif`;
    ctx.fillStyle = 'rgba(243,234,216,0.75)';
    ctx.fillText(c.sub, 0, bh * 0.6);
  }
  ctx.restore();
}

/* ═════════════════════════ Effect base ═════════════════════════ */

class Effect {
  constructor(fx) {
    this.fx = fx;
    this.t = 0;
    this.done = false;
    this.needsSeg = false;
    this.wantsHistory = false;
    this.hasBack = false;
    this.mode = null;
  }
  get W() { return this.fx.world.W; }
  get H() { return this.fx.world.H; }
  get face() { return this.fx.world.face; }
  get hands() { return this.fx.world.hands; }
  get ps() { return this.fx.ps; }
  get S() { return this.fx.spr; }
  update(dt) { this.t += dt; }
  drawBack() {}
  draw() {}
  drawTop() {}
  modeWeight() { return 0; }
  finish() {
    if (this.done) return;
    this.done = true;
    this.onEnd && this.onEnd();
  }
}

/* ═════════════════════════ Fire ═════════════════════════ */

export class Fireball extends Effect {
  constructor(fx) {
    super(fx);
    this.dur = 3.5;
    this.o = this.mouth();
    fx.sfx.fire(2.9);
  }
  mouth() {
    const f = this.face;
    return f ? { x: f.mouth.x, y: f.mouth.y, s: f.faceW } : { x: this.W / 2, y: this.H * 0.55, s: this.W * 0.18 };
  }
  update(dt) {
    super.update(dt);
    const t = this.t, S = this.S, ps = this.ps;
    const m = this.mouth();
    const o = this.o;
    o.x = lerp(o.x, m.x, 0.35); o.y = lerp(o.y, m.y, 0.35); o.s = lerp(o.s, m.s, 0.2);
    if (t < 0.55) {
      for (let i = ps.count(110, dt); i > 0; i--) {
        ps.emit({ x: o.x + rand(-1, 1) * o.s * 0.07, y: o.y, vx: rand(-40, 40), vy: rand(-150, -40), life: rand(0.25, 0.5), size: o.s * 0.16, size1: o.s * 0.03, sprites: S.fire });
      }
    } else if (t < 2.75) {
      const k = (t - 0.55) / 2.2;
      const R = o.s * (0.35 + 4.4 * Math.pow(k, 1.45));
      const b = this.ball = { x: lerp(o.x, this.W / 2, k * 0.4), y: lerp(o.y, this.H * 0.5, k * 0.4) - k * o.s * 0.25, R };
      const rate = 460 * Math.min(1, 200 / R) + 45;
      for (let i = ps.count(rate, dt); i > 0; i--) {
        const a = rand(0, TAU), r = R * Math.sqrt(Math.random()) * 0.8;
        ps.emit({
          x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r,
          vx: Math.cos(a) * R * rand(0.4, 1.1), vy: Math.sin(a) * R * rand(0.4, 1.1) - R * 0.35,
          drag: 1.6, life: rand(0.35, 0.7), size: R * rand(0.3, 0.5), size1: R * rand(0.55, 0.85), sprites: S.fire, rot: rand(0, TAU), alpha: 0.42,
        });
      }
      for (let i = ps.count(160, dt); i > 0; i--) {
        const u = Math.random();
        ps.emit({ x: lerp(o.x, b.x, u) + rand(-8, 8), y: lerp(o.y, b.y, u), vx: rand(-30, 30), vy: rand(-80, 0), life: 0.25, size: lerp(o.s * 0.2, R * 0.6, u), size1: lerp(o.s * 0.1, R * 0.4, u), sprites: S.fire, alpha: 0.5 });
      }
      if (R > o.s * 0.8) {
        for (let i = ps.count(10, dt); i > 0; i--) {
          ps.emit({ x: b.x + rand(-1, 1) * R * 0.6, y: b.y - R * 0.7, vx: rand(-50, 50), vy: -R * 0.6, life: 1.4, size: R * 0.8, size1: R * 1.5, sprite: S.fireSmoke, blend: 'source-over', alpha: 0.22 });
        }
      }
      this.fx.shake(4 + k * 14);
    } else {
      if (!this.flashed) { this.flashed = true; this.fx.flash('#ff7a1a', 0.6, 1.3); this.ball = null; }
      for (let i = ps.count(70, dt); i > 0; i--) {
        ps.emit({ x: rand(0, this.W), y: rand(0, this.H), vx: rand(-40, 40), vy: rand(-140, -30), life: rand(0.8, 1.6), size: rand(4, 10), sprite: S.ember });
      }
    }
    if (t > this.dur) this.finish();
  }
  draw(ctx) {
    const b = this.ball;
    if (!b) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.R * 1.25);
    g.addColorStop(0, 'rgba(255,240,190,0.85)');
    g.addColorStop(0.3, 'rgba(255,170,50,0.55)');
    g.addColorStop(0.62, 'rgba(240,80,10,0.3)');
    g.addColorStop(1, 'rgba(180,30,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.R * 1.25, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

export class PhoenixFlower extends Effect {
  constructor(fx) {
    super(fx);
    const f = this.face;
    this.o = f ? { x: f.mouth.x, y: f.mouth.y, s: f.faceW } : { x: this.W / 2, y: this.H * 0.55, s: this.W * 0.18 };
    this.balls = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * Math.PI * 1.5 + rand(-0.15, 0.15);
      const sp = rand(280, 520) * (this.W / 1280);
      this.balls.push({ x: this.o.x, y: this.o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, delay: i * 0.07 + rand(0, 0.05), r: this.o.s * 0.06, wob: rand(0, TAU), launched: false });
    }
    this.dur = 2.9;
    fx.sfx.fire(1.8);
  }
  update(dt) {
    super.update(dt);
    const S = this.S, ps = this.ps;
    for (const b of this.balls) {
      if (this.t < b.delay) continue;
      if (!b.launched) { b.launched = true; this.fx.sfx.whoosh(0.4, true); }
      const age = this.t - b.delay;
      b.vy += 60 * dt;
      b.x += (b.vx + Math.sin(age * 6 + b.wob) * 40) * dt;
      b.y += b.vy * dt;
      b.r = this.o.s * (0.06 + age * 0.13);
      for (let i = ps.count(160, dt); i > 0; i--) {
        ps.emit({ x: b.x + rand(-1, 1) * b.r * 0.5, y: b.y + rand(-1, 1) * b.r * 0.5, vx: -b.vx * 0.2 + rand(-30, 30), vy: -b.vy * 0.2 - 40, life: rand(0.25, 0.5), size: b.r * 2.2, size1: b.r * 0.6, sprites: S.fire });
      }
    }
    this.fx.shake(3);
    if (this.t > this.dur) this.finish();
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.balls) {
      if (!b.launched) continue;
      const r = b.r * 2.6;
      ctx.drawImage(this.S.fire[0], b.x - r, b.y - r, r * 2, r * 2);
      ctx.drawImage(this.S.fire[2], b.x - r * 1.6, b.y - r * 1.6, r * 3.2, r * 3.2);
    }
    ctx.restore();
  }
}

/* ═════════════════════════ Lightning ═════════════════════════ */

function makeBolt(x, y, ang, len, w, jag = 0.32) {
  let pts = [[x, y], [x + Math.cos(ang) * len, y + Math.sin(ang) * len]];
  let disp = len * jag;
  for (let it = 0; it < 5; it++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      const o = (Math.random() - 0.5) * disp;
      next.push([mx - (dy / l) * o, my + (dx / l) * o], pts[i + 1]);
    }
    pts = next;
    disp *= 0.55;
  }
  return { pts, w };
}

function strokeBolt(ctx, b, scale) {
  ctx.beginPath();
  b.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.lineWidth = b.w * 5 * scale; ctx.strokeStyle = 'rgba(50,120,255,0.22)'; ctx.stroke();
  ctx.lineWidth = b.w * 2 * scale; ctx.strokeStyle = 'rgba(140,205,255,0.75)'; ctx.stroke();
  ctx.lineWidth = b.w * 0.75 * scale; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
}

export class Chidori extends Effect {
  constructor(fx) {
    super(fx);
    const h = this.pickHand();
    this.a = h ? { ...h.palm } : { x: this.W * 0.5, y: this.H * 0.7 };
    this.size = h ? h.size : this.W * 0.06;
    this.anchored = !!h; // cast by button/voice with no hand: stay put until a hand shows up
    this.dur = 11;
    this.lost = 0;
    this.bolts = [];
    this.stopSnd = fx.sfx.chidoriLoop();
    this.onEnd = () => this.stopSnd();
    fx.flash('#bfe4ff', 0.45, 3);
  }
  pickHand() {
    const hs = this.hands;
    if (!hs.length) return null;
    return hs.reduce((a, b) => (b.palm.y > a.palm.y ? b : a));
  }
  update(dt) {
    super.update(dt);
    const h = this.fx.nearestHand(this.a, this.anchored ? this.size * 6 : Infinity);
    if (h) {
      this.anchored = true;
      this.a.x = lerp(this.a.x, h.palm.x, 0.6);
      this.a.y = lerp(this.a.y, h.palm.y, 0.6);
      this.size = lerp(this.size, h.size, 0.2);
      this.lost = 0;
    } else if (this.anchored) this.lost += dt;
    if (this.lost > 2.2 || this.t > this.dur) { this.finish(); return; }
    const s = this.size;
    this.bolts = [];
    const n = 7 + ((Math.random() * 6) | 0);
    for (let i = 0; i < n; i++) {
      const long = Math.random() < 0.08;
      const len = long ? rand(this.W * 0.25, this.W * 0.5) : s * rand(0.7, 2.4);
      const b = makeBolt(this.a.x, this.a.y, rand(0, TAU), len, rand(1.2, 2.4));
      this.bolts.push(b);
      if (Math.random() < 0.35) {
        const p = b.pts[(b.pts.length * rand(0.3, 0.7)) | 0];
        this.bolts.push(makeBolt(p[0], p[1], rand(0, TAU), len * 0.4, b.w * 0.6));
      }
    }
    const S = this.S, ps = this.ps;
    for (let i = ps.count(170, dt); i > 0; i--) {
      const a = rand(0, TAU), sp = rand(150, 520) * (s / 80);
      ps.emit({ x: this.a.x, y: this.a.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 500, life: rand(0.12, 0.35), size: rand(3, 8), sprite: S.spark });
    }
    if (Math.random() < dt * 3) this.fx.shake(3);
  }
  draw(ctx) {
    const fade = this.t > this.dur - 0.6 ? (this.dur - this.t) / 0.6 : Math.min(1, this.t / 0.2);
    const s = this.size, S = this.S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade;
    const gr = s * 2.6 * rand(0.85, 1.15);
    ctx.drawImage(S.blue, this.a.x - gr, this.a.y - gr, gr * 2, gr * 2);
    const cr = s * 0.8 * rand(0.8, 1.1);
    ctx.drawImage(S.white, this.a.x - cr, this.a.y - cr, cr * 2, cr * 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const b of this.bolts) strokeBolt(ctx, b, s / 80);
    ctx.restore();
  }
}

/* ═════════════════════════ Rasengan ═════════════════════════ */

export class Rasengan extends Effect {
  constructor(fx, hand, startShuriken = false) {
    super(fx);
    this.a = hand ? this.handPoint(hand) : { x: this.W * 0.5, y: this.H * 0.65 };
    this.size = hand ? hand.size : this.W * 0.07;
    this.anchored = !!hand;
    this.R = 0;
    this.mode = null;
    this.shuriken = false;
    this.ending = false;
    this.lost = 0; this.fist = 0; this.raised = 0;
    this.orbits = Array.from({ length: 26 }, () => ({ tilt: rand(0, Math.PI), phi: rand(0, TAU), sp: rand(5, 11) * (Math.random() < 0.5 ? 1 : -1), r: rand(0.55, 1.05), th: rand(0, TAU), w: rand(1, 2.6) }));
    this.snd = fx.sfx.rasenganLoop();
    this.onEnd = () => this.snd.stop();
    if (startShuriken) this.evolve();
  }
  handPoint(h) { return { x: h.palm.x + (h.pts[9].x - h.pts[0].x) * 0.25, y: h.palm.y + (h.pts[9].y - h.pts[0].y) * 0.25 }; }
  evolve() {
    if (this.shuriken) return;
    this.shuriken = true;
    this.snd.shuriken();
    this.fx.sfx.whoosh(0.8, true);
    this.fx.flash('#d8f0ff', 0.4, 2.5);
    this.fx.callout({ kanji: '風遁・螺旋手裏剣', title: 'Wind Style: Rasenshuriken', color: '#9fe6ff' });
  }
  release() { this.ending = true; }
  update(dt) {
    super.update(dt);
    const h = this.fx.nearestHand(this.a, this.anchored ? this.size * 5 : Infinity);
    if (h) {
      this.anchored = true;
      const p = this.handPoint(h);
      this.a.x = lerp(this.a.x, p.x, 0.55);
      this.a.y = lerp(this.a.y, p.y, 0.55);
      this.size = lerp(this.size, h.size, 0.15);
      this.lost = 0;
      this.fist = h.shape === 'F' ? this.fist + dt : 0;
      const f = this.face;
      if (f && this.a.y < f.top.y - f.faceH * 0.05) this.raised += dt;
      else this.raised = Math.max(0, this.raised - dt);
    } else if (this.anchored) this.lost += dt;
    if (this.lost > 1.6 || this.fist > 0.5 || this.t > (this.anchored ? 30 : 12)) this.ending = true;
    if (!this.shuriken && this.raised > 0.4 && !this.ending) this.evolve();
    const target = this.ending ? 0 : this.size * (this.shuriken ? 0.95 : 0.85);
    this.R = lerp(this.R, target, Math.min(1, dt * (this.ending ? 9 : 4)));
    if (this.ending && this.R < 2) { this.finish(); return; }
    const spd = this.shuriken ? 2.2 : 1;
    for (const o of this.orbits) o.th += o.sp * dt * spd;
    const S = this.S, ps = this.ps, R = this.R;
    for (let i = ps.count(this.shuriken ? 140 : 70, dt); i > 0; i--) {
      const a = rand(0, TAU), r = R * rand(1.4, 2.2);
      const x = this.a.x + Math.cos(a) * r, y = this.a.y + Math.sin(a) * r;
      const tx = -Math.sin(a), ty = Math.cos(a);
      const out = this.shuriken ? 1 : -1;
      ps.emit({ x, y, vx: tx * R * 4 + Math.cos(a) * R * 1.5 * out, vy: ty * R * 4 + Math.sin(a) * R * 1.5 * out, life: 0.3, size: rand(4, 9) * (R / 60), sprite: this.shuriken ? S.white : S.cyan, alpha: 0.8 });
    }
  }
  draw(ctx) {
    const R = this.R;
    if (R < 1) return;
    const { x, y } = this.a, S = this.S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g1 = R * (this.shuriken ? 3.6 : 2.8);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(S.blue, x - g1, y - g1, g1 * 2, g1 * 2);
    ctx.globalAlpha = 1;
    if (this.shuriken) this.drawBlades(ctx, x, y, R);
    const body = ctx.createRadialGradient(x, y, 0, x, y, R * 1.05);
    body.addColorStop(0, 'rgba(225,245,255,0.9)');
    body.addColorStop(0.35, 'rgba(120,195,255,0.5)');
    body.addColorStop(0.85, 'rgba(40,120,255,0.38)');
    body.addColorStop(0.97, 'rgba(160,215,255,0.5)');
    body.addColorStop(1, 'rgba(40,110,255,0)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, R * 1.05, 0, TAU);
    ctx.fill();
    ctx.lineCap = 'round';
    for (const o of this.orbits) {
      ctx.beginPath();
      ctx.ellipse(x, y, R * o.r, R * o.r * Math.abs(Math.cos(o.tilt)) + 0.5, o.phi, o.th, o.th + 1.5 * Math.sign(o.sp), o.sp < 0);
      ctx.lineWidth = o.w * (R / 55);
      ctx.strokeStyle = 'rgba(200,235,255,0.7)';
      ctx.stroke();
    }
    const c = R * 0.95;
    ctx.drawImage(S.white, x - c, y - c, c * 2, c * 2);
    ctx.restore();
  }
  drawBlades(ctx, x, y, R) {
    const base = this.t * 16;
    const P = (r, a) => [x + Math.cos(a) * r, y + Math.sin(a) * r];
    for (let ghost = 0; ghost < 4; ghost++) {
      const a0 = base - ghost * 0.16;
      ctx.fillStyle = `rgba(220,242,255,${0.42 - ghost * 0.09})`;
      for (let b = 0; b < 4; b++) {
        const a = a0 + (b * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(...P(R * 0.9, a));
        ctx.quadraticCurveTo(...P(R * 2.7, a - 0.18), ...P(R * 3.6, a + 0.55));
        ctx.quadraticCurveTo(...P(R * 2.1, a + 0.32), ...P(R * 0.9, a + 0.5));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.lineWidth = R * 0.07;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, R * 2.3, 0, TAU);
    ctx.stroke();
  }
}

/* ═════════════════════════ Shadow clones ═════════════════════════ */

export class ShadowClones extends Effect {
  constructor(fx) {
    super(fx);
    this.needsSeg = true;
    this.wantsHistory = true;
    this.hasBack = true;
    this.dur = 24;
    this.clones = [
      { dx: -0.27, s: 0.86, delay: 3, at: 0.05 },
      { dx: 0.27, s: 0.86, delay: 6, at: 0.17 },
      { dx: -0.5, s: 0.72, delay: 9, at: 0.29 },
      { dx: 0.5, s: 0.72, delay: 12, at: 0.41 },
    ];
    this.ending = false;
  }
  cx() { return this.face ? this.face.nose.x : this.W / 2; }
  cloneCenter(c) {
    const cx = this.cx();
    const cy = this.face ? this.face.nose.y : this.H * 0.45;
    return { x: cx + c.dx * this.W, y: this.H - (this.H - cy) * c.s };
  }
  dispel() {
    if (this.ending) return;
    this.ending = true;
    this.endT = this.t;
    for (const c of this.clones) if (c.shown) { const p = this.cloneCenter(c); this.fx.poof(p.x, p.y, this.W / 1280); c.shown = false; }
  }
  update(dt) {
    super.update(dt);
    if (!this.ending) {
      for (const c of this.clones) {
        if (!c.shown && this.t >= c.at) {
          c.shown = true;
          const p = this.cloneCenter(c);
          this.fx.poof(p.x, p.y, (this.W / 1280) * c.s);
        }
      }
      if (this.t > this.dur) this.dispel();
    } else if (this.t - this.endT > 0.3) this.finish();
  }
  drawBack(ctx) {
    const person = this.fx.person;
    if (!person || !person.ready) return;
    const cx = this.cx(), W = this.W, H = this.H;
    const list = this.clones.filter(c => c.shown && this.t > c.at + 0.06).sort((a, b) => a.s - b.s);
    for (const c of list) {
      const img = person.history(c.delay);
      if (!img) continue;
      ctx.drawImage(img, cx + c.dx * W - cx * c.s, H - H * c.s, W * c.s, H * c.s);
    }
  }
}

/* ═════════════════════════ Summoning ═════════════════════════ */

export class Summoning extends Effect {
  constructor(fx) {
    super(fx);
    this.dur = 6.8;
    this.hasBack = true;
    this.seed = (Math.random() * 1e6) | 0;
    this.burst = false;
    fx.sfx.whoosh(0.6, false);
  }
  get cx() { return this.face ? this.face.nose.x : this.W / 2; }
  update(dt) {
    super.update(dt);
    const t = this.t, W = this.W, H = this.H, ps = this.ps, S = this.S;
    const gy = H * 0.94, rx = W * 0.36;
    if (t > 0.7 && !this.burst) {
      this.burst = true;
      this.fx.shake(28);
      this.fx.sfx.boom(1.3);
      this.fx.sfx.poof();
      this.fx.flash('#ffffff', 0.4, 1.8);
      for (let i = 0; i < 90 * ps.scale; i++) {
        const a = rand(Math.PI, TAU);
        ps.emit({ x: this.cx + rand(-1, 1) * rx * 0.6, y: gy, vx: Math.cos(a) * rand(100, 500), vy: Math.sin(a) * rand(200, 700), drag: 1.4, life: rand(2, 3.2), size: H * 0.18, size1: H * rand(0.5, 0.75), sprite: pick(S.smoke), blend: 'source-over', alpha: 0.95, rot: rand(0, TAU), vr: rand(-0.6, 0.6), fadeIn: 0.02 });
      }
    }
    if (t > 0.7 && t < 3.6) {
      for (let i = ps.count(70, dt); i > 0; i--) {
        ps.emit({ x: this.cx + rand(-1, 1) * rx, y: gy - rand(0, H * 0.1), vx: rand(-60, 60), vy: rand(-280, -90), drag: 0.6, life: rand(2, 3), size: H * 0.22, size1: H * rand(0.5, 0.7), sprite: pick(S.smoke), blend: 'source-over', alpha: 0.85, rot: rand(0, TAU), vr: rand(-0.5, 0.5) });
      }
    }
    if (t > this.dur) this.finish();
  }
  drawBack(ctx) { this.drawSealCircle(ctx); }
  drawSealCircle(ctx) {
    const W = this.W, H = this.H;
    const prog = easeOut(this.t / 0.6);
    const fade = this.t > this.dur - 1.2 ? clamp((this.dur - this.t) / 1.2) : 1;
    const gy = H * 0.94, rx = W * 0.34, ry = H * 0.075;
    const rnd = mulberry32(this.seed);
    ctx.save();
    ctx.globalAlpha = 0.85 * fade;
    ctx.translate(this.cx, gy);
    ctx.scale(1, ry / rx);
    ctx.strokeStyle = '#0b0808';
    ctx.fillStyle = '#0b0808';
    ctx.lineWidth = rx * 0.018;
    ctx.beginPath(); ctx.arc(0, 0, rx, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
    ctx.lineWidth = rx * 0.01;
    ctx.beginPath(); ctx.arc(0, 0, rx * 0.82, Math.PI / 2, Math.PI / 2 + TAU * prog); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, rx * 0.12, 0, TAU * prog); ctx.stroke();
    const n = 28;
    for (let i = 0; i < n; i++) {
      const L = rnd();
      if (i / n > prog) break;
      const a = (i / n) * TAU;
      const r1 = rx * (1.05 + L * 0.5);
      ctx.lineWidth = rx * 0.012;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rx * 0.82, Math.sin(a) * rx * 0.82);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const rr = rx * (1.1 + k * 0.12 + L * 0.2);
        if (rr > r1 + rx * 0.1) break;
        ctx.save();
        ctx.translate(Math.cos(a + 0.05) * rr, Math.sin(a + 0.05) * rr);
        ctx.rotate(a);
        ctx.fillRect(-rx * 0.012, -rx * 0.03, rx * 0.04 * (0.5 + rnd()), rx * 0.03);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  drawTop(ctx) {
    const t = this.t;
    if (t < 1.3 || t > 5.6) return;
    const a = clamp((t - 1.3) / 0.6) * clamp((5.6 - t) / 0.7);
    const W = this.W, H = this.H;
    const blink = t > 3.4 && t < 3.6 ? 0.12 : 1;
    const ex = W * 0.15, ey = H * 0.36, er = Math.min(W, H) * 0.075;
    ctx.save();
    for (const sx of [-1, 1]) {
      const x = this.cx + sx * ex;
      ctx.save();
      ctx.translate(x, ey);
      ctx.rotate(sx * 0.18);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * a;
      ctx.drawImage(this.S.ember, -er * 3, -er * 3, er * 6, er * 6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      ctx.scale(1, blink);
      ctx.beginPath();
      ctx.moveTo(-er * 1.3, 0);
      ctx.quadraticCurveTo(0, -er * 1.1, er * 1.3, 0);
      ctx.quadraticCurveTo(0, er * 1.1, -er * 1.3, 0);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, er * 1.3);
      g.addColorStop(0, '#fff6b0');
      g.addColorStop(0.6, '#ffc21f');
      g.addColorStop(1, '#c46a00');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = '#120a02';
      ctx.beginPath();
      ctx.ellipse(0, 0, er * 0.16, er * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ═════════════════════════ Earth wall ═════════════════════════ */

let rockTexture = null;
function getRockTexture() {
  if (rockTexture) return rockTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const rnd = mulberry32(99);
  x.fillStyle = '#6d5b49';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const cx = rnd() * 256, cy = rnd() * 256, r = 10 + rnd() * 40;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const light = rnd() < 0.5;
    g.addColorStop(0, light ? 'rgba(170,150,125,0.35)' : 'rgba(30,22,16,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  for (let i = 0; i < 5000; i++) {
    const v = (rnd() * 120 + 40) | 0;
    x.fillStyle = `rgba(${v},${(v * 0.88) | 0},${(v * 0.74) | 0},${0.12 + rnd() * 0.2})`;
    x.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
  }
  x.strokeStyle = 'rgba(25,18,12,0.45)';
  for (let i = 0; i < 7; i++) {
    x.lineWidth = 1 + rnd() * 2;
    let y = rnd() * 256;
    x.beginPath();
    x.moveTo(0, y);
    for (let px = 0; px <= 256; px += 16) { y += (rnd() - 0.5) * 8; x.lineTo(px, y); }
    x.stroke();
  }
  rockTexture = c;
  return c;
}

export class EarthWall extends Effect {
  constructor(fx) {
    super(fx);
    this.dur = 7.6;
    const W = this.W, H = this.H;
    const n = 9;
    const rnd = mulberry32((Math.random() * 1e6) | 0);
    this.slabs = [];
    for (let i = 0; i < n; i++) {
      const w = (W * 1.12) / n * (1.15 + rnd() * 0.2);
      const x = -W * 0.06 + (i * W * 1.12) / n - w * 0.08;
      const h = H * (0.34 + rnd() * 0.18);
      const top = [];
      const steps = 6;
      for (let s = 0; s <= steps; s++) top.push([(s / steps) * w, (s === 0 || s === steps ? rnd() * 0.12 : rnd() * 0.18) * h]);
      const cracks = [];
      for (let k = 0; k < 3; k++) {
        const pts = [[rnd() * w, h * (0.2 + rnd() * 0.3)]];
        for (let s = 0; s < 4; s++) pts.push([pts[pts.length - 1][0] + (rnd() - 0.5) * w * 0.3, pts[pts.length - 1][1] + h * 0.12]);
        cracks.push(pts);
      }
      this.slabs.push({ x, w, h, top, cracks, delay: rnd() * 0.25, fallV: 0, fallY: 0, rot: 0, vr: (rnd() - 0.5) * 0.6, dusted: false });
    }
    this.pattern = null;
    fx.sfx.rumble(1.6);
    fx.shake(20);
  }
  update(dt) {
    super.update(dt);
    const H = this.H, ps = this.ps, S = this.S;
    const crumble = this.t > this.dur - 1.5;
    for (const s of this.slabs) {
      const p = easeOut((this.t - s.delay) / 0.55);
      s.rise = p;
      if (p > 0 && p < 1) {
        for (let i = ps.count(40, dt); i > 0; i--) {
          ps.emit({ x: s.x + rand(0, s.w), y: H - rand(0, 20), vx: rand(-80, 80), vy: rand(-220, -60), drag: 1.2, life: rand(0.8, 1.4), size: rand(40, 90), size1: rand(120, 200), sprite: pick(S.dust), blend: 'source-over', alpha: 0.6 });
        }
      }
      if (crumble) {
        if (!s.dusted) {
          s.dusted = true;
          for (let i = 0; i < 14 * ps.scale; i++) {
            ps.emit({ x: s.x + rand(0, s.w), y: H - s.h * rand(0.3, 1), vx: rand(-120, 120), vy: rand(-200, 50), ay: 1600, life: rand(0.7, 1.2), size: rand(10, 30), sprite: pick(S.rocks), blend: 'source-over', rot: rand(0, TAU), vr: rand(-6, 6), fadeIn: 0 });
          }
          if (this.slabs[0] === s) { this.fx.sfx.rumble(1); this.fx.shake(10); }
        }
        s.fallV += 1700 * dt * (0.6 + s.delay);
        s.fallY += s.fallV * dt;
        s.rot += s.vr * dt;
      }
    }
    if (this.t > this.dur) this.finish();
  }
  draw(ctx) {
    const H = this.H;
    if (!this.pattern) this.pattern = ctx.createPattern(getRockTexture(), 'repeat');
    const fade = clamp((this.dur - this.t) / 0.5);
    ctx.save();
    ctx.globalAlpha = fade;
    for (const s of this.slabs) {
      if (!s.rise) continue;
      const y0 = H - s.h * s.rise + s.fallY;
      ctx.save();
      ctx.translate(s.x + s.w / 2, y0 + s.h / 2);
      ctx.rotate(s.rot);
      ctx.translate(-s.w / 2, -s.h / 2);
      ctx.beginPath();
      ctx.moveTo(0, s.h + 40);
      s.top.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(s.w, s.h + 40);
      ctx.closePath();
      ctx.fillStyle = this.pattern;
      ctx.fill();
      const g = ctx.createLinearGradient(0, 0, s.w, s.h);
      g.addColorStop(0, 'rgba(255,235,205,0.18)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(28,20,14,0.85)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(20,14,10,0.6)';
      for (const c of s.cracks) {
        ctx.beginPath();
        c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ═════════════════════════ Water dragon ═════════════════════════ */

function catmull(pts, t) {
  const n = pts.length - 1;
  const f = clamp(t) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u * u + (-a + 3 * b - 3 * c2 + d) * u * u * u);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}

export class WaterDragon extends Effect {
  constructor(fx) {
    super(fx);
    this.dur = 5.4;
    this.path = [[-0.15, 1.2], [0.08, 0.55], [0.22, 0.12], [0.5, 0.02], [0.8, 0.14], [0.93, 0.5], [0.7, 0.72], [0.5, 0.52]];
    this.trail = [];
    this.splashed = false;
    fx.sfx.water(4);
  }
  update(dt) {
    super.update(dt);
    const W = this.W, H = this.H, ps = this.ps, S = this.S;
    const s = clamp(this.t / 3.7);
    const [nx, ny] = catmull(this.path, s);
    const z = 1 + Math.pow(clamp((s - 0.78) / 0.22), 2) * 6;
    this.head = { x: nx * W, y: ny * H, z };
    if (!this.splashed) {
      this.trail.push({ ...this.head });
      if (this.trail.length > 70) this.trail.shift();
    } else if (this.trail.length) this.trail.splice(0, 3);
    if (s >= 1 && !this.splashed) {
      this.splashed = true;
      this.fx.sfx.splash();
      this.fx.flash('#c8eeff', 0.7, 1.6);
      this.fx.shake(24);
      for (let i = 0; i < 260 * ps.scale; i++) {
        const a = rand(0, TAU), sp = rand(300, 1600);
        ps.emit({ x: W / 2, y: H / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 900, drag: 0.8, life: rand(0.6, 1.4), size: rand(10, 40), sprite: Math.random() < 0.3 ? S.foam : S.water, alpha: 0.75 });
      }
    }
    if (!this.splashed && this.trail.length > 4) {
      for (let i = ps.count(240, dt); i > 0; i--) {
        const p = this.trail[(Math.random() * this.trail.length) | 0];
        ps.emit({ x: p.x + rand(-20, 20) * p.z, y: p.y + rand(-20, 20) * p.z, vx: rand(-90, 90), vy: rand(-80, 40), ay: 800, life: rand(0.5, 1.0), size: rand(5, 14) * p.z, sprite: Math.random() < 0.4 ? S.foam : S.water, alpha: 0.65 });
      }
    }
    if (this.t > this.dur) this.finish();
  }
  draw(ctx) {
    const tr = this.trail;
    if (tr.length < 3) return;
    const base = this.W * 0.034;
    ctx.save();
    for (let i = 0; i < tr.length; i++) {
      const p = tr[i];
      const r = base * p.z * (0.3 + 0.7 * (i / tr.length));
      const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
      g.addColorStop(0, 'rgba(225,248,255,0.95)');
      g.addColorStop(0.45, 'rgba(70,170,240,0.85)');
      g.addColorStop(1, 'rgba(10,70,170,0.75)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(220,250,255,0.35)';
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      ctx.lineWidth = base * b.z * 0.18 * (i / tr.length);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - base * a.z * 0.35);
      ctx.lineTo(b.x, b.y - base * b.z * 0.35);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (!this.splashed) this.drawHead(ctx, tr[tr.length - 1], tr[Math.max(0, tr.length - 4)], base);
    ctx.restore();
  }
  drawHead(ctx, h, prev, base) {
    const ang = Math.atan2(h.y - prev.y, h.x - prev.x);
    const r = base * h.z * 1.5;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(ang);
    const open = 0.35 + 0.2 * Math.sin(this.t * 9);
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, 'rgba(200,240,255,0.95)');
    g.addColorStop(1, 'rgba(20,100,200,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath(); // upper jaw
    ctx.moveTo(-r * 0.6, -r * 0.1);
    ctx.quadraticCurveTo(r * 0.4, -r * 0.9, r * 1.6, -r * open);
    ctx.lineTo(r * 0.2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // lower jaw
    ctx.moveTo(-r * 0.5, r * 0.1);
    ctx.quadraticCurveTo(r * 0.4, r * 0.7, r * 1.4, r * open);
    ctx.lineTo(r * 0.2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // skull
    ctx.ellipse(-r * 0.2, 0, r * 0.75, r * 0.6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,250,255,0.8)'; // horns
    ctx.lineWidth = r * 0.08;
    ctx.lineCap = 'round';
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, sy * r * 0.4);
      ctx.quadraticCurveTo(-r * 1.1, sy * r * 0.9, -r * 1.7, sy * r * 0.6);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const sy of [-1, 1]) {
      const ex = r * 0.25, ey = sy * r * 0.32, er = r * 0.35;
      ctx.drawImage(this.S.ember, ex - er, ey - er, er * 2, er * 2);
      ctx.drawImage(this.S.white, ex - er * 0.4, ey - er * 0.4, er * 0.8, er * 0.8);
    }
    ctx.restore();
  }
}

/* ═════════════════════════ Genjutsu: Tsukuyomi ═════════════════════════ */

function moonCanvas(kind) {
  const key = `moon-${kind}`;
  moonCanvas.cache ||= {};
  if (moonCanvas.cache[key]) return moonCanvas.cache[key];
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const rnd = mulberry32(kind === 'red' ? 5 : 9);
  x.translate(256, 256);
  const g = x.createRadialGradient(-60, -60, 20, 0, 0, 250);
  if (kind === 'red') { g.addColorStop(0, '#ff5a3a'); g.addColorStop(0.6, '#c8101a'); g.addColorStop(1, '#5a0006'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.65, '#e9e0ff'); g.addColorStop(1, '#a796d8'); }
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, 250, 0, TAU);
  x.fill();
  x.save();
  x.clip();
  for (let i = 0; i < 26; i++) {
    const cx = (rnd() - 0.5) * 440, cy = (rnd() - 0.5) * 440, r = 10 + rnd() * 50;
    const cg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    cg.addColorStop(0, kind === 'red' ? 'rgba(60,0,0,0.4)' : 'rgba(120,100,170,0.25)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = cg;
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
  }
  x.restore();
  moonCanvas.cache[key] = c;
  return c;
}

export class Tsukuyomi extends Effect {
  constructor(fx, eyeType, origin) {
    super(fx);
    this.dur = 7.8;
    this.eyeType = eyeType;
    this.origin = origin || { x: this.W / 2, y: this.H / 2 };
    this.mode = 'tsukuyomi';
    this.hasBack = true;
    this.crows = Array.from({ length: 11 }, (_, i) => ({ x: rand(-0.3, 1.1), y: rand(0.08, 0.6), sp: rand(0.06, 0.16) * (Math.random() < 0.5 ? 1 : -1), s: rand(0.6, 1.4), ph: rand(0, TAU), delay: 1 + i * 0.25 }));
    this.feathers = Array.from({ length: 26 }, () => ({ x: rand(0, 1), y: rand(-0.4, 0), vy: rand(0.04, 0.09), rot: rand(0, TAU), vr: rand(-2, 2), s: rand(0.6, 1.2) }));
    fx.sfx.drone(7.5);
    fx.sfx.activate();
  }
  modeWeight() {
    return clamp((this.t - 0.55) / 0.4) * clamp((this.dur - this.t) / 0.8);
  }
  update(dt) {
    super.update(dt);
    for (const f of this.feathers) { f.y += f.vy * dt; f.rot += f.vr * dt; f.x += Math.sin(this.t * 2 + f.rot) * 0.01 * dt; }
    if (this.t > this.dur) this.finish();
  }
  drawBack(ctx) {
    const k = this.modeWeight();
    if (k <= 0) return;
    const W = this.W, H = this.H;
    const r = H * 0.21, x = W * 0.8, y = H * 0.25;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite('#ff2010', 64, 0.05), x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(moonCanvas('red'), x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  draw(ctx) {
    const k = this.modeWeight();
    if (k <= 0) return;
    const W = this.W, H = this.H;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = '#050000';
    for (const c of this.crows) {
      if (this.t < c.delay) continue;
      const x = ((c.x + c.sp * (this.t - c.delay)) % 1.4 + 1.4) % 1.4 - 0.2;
      const s = c.s * W * 0.022;
      const flap = Math.sin(this.t * 11 + c.ph);
      ctx.save();
      ctx.translate(x * W, c.y * H + Math.sin(this.t * 2 + c.ph) * 10);
      if (c.sp < 0) ctx.scale(-1, 1);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 1.1, s * 0.35, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, 0);
      ctx.quadraticCurveTo(-s * 0.6, -s * 1.6 * flap - s * 0.3, -s * 1.6, -s * 1.2 * flap);
      ctx.quadraticCurveTo(-s * 0.4, -s * 0.2, s * 0.4, 0);
      ctx.moveTo(s * 0.2, 0);
      ctx.quadraticCurveTo(s * 0.1, -s * 1.5 * flap - s * 0.3, s * 1.0, -s * 1.3 * flap);
      ctx.quadraticCurveTo(s * 0.4, -s * 0.2, s * 0.6, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 1.0, -s * 0.1);
      ctx.lineTo(s * 1.5, 0);
      ctx.lineTo(s * 1.0, s * 0.12);
      ctx.fill();
      ctx.restore();
    }
    for (const f of this.feathers) {
      ctx.save();
      ctx.translate(f.x * W, f.y * H);
      ctx.rotate(f.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, W * 0.004 * f.s, W * 0.014 * f.s, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  drawTop(ctx) {
    // Opening: the user's Mangekyō pattern expands from the eye to swallow the screen.
    const t = this.t;
    if (t > 1.1) return;
    const k = easeIn(t / 0.95);
    const W = this.W, H = this.H;
    const maxR = Math.hypot(W, H) * 1.1;
    const r = lerp(12, maxR, k);
    ctx.save();
    ctx.globalAlpha = t < 0.95 ? 1 : clamp((1.1 - t) / 0.15);
    ctx.translate(lerp(this.origin.x, W / 2, k), lerp(this.origin.y, H / 2, k));
    ctx.rotate(t * 9);
    ctx.drawImage(patternCanvas(this.eyeType), -r, -r, r * 2, r * 2);
    ctx.restore();
  }
}

export class InfiniteTsukuyomi extends Effect {
  constructor(fx) {
    super(fx);
    this.dur = 9.5;
    this.mode = 'infinite';
    this.hasBack = true;
    fx.sfx.drone(9);
    fx.sfx.shimmer();
    fx.flash('#ffffff', 0.8, 1.2);
  }
  modeWeight() { return clamp(this.t / 0.8) * clamp((this.dur - this.t) / 1.2); }
  update(dt) {
    super.update(dt);
    const k = this.modeWeight(), ps = this.ps;
    for (let i = ps.count(50 * k, dt); i > 0; i--) {
      ps.emit({ x: rand(0, this.W), y: this.H + 10, vx: rand(-15, 15), vy: rand(-140, -60), life: rand(2, 4), size: rand(4, 12), sprite: Math.random() < 0.5 ? this.S.moonlight : this.S.purple, alpha: 0.8 });
    }
    if (this.t > this.dur) this.finish();
  }
  drawBack(ctx) {
    const k = this.modeWeight();
    if (k <= 0) return;
    const W = this.W, H = this.H;
    const r = H * 0.23, x = W * 0.5, y = H * 0.2;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createLinearGradient(0, y, 0, H);
    bg.addColorStop(0, 'rgba(220,200,255,0.35)');
    bg.addColorStop(1, 'rgba(220,200,255,0)');
    ctx.fillStyle = bg;
    const bw = r * (1.4 + 0.1 * Math.sin(this.t * 3));
    ctx.fillRect(x - bw, y, bw * 2, H);
    ctx.drawImage(this.S.moonlight, x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(moonCanvas('white'), x - r, y - r, r * 2, r * 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = k * 0.92;
    ctx.translate(x, y);
    ctx.rotate(this.t * 0.25);
    ctx.drawImage(patternCanvas('rinne_sharingan'), -r * 0.98, -r * 0.98, r * 1.96, r * 1.96);
    ctx.restore();
    ctx.restore();
  }
}

/* ═════════════════════════ Amaterasu ═════════════════════════ */

export class Amaterasu extends Effect {
  constructor(fx) {
    super(fx);
    this.fires = [];
    this.tear = null;
    this.idle = 0;
  }
  ignite(x, y, scale) {
    this.fires.push({ x, y, age: 0, life: rand(7, 9.5), scale });
    if (this.fires.length > 16) this.fires.shift();
    this.idle = 0;
  }
  bleed(side) {
    if (!this.tear || this.tear.t > 4) this.tear = { side, t: 0 };
  }
  update(dt) {
    super.update(dt);
    const ps = this.ps, S = this.S;
    for (const f of this.fires) {
      f.age += dt;
      const grow = clamp(f.age / 0.35), fade = clamp((f.life - f.age) / 1.2);
      const s = f.scale * grow * fade;
      if (s < 2) continue;
      for (let i = ps.count(55, dt); i > 0; i--) {
        ps.emit({ x: f.x + rand(-0.45, 0.45) * s, y: f.y + rand(-0.15, 0.2) * s, vx: rand(-25, 25), vy: -rand(1.0, 2.0) * s, drag: 0.5, life: rand(0.55, 1.0), size: s * rand(0.55, 0.9), size1: s * 0.25, sprite: pick(S.black), blend: 'source-over', alpha: 0.95, rot: rand(0, TAU), vr: rand(-1.5, 1.5), fadeIn: 0.05 });
      }
      for (let i = ps.count(22, dt); i > 0; i--) {
        ps.emit({ x: f.x + rand(-0.4, 0.4) * s, y: f.y - rand(0, 0.5) * s, vx: rand(-20, 20), vy: -rand(0.8, 1.6) * s, life: rand(0.3, 0.6), size: s * 0.4, size1: s * 0.1, sprite: S.violetRim, alpha: 0.55 });
      }
    }
    this.fires = this.fires.filter(f => f.age < f.life);
    if (this.tear) this.tear.t += dt;
    if (!this.fires.length && (!this.tear || this.tear.t > 6)) {
      this.idle += dt;
      if (this.idle > 0.5) this.finish();
    }
  }
  draw(ctx) {
    const f = this.face, tr = this.tear;
    if (!f || !tr) return;
    const eye = f[tr.side];
    const L = f.faceH * 0.3 * easeOut(tr.t / 1.6);
    const a = clamp((6 - tr.t) / 1.5);
    const x0 = eye.lowerLid.x, y0 = eye.lowerLid.y;
    ctx.save();
    ctx.globalAlpha = 0.85 * a;
    ctx.fillStyle = '#5a0006';
    ctx.beginPath();
    const w = f.faceW * 0.018;
    ctx.moveTo(x0 - w, y0);
    ctx.bezierCurveTo(x0 - w * 0.6, y0 + L * 0.4, x0 + w * 0.8, y0 + L * 0.7, x0 + w * 0.2, y0 + L);
    ctx.bezierCurveTo(x0 + w * 1.4, y0 + L * 0.7, x0 + w * 0.8, y0 + L * 0.4, x0 + w, y0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x0 + w * 0.5, y0 + L, w * 1.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/* ═════════════════════════ Kamui ═════════════════════════ */

export class Kamui extends Effect {
  constructor(fx, x, y) {
    super(fx);
    this.x = x; this.y = y;
    this.dur = 3.1;
    this.Rmax = Math.min(this.W, this.H) * 0.3;
    fx.sfx.vortex(2.7);
  }
  env() {
    const t = this.t;
    if (t < 0.6) return easeOut(t / 0.6);
    if (t < 2.4) return 1;
    return 1 - easeIn((t - 2.4) / 0.6);
  }
  update(dt) {
    super.update(dt);
    if (this.t > 2.95 && !this.popped) { this.popped = true; this.fx.flash('#d9c6ff', 0.35, 3); this.fx.shake(10); }
    const ps = this.ps;
    const R = this.Rmax * this.env();
    for (let i = ps.count(60, dt); i > 0; i--) {
      const a = rand(0, TAU), r = R * rand(1, 1.4);
      ps.emit({ x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r, vx: -Math.cos(a) * R * 1.4 - Math.sin(a) * R * 2.2, vy: -Math.sin(a) * R * 1.4 + Math.cos(a) * R * 2.2, life: 0.5, size: rand(3, 7), sprite: this.S.purple, alpha: 0.7 });
    }
    if (this.t > this.dur) this.finish();
  }
  draw(ctx) {
    const snap = this.fx.snapshot;
    const e = this.env();
    const R = this.Rmax * e;
    if (R < 3) return;
    const { x, y } = this;
    if (snap) {
      const N = 16;
      for (let i = 0; i < N; i++) {
        const f = i / N, r = R * (1 - f);
        if (r < 2) break;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.clip();
        ctx.translate(x, y);
        ctx.rotate(6 * e * f * f + this.t * 3 * f);
        const sc = 1 - 0.4 * f * e;
        ctx.scale(sc, sc);
        ctx.translate(-x, -y);
        ctx.drawImage(snap, 0, 0);
        ctx.restore();
      }
    }
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.25, 'rgba(10,0,20,0.75)');
    g.addColorStop(0.6, 'rgba(30,0,50,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,0,25,0.55)';
    ctx.lineWidth = Math.max(1.5, R * 0.025);
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      for (let s = 0; s <= 40; s++) {
        const th = (s / 40) * 3.2 * Math.PI;
        const r = R * Math.exp(-0.22 * th);
        const a = th + (arm * TAU) / 3 + this.t * 4;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ═════════════════════════ Susanoo ═════════════════════════ */

export class Susanoo extends Effect {
  constructor(fx, color) {
    super(fx);
    this.color = color;
    this.needsSeg = true;
    this.hasBack = true;
    this.on = true;
    this.k = 0;
    this.stopSnd = fx.sfx.auraLoop();
    this.onEnd = () => this.stopSnd();
    fx.sfx.activate();
    fx.shake(12);
  }
  toggleOff() {
    this.on = false;
    this.fx.sfx.deactivate();
  }
  setColor(c) { this.color = c; }
  update(dt) {
    super.update(dt);
    this.k = clamp(this.k + (this.on ? dt * 1.4 : -dt * 2));
    if (!this.on && this.k <= 0) { this.finish(); return; }
    const ps = this.ps, spr = glowSprite(this.color, 48, 0.2);
    const edges = this.fx.mask && this.fx.mask.ready ? this.fx.mask.edges : null;
    for (let i = ps.count(110 * this.k, dt); i > 0; i--) {
      let x, y;
      if (edges && edges.length) {
        const e = edges[(Math.random() * edges.length) | 0];
        x = e.x; y = e.y;
      } else if (this.face) {
        const a = rand(Math.PI, TAU);
        x = this.face.center.x + Math.cos(a) * this.face.faceW * 1.4;
        y = this.face.center.y + Math.sin(a) * this.face.faceH * 1.2 + this.face.faceH * 0.6;
      } else continue;
      ps.emit({ x, y, vx: rand(-25, 25), vy: rand(-170, -70), life: rand(0.45, 0.95), size: rand(16, 34) * (this.W / 1280), size1: 2, sprite: spr, alpha: 0.75 * this.k });
    }
  }
  drawBack(ctx) {
    const flick = 0.85 + 0.15 * Math.sin(this.t * 17) * Math.sin(this.t * 7.3);
    const cx = this.face ? this.face.nose.x : this.W / 2;
    const ok = this.fx.drawAura(ctx, this.color, 1.08, 18, 0.85 * this.k * flick, cx);
    this.fx.drawAura(ctx, this.color, 1.18, 34, 0.4 * this.k, cx);
    this.drawRibs(ctx, ok ? 0.75 : 0.45);
  }
  drawRibs(ctx, alpha) {
    const f = this.face;
    if (!f) return;
    const u = f.faceW, cx = f.chin.x, top = f.chin.y + f.faceH * 0.15;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * this.k * (0.85 + 0.15 * Math.sin(this.t * 9));
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    const pass = (lw, a) => {
      ctx.lineWidth = lw;
      ctx.globalAlpha = alpha * this.k * a;
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, top + u * 2.4);
      for (let i = 0; i < 6; i++) {
        const y = top + u * 0.3 + i * u * 0.34;
        const rx = u * (1.6 - i * 0.08), ry = u * 0.5;
        for (const sx of [-1, 1]) {
          ctx.moveTo(cx + sx * u * 0.08, y);
          ctx.quadraticCurveTo(cx + sx * rx * 0.95, y - ry * 0.7, cx + sx * rx, y + ry * 0.55);
        }
      }
      for (const sx of [-1, 1]) {
        ctx.moveTo(cx + sx * u * 0.1, top - u * 0.05);
        ctx.quadraticCurveTo(cx + sx * u * 1.2, top - u * 0.35, cx + sx * u * 2.0, top - u * 0.05);
      }
      ctx.stroke();
    };
    pass(u * 0.22, 0.25);
    pass(u * 0.07, 0.9);
    ctx.restore();
  }
}

/* ═════════════════════════ Shinra Tensei ═════════════════════════ */

export class ShinraTensei extends Effect {
  constructor(fx, origin) {
    super(fx);
    this.o = origin || { x: this.W / 2, y: this.H / 2 };
    this.dur = 2.1;
    this.maxR = Math.hypot(this.W, this.H);
    fx.sfx.boom(1.5);
    fx.sfx.whoosh(0.8, false);
    fx.shake(32);
    fx.flash('#ffffff', 0.75, 2.6);
    const ps = this.ps, S = this.S;
    for (let i = 0; i < 130 * ps.scale; i++) {
      const a = rand(0, TAU), sp = rand(700, 1900) * (this.W / 1280);
      const rock = Math.random() < 0.55;
      ps.emit({
        x: this.o.x + Math.cos(a) * 30, y: this.o.y + Math.sin(a) * 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1.6,
        life: rand(0.8, 1.5), size: rock ? rand(8, 26) : rand(60, 140), size1: rock ? null : rand(180, 260),
        sprite: rock ? pick(S.rocks) : pick(S.dust), blend: 'source-over', alpha: rock ? 1 : 0.5, rot: rand(0, TAU), vr: rand(-8, 8), fadeIn: 0,
      });
    }
  }
  update(dt) { super.update(dt); if (this.t > this.dur) this.finish(); }
  draw(ctx) {
    const k = clamp(this.t / 1.1);
    const r = this.maxR * easeOut(k);
    const w = 80 * (1 - k) + 12;
    const a = 1 - k;
    const { x, y } = this.o;
    const snap = this.fx.snapshot;
    if (snap && a > 0.02) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r + w, 0, TAU);
      ctx.arc(x, y, Math.max(0, r - w), 0, TAU, true);
      ctx.clip();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.scale(1.08, 1.08);
      ctx.translate(-x, -y);
      ctx.drawImage(snap, 0, 0);
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`;
    ctx.lineWidth = w * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(200,180,255,${0.35 * a})`;
    ctx.lineWidth = w * 0.2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.78, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * a})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * TAU + i;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * r * 0.55, y + Math.sin(ang) * r * 0.55);
      ctx.lineTo(x + Math.cos(ang) * r * 0.95, y + Math.sin(ang) * r * 0.95);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ═════════════════════════ Byakugan sight ═════════════════════════ */

export class ByakuganSight extends Effect {
  constructor(fx) {
    super(fx);
    this.on = true;
    this.k = 0;
    this.mode = 'byakugan';
    this.needsSeg = true;
    this.hasBack = true;
    fx.sfx.shimmer();
  }
  toggleOff() { this.on = false; this.fx.sfx.deactivate(); }
  modeWeight() { return this.k; }
  update(dt) {
    super.update(dt);
    this.k = clamp(this.k + (this.on ? dt * 2.5 : -dt * 3));
    if (!this.on && this.k <= 0) this.finish();
  }
  drawBack(ctx) {
    const cx = this.face ? this.face.nose.x : this.W / 2;
    this.fx.drawAura(ctx, '#6fa8ff', 1.02, 10, 0.75 * this.k, cx);
  }
  draw(ctx) {
    const k = this.k;
    if (k <= 0) return;
    const S = this.S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const h of this.hands) {
      for (const pass of [[0.2, 0.22], [0.06, 0.9]]) {
        ctx.lineWidth = h.size * pass[0];
        ctx.strokeStyle = `rgba(120,190,255,${pass[1] * k})`;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(h.pts[a].x, h.pts[a].y); ctx.lineTo(h.pts[b].x, h.pts[b].y); }
        ctx.stroke();
      }
      ctx.globalAlpha = k;
      h.pts.forEach((p, i) => {
        const s = h.size * (0.22 + 0.12 * Math.sin(this.t * 6 + i));
        ctx.drawImage(S.cyan, p.x - s / 2, p.y - s / 2, s, s);
      });
      ctx.globalAlpha = 1;
    }
    const f = this.face;
    if (f) {
      ctx.globalAlpha = 0.7 * k;
      for (let j = 0; j < FACE_IDX.faceOval.length; j += 2) {
        const p = f.pts[FACE_IDX.faceOval[j]];
        const s = f.faceW * (0.05 + 0.03 * Math.sin(this.t * 5 + j));
        ctx.drawImage(S.cyan, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(this.t * 2.2, f.center.x, f.center.y);
        g.addColorStop(0, `rgba(160,200,255,${0.22 * k})`);
        g.addColorStop(0.06, 'rgba(160,200,255,0)');
        g.addColorStop(1, 'rgba(160,200,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.W, this.H);
      }
    }
    ctx.restore();
  }
}

/* ═════════════════════════ Seal burst ═════════════════════════ */

export class SealBurst extends Effect {
  constructor(fx, seal, at) {
    super(fx);
    this.seal = seal;
    this.at = at;
    this.dur = 0.95;
    const ps = this.ps;
    for (let i = 0; i < 26 * ps.scale; i++) {
      const a = rand(0, TAU), sp = rand(120, 380);
      ps.emit({ x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: rand(0.4, 0.8), size: rand(8, 20), sprite: this.S.chakra, alpha: 0.9 });
    }
  }
  update(dt) { super.update(dt); if (this.t > this.dur) this.finish(); }
  drawTop(ctx) {
    const k = this.t / this.dur;
    const size = Math.round(this.H * 0.11 * (1 + 0.35 * (1 - easeOut(k * 2))));
    ctx.save();
    ctx.globalAlpha = 1 - easeIn(k);
    ctx.font = `${size}px "Yuji Syuku", "Yu Mincho", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#4aa8ff';
    ctx.shadowBlur = 24;
    ctx.lineWidth = size * 0.1;
    ctx.strokeStyle = 'rgba(0,10,30,0.8)';
    const y = this.at.y - this.H * 0.12 - k * 30;
    ctx.strokeText(this.seal.kanji, this.at.x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(this.seal.kanji, this.at.x, y);
    ctx.restore();
  }
}
