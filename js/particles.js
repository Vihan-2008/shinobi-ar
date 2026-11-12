// Sprite factory + pooled particle system used by all jutsu effects.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = t => Math.pow(clamp(t), 3);
export const easeInOut = t => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

function mk(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const spriteCache = new Map();

/** Soft radial glow. `core` (0..1) controls how hard the center is. */
export function glowSprite(color, size = 64, core = 0.15) {
  const key = `g|${color}|${size}|${core}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const [r, g, b] = Array.isArray(color) ? color : hexToRgb(color);
  const c = mk(size), x = c.getContext('2d'), h = size / 2;
  const grd = x.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(core, `rgba(${r},${g},${b},0.85)`);
  grd.addColorStop(0.45, `rgba(${r},${g},${b},0.32)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, size, size);
  spriteCache.set(key, c);
  return c;
}

/** Lumpy puff (smoke, dust, black flame) built from blurred blobs. */
export function puffSprite(color, size = 96, seed = 1, alpha = 1) {
  const key = `p|${color}|${size}|${seed}|${alpha}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const [r, g, b] = Array.isArray(color) ? color : hexToRgb(color);
  const c = mk(size), x = c.getContext('2d'), h = size / 2;
  const rnd = mulberry32(seed * 977);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * h * 0.35;
    const cx = h + Math.cos(a) * d, cy = h + Math.sin(a) * d, rr = h * (0.35 + rnd() * 0.3);
    const grd = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
    grd.addColorStop(0, `rgba(${r},${g},${b},${0.55 * alpha})`);
    grd.addColorStop(0.6, `rgba(${r},${g},${b},${0.25 * alpha})`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grd;
    x.beginPath();
    x.arc(cx, cy, rr, 0, Math.PI * 2);
    x.fill();
  }
  spriteCache.set(key, c);
  return c;
}

/** Amaterasu flame: dark body with a crimson/violet rim. */
export function blackFlameSprite(size = 96, seed = 1) {
  const key = `bf|${size}|${seed}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = mk(size), x = c.getContext('2d'), h = size / 2;
  const rnd = mulberry32(seed * 31 + 7);
  for (let i = 0; i < 7; i++) {
    const cx = h + (rnd() - 0.5) * h * 0.5, cy = h + (rnd() - 0.5) * h * 0.5, rr = h * (0.45 + rnd() * 0.3);
    const grd = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)');
    grd.addColorStop(0.55, 'rgba(12,0,10,0.55)');
    grd.addColorStop(0.8, 'rgba(70,0,40,0.28)');
    grd.addColorStop(1, 'rgba(90,0,30,0)');
    x.fillStyle = grd;
    x.beginPath();
    x.arc(cx, cy, rr, 0, Math.PI * 2);
    x.fill();
  }
  spriteCache.set(key, c);
  return c;
}

export function rockSprite(size = 32, seed = 1) {
  const key = `r|${size}|${seed}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = mk(size), x = c.getContext('2d'), h = size / 2;
  const rnd = mulberry32(seed * 53);
  x.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = h * (0.55 + rnd() * 0.4);
    const px = h + Math.cos(a) * rr, py = h + Math.sin(a) * rr;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
  const grd = x.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, '#8a7a66');
  grd.addColorStop(1, '#3b3026');
  x.fillStyle = grd;
  x.fill();
  spriteCache.set(key, c);
  return c;
}

const DEFAULTS = {
  x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life: 1, size: 20, size1: null,
  alpha: 1, sprite: null, sprites: null, blend: 'lighter', rot: 0, vr: 0, fadeIn: 0.08, anchor: null,
};

export class ParticleSystem {
  constructor(max = 3000) {
    this.max = max;
    this.live = [];
    this.pool = [];
    this.scale = 1; // quality multiplier for emit counts
  }

  emit(o) {
    if (this.live.length >= this.max) return null;
    const p = this.pool.pop() || {};
    Object.assign(p, DEFAULTS, o);
    if (p.size1 === null) p.size1 = p.size;
    p.age = 0;
    this.live.push(p);
    return p;
  }

  /** Number of particles to emit this frame for a given rate (per second). */
  count(rate, dt) {
    const n = rate * dt * this.scale;
    return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  }

  clear() {
    for (const p of this.live) this.pool.push(p);
    this.live.length = 0;
  }

  update(dt) {
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) {
        L[i] = L[L.length - 1];
        L.pop();
        this.pool.push(p);
        continue;
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx) {
    const L = this.live;
    if (!L.length) return;
    ctx.save();
    for (const blend of ['source-over', 'lighter']) {
      ctx.globalCompositeOperation = blend;
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        if (p.blend !== blend) continue;
        const t = p.age / p.life;
        const s = p.size + (p.size1 - p.size) * t;
        if (s <= 0.5) continue;
        const fi = p.fadeIn > 0 ? Math.min(1, t / p.fadeIn) : 1;
        const a = p.alpha * fi * (1 - t);
        if (a <= 0.01) continue;
        const spr = p.sprites ? p.sprites[Math.min(p.sprites.length - 1, (t * p.sprites.length) | 0)] : p.sprite;
        if (!spr) continue;
        ctx.globalAlpha = a > 1 ? 1 : a;
        if (p.rot) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.drawImage(spr, -s / 2, -s / 2, s, s);
          ctx.restore();
        } else {
          ctx.drawImage(spr, p.x - s / 2, p.y - s / 2, s, s);
        }
      }
    }
    ctx.restore();
  }
}
