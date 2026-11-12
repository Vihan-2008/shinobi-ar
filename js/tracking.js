// MediaPipe wrapper: face (with iris), hands and selfie segmentation.
// Also converts raw landmarks into screen-space geometry used by the renderers.

import { MODEL_URLS } from './config.js';

let vision = null;
let mp = null;

async function loadBundle() {
  if (!mp) mp = await import(MODEL_URLS.bundle);
  if (!vision) vision = await mp.FilesetResolver.forVisionTasks(MODEL_URLS.wasm);
  return mp;
}

async function createWithFallback(Klass, options) {
  try {
    return await Klass.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
  } catch (err) {
    console.warn('GPU delegate failed, falling back to CPU', err);
    return await Klass.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
  }
}

export class Tracker {
  constructor() {
    this.face = null;
    this.hands = null;
    this.seg = null;
    this.segLoading = null;
    this.lastTs = 0;
    this.ms = { face: 0, hands: 0, seg: 0 };
    this.segCanvas = null;
  }

  async initFace() {
    const { FaceLandmarker } = await loadBundle();
    this.face = await createWithFallback(FaceLandmarker, {
      baseOptions: { modelAssetPath: MODEL_URLS.face },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  async initHands() {
    const { HandLandmarker } = await loadBundle();
    this.hands = await createWithFallback(HandLandmarker, {
      baseOptions: { modelAssetPath: MODEL_URLS.hand },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.4,
    });
  }

  initSeg() {
    if (!this.segLoading) {
      this.segLoading = (async () => {
        const { ImageSegmenter } = await loadBundle();
        this.seg = await createWithFallback(ImageSegmenter, {
          baseOptions: { modelAssetPath: MODEL_URLS.seg },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      })();
    }
    return this.segLoading;
  }

  nextTs() {
    const now = performance.now();
    this.lastTs = Math.max(this.lastTs + 1, now);
    return this.lastTs;
  }

  /** Exponential moving average of how long each model takes, used to throttle on slow machines. */
  time(key, t0) {
    const ms = performance.now() - t0;
    this.ms[key] = this.ms[key] ? this.ms[key] * 0.85 + ms * 0.15 : ms;
  }

  detectFace(video) {
    if (!this.face) return undefined;
    const t0 = performance.now();
    const r = this.face.detectForVideo(video, this.nextTs());
    this.time('face', t0);
    return r.faceLandmarks && r.faceLandmarks.length ? r.faceLandmarks[0] : null;
  }

  detectHands(video) {
    if (!this.hands) return undefined;
    const t0 = performance.now();
    const r = this.hands.detectForVideo(video, this.nextTs());
    this.time('hands', t0);
    return (r.landmarks || []).map((lm, i) => ({ lm, world: r.worldLandmarks ? r.worldLandmarks[i] : null }));
  }

  /**
   * The selfie model works at 256 px internally, so feed it a small copy of the frame. That keeps
   * the upload cheap and, more importantly, makes the mask read-back tiny instead of full HD.
   */
  segment(video, onMask) {
    if (!this.seg) return;
    const vw = video.videoWidth || video.width, vh = video.videoHeight || video.height;
    if (!vw || !vh) return;
    const sw = 256, sh = Math.max(1, Math.round((256 * vh) / vw));
    const c = this.segCanvas || (this.segCanvas = document.createElement('canvas'));
    if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; }
    c.getContext('2d').drawImage(video, 0, 0, sw, sh);
    const t0 = performance.now();
    try {
      this.seg.segmentForVideo(c, this.nextTs(), (res) => {
        const masks = res.confidenceMasks;
        if (!masks || !masks.length) return;
        const m = masks[masks.length - 1];
        onMask(m.getAsFloat32Array(), m.width, m.height);
      });
    } catch (err) {
      console.warn('segmentation failed', err);
    }
    this.time('seg', t0);
  }
}

/* ───────────────────────── Geometry ───────────────────────── */

export const FACE_IDX = {
  rightEyePoly: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  leftEyePoly: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
  rightIris: [468, 469, 470, 471, 472],
  leftIris: [473, 474, 475, 476, 477],
  faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
};

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Smooths face landmarks with an adaptive (speed-aware) filter and derives eye/mouth geometry. */
export class FaceGeometry {
  constructor() { this.pts = null; this.raw = null; this.irisStab = {}; }

  reset() { this.pts = null; this.irisStab = {}; }

  /**
   * Extra stabilisation for the irises. Landmark noise of a pixel or two makes an overlay shimmer,
   * so tiny moves are damped hard while real eye movements still pass straight through. The radius
   * is noisy too: it is clamped to a plausible share of the eye width and eased slowly.
   */
  stabilizeIris(key, e) {
    const target = Math.min(e.width * 0.25, Math.max(e.width * 0.17, e.irisR));
    const s = this.irisStab[key];
    if (!s) {
      this.irisStab[key] = { x: e.iris.x, y: e.iris.y, r: target };
    } else {
      const d = Math.hypot(e.iris.x - s.x, e.iris.y - s.y) / Math.max(1, e.width);
      const a = Math.min(1, 0.28 + d * 7);
      s.x += (e.iris.x - s.x) * a;
      s.y += (e.iris.y - s.y) * a;
      s.r += (target - s.r) * 0.15;
    }
    const st = this.irisStab[key];
    e.iris = { x: st.x, y: st.y };
    e.irisR = st.r;
  }

  update(lms, W, H, mirror) {
    const n = lms.length;
    if (!this.pts || this.pts.length !== n) {
      this.pts = lms.map(p => ({ x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H }));
    } else {
      const thr = 0.012 * W;
      for (let i = 0; i < n; i++) {
        const p = lms[i];
        const x = (mirror ? 1 - p.x : p.x) * W, y = p.y * H;
        const q = this.pts[i];
        const d = Math.hypot(x - q.x, y - q.y);
        const a = d > thr ? 1 : 0.38 + 0.62 * (d / thr);
        q.x += (x - q.x) * a;
        q.y += (y - q.y) * a;
      }
    }
    this.raw = lms;
    return this.derive(W, H);
  }

  derive(W, H) {
    const P = this.pts;
    const eye = (polyIdx, irisIdx, outer, inner, up, low) => {
      const poly = polyIdx.map(i => P[i]);
      const c = P[irisIdx[0]];
      let r = 0;
      for (let k = 1; k < 5; k++) r += dist(c, P[irisIdx[k]]);
      r /= 4;
      const width = dist(P[outer], P[inner]);
      return {
        poly, iris: c, irisR: r, outer: P[outer], inner: P[inner], width,
        center: mid(P[outer], P[inner]),
        aperture: dist(P[up], P[low]) / Math.max(1, width),
        lowerLid: P[low], upperLid: P[up],
      };
    };
    const right = eye(FACE_IDX.rightEyePoly, FACE_IDX.rightIris, 33, 133, 159, 145);
    const left = eye(FACE_IDX.leftEyePoly, FACE_IDX.leftIris, 263, 362, 386, 374);
    // Guard: make sure each iris sits with its nearest eye.
    if (dist(right.iris, right.center) > dist(right.iris, left.center)) {
      const ri = right.iris, rr = right.irisR;
      right.iris = left.iris; right.irisR = left.irisR; left.iris = ri; left.irisR = rr;
    }
    this.stabilizeIris('left', left);
    this.stabilizeIris('right', right);
    const a = left.center.x < right.center.x ? left.center : right.center;
    const b = left.center.x < right.center.x ? right.center : left.center;
    const roll = Math.atan2(b.y - a.y, b.x - a.x);
    const faceW = dist(P[234], P[454]);
    const faceH = dist(P[10], P[152]);
    const nose = P[1];
    const fc = { x: (P[234].x + P[454].x) / 2, y: (P[10].y + P[152].y) / 2 };
    const off = { x: (nose.x - fc.x) / faceW, y: (nose.y - fc.y) / faceW - 0.07 };
    const gaze = {
      x: Math.min(W * 0.97, Math.max(W * 0.03, nose.x + off.x * W * 2.6)),
      y: Math.min(H * 0.97, Math.max(H * 0.03, nose.y + off.y * H * 3.2)),
    };
    const mouth = mid(P[13], P[14]);
    const mouthOpen = dist(P[13], P[14]) / Math.max(1, dist(P[61], P[291]));
    const glabella = P[9], fh = P[151];
    const thirdEye = { x: glabella.x + (fh.x - glabella.x) * 0.55, y: glabella.y + (fh.y - glabella.y) * 0.55 };
    return {
      pts: P, left, right, roll, faceW, faceH, nose, mouth, mouthOpen, gaze, thirdEye,
      chin: P[152], top: P[10], center: fc, eyeSpan: dist(left.center, right.center),
    };
  }
}

/* ───────── Hands ───────── */

const FINGERS = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };

function v3(a, b) { return { x: b.x - a.x, y: b.y - a.y, z: (b.z || 0) - (a.z || 0) }; }
function len3(v) { return Math.hypot(v.x, v.y, v.z); }

function fingerExtended(w, [mcp, pip, , tip]) {
  const a = v3(w[mcp], w[pip]), b = v3(w[pip], w[tip]);
  const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (len3(a) * len3(b) + 1e-9);
  const dTip = len3(v3(w[0], w[tip])), dPip = len3(v3(w[0], w[pip]));
  return cos > 0.5 && dTip > dPip * 1.08;
}

export function analyzeHand(raw, W, H, mirror) {
  const pts = raw.lm.map(p => ({ x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H, z: p.z * W }));
  const w = raw.world || raw.lm.map(p => ({ x: p.x * W, y: p.y * H, z: p.z * W }));
  const ext = {
    index: fingerExtended(w, FINGERS.index),
    middle: fingerExtended(w, FINGERS.middle),
    ring: fingerExtended(w, FINGERS.ring),
    pinky: fingerExtended(w, FINGERS.pinky),
  };
  const size = dist(pts[0], pts[9]);
  const palm = {
    x: (pts[0].x + pts[5].x + pts[9].x + pts[13].x + pts[17].x) / 5,
    y: (pts[0].y + pts[5].y + pts[9].y + pts[13].y + pts[17].y) / 5,
  };
  let shape;
  const { index: i, middle: m, ring: r, pinky: p } = ext;
  if (!i && !m && !r && !p) shape = 'F';
  else if (i && !m && !r && !p) shape = '1';
  else if (i && m && !r && !p) shape = '2';
  else if (i && m && (r || p)) shape = 'O';
  else shape = '?';

  // Direction the fingers point (for open / pointing shapes) or the hand points (fist).
  let vx = 0, vy = 0;
  const addDir = (f) => { const [mcp, , , tip] = FINGERS[f]; vx += pts[tip].x - pts[mcp].x; vy += pts[tip].y - pts[mcp].y; };
  if (shape === '1') addDir('index');
  else if (shape === '2') { addDir('index'); addDir('middle'); }
  else if (shape === 'O') { addDir('index'); addDir('middle'); addDir('ring'); addDir('pinky'); }
  else { vx = pts[9].x - pts[0].x; vy = pts[9].y - pts[0].y; }
  const ang = Math.atan2(-vy, vx) * 180 / Math.PI; // 90 = up
  let dir = 'S';
  if (ang > 45 && ang < 135) dir = 'U';
  else if (ang < -45 && ang > -135) dir = 'D';
  const token = shape === 'F' ? 'F' : shape === '?' ? '?' : shape + dir;
  return { pts, world: w, ext, size, palm, shape, dir, token, tip: pts[8], angle: ang, screenW: W };
}

const SHAPE_GLYPH = { F: '✊', 1: '☝️', 2: '✌️', O: '🖐️', '?': '❔' };
const DIR_GLYPH = { U: '↑', D: '↓', S: '↔' };
export function describeHand(h) {
  return SHAPE_GLYPH[h.shape] + (h.shape === 'F' || h.shape === '?' ? '' : DIR_GLYPH[h.dir]);
}
