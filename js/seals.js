// Hand-seal recognition: rule-based "easy seals" + a user-trainable k-NN classifier,
// temporal stabilisation, and the seal-sequence → jutsu matcher.

import { SEAL_RULES, JUTSUS, SEALS } from './config.js';

const STORE_KEY = 'shinobi-ar.seal-samples.v1';
const FEAT_DIM = 21 * 3 * 2 + 4;
const VALID_IDS = new Set([...SEALS.map(s => s.id), 'idle']);
const MAX_PER_SEAL = 240;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

/**
 * Turn untrusted JSON (localStorage or an imported file) into clean samples:
 * only known seal ids, only fixed-length numeric vectors, bounded counts, finite values.
 */
function sanitizeSamples(obj) {
  const out = Object.create(null);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const id of VALID_IDS) {
    if (!Object.prototype.hasOwnProperty.call(obj, id)) continue;
    const arr = obj[id];
    if (!Array.isArray(arr)) continue;
    const clean = [];
    for (const v of arr) {
      if (clean.length >= MAX_PER_SEAL) break;
      if (!Array.isArray(v) || v.length !== FEAT_DIM) continue;
      const f = new Float32Array(FEAT_DIM);
      let ok = true;
      for (let i = 0; i < FEAT_DIM; i++) {
        const x = v[i];
        if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 1e4) { ok = false; break; }
        f[i] = x;
      }
      if (ok) clean.push(f);
    }
    if (clean.length) out[id] = clean;
  }
  return out;
}

/* ───────────── Feature extraction (for k-NN) ───────────── */

export function featurize(hands) {
  const f = new Float32Array(FEAT_DIM);
  if (!hands.length) return null;
  const sorted = [...hands].sort((a, b) => a.palm.x - b.palm.x).slice(0, 2);
  const scale = sorted.reduce((s, h) => s + h.size, 0) / sorted.length || 1;
  // A lone hand goes into the slot on the side of the screen it is on.
  const slots = sorted.length === 2 ? sorted : (sorted[0].palm.x < sorted[0].screenW / 2 ? [sorted[0], null] : [null, sorted[0]]);
  slots.forEach((h, s) => {
    if (!h) return;
    const w = h.pts[0];
    for (let j = 0; j < 21; j++) {
      const p = h.pts[j], o = s * 63 + j * 3;
      f[o] = (p.x - w.x) / scale;
      f[o + 1] = (p.y - w.y) / scale;
      f[o + 2] = ((p.z - w.z) / scale) * 0.5;
    }
  });
  const b = 126;
  if (slots[0] && slots[1]) {
    f[b] = (slots[1].pts[0].x - slots[0].pts[0].x) / scale;
    f[b + 1] = (slots[1].pts[0].y - slots[0].pts[0].y) / scale;
  }
  f[b + 2] = slots[0] ? 3 : 0;
  f[b + 3] = slots[1] ? 3 : 0;
  return f;
}

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

/* ───────────── k-NN store ───────────── */

export class SealTrainer {
  constructor() {
    this.samples = Object.create(null); // id -> Float32Array[]
    this.threshold = 3;
    this.sensitivity = 1;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      this.samples = sanitizeSamples(JSON.parse(raw));
      this.recompute();
    } catch (err) {
      console.warn('Could not load seal samples', err);
    }
  }

  save() {
    try {
      localStorage.setItem(STORE_KEY, this.export());
      return true;
    } catch (err) {
      console.warn('Could not save seal samples', err);
      return false;
    }
  }

  export() {
    const out = {};
    for (const [k, arr] of Object.entries(this.samples)) {
      if (arr.length) out[k] = arr.map(v => Array.from(v, x => Math.round(x * 1000) / 1000));
    }
    return JSON.stringify(out);
  }

  import(json) {
    if (typeof json !== 'string' || json.length > MAX_IMPORT_BYTES) throw new Error('file is too large');
    const next = sanitizeSamples(JSON.parse(json));
    if (!Object.keys(next).length) throw new Error('no valid seal recordings found in this file');
    this.samples = next;
    this.recompute();
    this.save();
  }

  count(id) { return (this.samples[id] || []).length; }
  get total() { return Object.values(this.samples).reduce((s, a) => s + a.length, 0); }
  get trainedIds() { return Object.keys(this.samples).filter(k => this.samples[k].length && k !== 'idle'); }

  add(id, feat) {
    if (!VALID_IDS.has(id)) return;
    const arr = (this.samples[id] ||= []);
    if (arr.length >= MAX_PER_SEAL) arr.shift();
    arr.push(feat);
  }

  clear(id) {
    if (id) delete this.samples[id];
    else this.samples = Object.create(null);
    this.recompute();
    this.save();
  }

  /** Estimate a rejection threshold from the spread inside each class. */
  recompute() {
    const spreads = [];
    for (const arr of Object.values(this.samples)) {
      if (arr.length < 4) continue;
      for (let i = 0; i < 24; i++) {
        const a = arr[(Math.random() * arr.length) | 0], b = arr[(Math.random() * arr.length) | 0];
        spreads.push(Math.sqrt(dist2(a, b)));
      }
    }
    spreads.sort((a, b) => a - b);
    const p90 = spreads.length ? spreads[Math.floor(spreads.length * 0.9)] : 1.5;
    this.threshold = Math.max(1.6, p90 * 1.8);
  }

  classify(feat, k = 7) {
    if (!feat || !this.total) return null;
    const best = [];
    for (const [id, arr] of Object.entries(this.samples)) {
      for (const s of arr) {
        const d = dist2(feat, s);
        if (best.length < k) { best.push({ id, d }); best.sort((a, b) => a.d - b.d); }
        else if (d < best[k - 1].d) { best[k - 1] = { id, d }; best.sort((a, b) => a.d - b.d); }
      }
    }
    if (!best.length) return null;
    const votes = {};
    for (const b of best) votes[b.id] = (votes[b.id] || 0) + 1;
    let id = null, n = 0;
    for (const [k2, v] of Object.entries(votes)) if (v > n) { n = v; id = k2; }
    const meanD = Math.sqrt(best.filter(b => b.id === id).reduce((s, b) => s + b.d, 0) / n);
    const confident = n / best.length >= 0.6 && meanD < this.threshold * this.sensitivity;
    return { id, confidence: n / best.length, distance: meanD, confident };
  }
}

/* ───────────── Rule-based classifier ───────────── */

export function classifyRules(hands) {
  if (hands.length !== 2) return null;
  const [a, b] = hands;
  const avg = (a.size + b.size) / 2;
  const d = Math.hypot(a.palm.x - b.palm.x, a.palm.y - b.palm.y);
  if (d > avg * 3.2) return null;
  const key = [a.token, b.token].sort().join('+');
  return SEAL_RULES[key] || null;
}

/* ───────────── Temporal stabiliser ───────────── */

export class SealStabilizer {
  constructor() {
    this.window = [];
    this.candidate = 'none';
    this.since = 0;
    this.lastRegistered = null;
    this.released = true;
    this.progress = 0;
    this.holdMs = 220;
  }

  update(label, now) {
    this.window.push(label || 'none');
    if (this.window.length > 7) this.window.shift();
    const counts = {};
    for (const l of this.window) counts[l] = (counts[l] || 0) + 1;
    let best = 'none', n = 0;
    for (const [l, c] of Object.entries(counts)) if (c > n) { n = c; best = l; }
    const stable = n >= 4 ? best : 'none';
    if (stable !== this.candidate) { this.candidate = stable; this.since = now; }
    const held = now - this.since;
    let registered = null;
    if (this.candidate === 'none') {
      this.progress = 0;
      if (held > 280) this.released = true;
    } else {
      this.progress = Math.min(1, held / this.holdMs);
      if (held >= this.holdMs && (this.candidate !== this.lastRegistered || this.released)) {
        registered = this.candidate;
        this.lastRegistered = this.candidate;
        this.released = false;
      }
    }
    return registered;
  }
}

/* ───────────── Sequence → jutsu ───────────── */

function matchesEnd(seq, buf, slack) {
  if (!seq.length || !buf.length) return false;
  if (buf[buf.length - 1] !== seq[seq.length - 1]) return false;
  let i = seq.length - 1, j = buf.length - 1, skips = 0;
  while (i >= 0 && j >= 0) {
    if (buf[j] === seq[i]) { i--; j--; }
    else { skips++; j--; if (skips > slack) return false; }
  }
  return i < 0;
}

export class SequenceEngine {
  constructor() {
    this.buffer = [];
    this.lastT = 0;
    this.lenient = true;
    this.timeout = 6000;
  }

  reset() { this.buffer = []; }

  push(seal, now) {
    if (now - this.lastT > this.timeout) this.buffer = [];
    this.lastT = now;
    this.buffer.push(seal);
    if (this.buffer.length > 14) this.buffer.shift();
    const slack = this.lenient ? 2 : 0;
    let hit = null;
    for (const j of JUTSUS) {
      if (!j.seals.length) continue;
      if (matchesEnd(j.seals, this.buffer, slack) && (!hit || j.seals.length > hit.seals.length)) hit = j;
    }
    if (hit) this.buffer = [];
    return hit;
  }

  expired(now) { return this.buffer.length && now - this.lastT > this.timeout; }

  /** How many leading seals of `seq` are satisfied by the tail of the buffer. */
  progress(seq) {
    const slack = this.lenient ? 2 : 0;
    for (let k = Math.min(seq.length, this.buffer.length); k > 0; k--) {
      if (matchesEnd(seq.slice(0, k), this.buffer, slack)) return k;
    }
    return 0;
  }
}
