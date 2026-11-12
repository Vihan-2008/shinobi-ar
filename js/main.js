// Shinobi AR: app bootstrap, frame loop, gesture logic and jutsu dispatch.

import {
  SEALS, SEAL_MAP, JUTSUS, JUTSU_MAP, EYES, PRESETS, ABILITIES, ABILITY_MAP, FAMILY_LABEL, DEFAULT_SETTINGS,
} from './config.js';
import { Tracker, FaceGeometry, analyzeHand, describeHand, HAND_CONNECTIONS, FACE_IDX } from './tracking.js';
import { DojutsuRenderer, patternCanvas } from './dojutsu.js';
import { SealTrainer, SealStabilizer, SequenceEngine, featurize, classifyRules } from './seals.js';
import {
  FX, Fireball, PhoenixFlower, Chidori, Rasengan, ShadowClones, Summoning, EarthWall, WaterDragon,
  Tsukuyomi, InfiniteTsukuyomi, Amaterasu, Kamui, Susanoo, ShinraTensei, ByakuganSight, SealBurst,
} from './effects.js';
import { glowSprite, rand, clamp } from './particles.js';
import { SFX } from './audio.js';
import { Voice } from './voice.js';
import { UI } from './ui.js';

const $ = s => document.querySelector(s);
const SETTINGS_KEY = 'shinobi-ar.settings.v1';
const QUALITY_SCALE = { low: 0.45, medium: 0.75, high: 1 };
const MODE_DEF = {
  tsukuyomi: { filter: 'grayscale(1) invert(1) contrast(1.45) brightness(0.92)', tint: '#ff2418', blend: 'multiply' },
  byakugan: { filter: 'grayscale(1) contrast(1.55) brightness(0.72)', tint: '#8597ff', blend: 'multiply' },
  infinite: { filter: 'saturate(0.35) brightness(1.18) contrast(0.92)', tint: '#cdb8ff', blend: 'soft-light' },
};
const SHARINGAN_FAMS = ['sharingan', 'mangekyo', 'eternal', 'rinne'];

const ENUM_SETTINGS = { fit: ['cover', 'contain'], quality: ['low', 'medium', 'high'], sealMode: ['auto', 'rules', 'trained'] };

/** Load saved settings, keeping only known keys whose type matches the default. */
function loadSettings() {
  const out = { ...DEFAULT_SETTINGS };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { return out; }
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!Object.prototype.hasOwnProperty.call(saved, key)) continue;
    const v = saved[key];
    if (typeof v !== typeof DEFAULT_SETTINGS[key]) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    if (ENUM_SETTINGS[key] && !ENUM_SETTINGS[key].includes(v)) continue;
    out[key] = v;
  }
  out.volume = clamp(out.volume, 0, 1);
  out.holdMs = clamp(out.holdMs, 80, 600);
  out.knnSensitivity = clamp(out.knnSensitivity, 0.5, 2);
  return out;
}

function makeCanvas(w = 1, h = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

/* ═════════════════════════ App ═════════════════════════ */

class App {
  constructor() {
    this.settings = loadSettings();
    this.canvas = $('#stage');
    this.ctx = this.canvas.getContext('2d');
    this.video = $('#video');
    this.W = 1280; this.H = 720;

    this.sfx = new SFX();
    this.sfx.volume = this.settings.volume;
    this.fx = new FX(this.sfx);
    this.dojutsu = new DojutsuRenderer();
    this.tracker = new Tracker();
    this.faceGeo = new FaceGeometry();
    this.trainer = new SealTrainer();
    this.trainer.sensitivity = this.settings.knnSensitivity;
    this.stab = new SealStabilizer();
    this.stab.holdMs = this.settings.holdMs;
    this.seq = new SequenceEngine();
    this.seq.lenient = this.settings.lenient;

    this.base = makeCanvas(); this.bctx = this.base.getContext('2d');
    this.personCv = makeCanvas(); this.pctx = this.personCv.getContext('2d');
    this.snap = makeCanvas(); this.sctx = this.snap.getContext('2d');
    this.maskCv = makeCanvas(); this.mctx = this.maskCv.getContext('2d');
    this.maskImg = null;
    this.maskState = { ready: false, canvas: this.maskCv, mirror: true, edges: [], votes: 0, invert: false, locked: false, calls: 0, lastRun: 0 };
    this.history = []; this.histIdx = 0;
    this.fx.mask = this.maskState;
    this.fx.person = { ready: false, canvas: this.personCv, history: d => this.historyFrame(d) };
    this.fx.snapshot = this.snap;

    this.running = false;
    this.cameraOn = false;
    this.modelsReady = false;
    this.face = null;
    this.hands = [];
    this.lastVideoTime = -1;
    this.chakra = 100;
    this.lastSealAt = 0;
    this.g = { rasHold: 0, rasPrev: null, kamuiHold: 0, kamuiPrev: null, kamuiCool: 0, thrust: [], shinraCool: 0, winkT: 0, lastFire: 0, winkFired: false, amaCallout: 0 };
    this.trails = [];
    this.recording = null;
    this.training = null;
    this.fpsAcc = { n: 0, t: 0 };
    this.lastT = performance.now();
    this.presetIdx = 0;

    this.ui = new UI(this);
    this.voice = new Voice((action) => this.onVoice(action), (st) => this.onVoiceState(st));
    this.registerVoice();
    this.applySettings(true);
    this.bindStart();
    this.bindKeys();
    this.drawEmblem();
    this.resize(1280, 720);
    requestAnimationFrame(t => this.frame(t));
  }

  /* ───────── Setup ───────── */

  bindStart() {
    $('#btnStart').addEventListener('click', () => this.start(true));
    $('#btnNoCam').addEventListener('click', () => this.start(false));
  }

  async start(withCamera) {
    this.sfx.init();
    this.sfx.setVolume(this.settings.volume);
    document.fonts && Promise.all([document.fonts.load('80px "Yuji Syuku"', '火遁豪火球の術'), document.fonts.load('700 30px "Barlow Condensed"')]).catch(() => {});
    const btn = $('#btnStart');
    btn.disabled = true;
    $('#startError').classList.add('hidden');
    if (withCamera) {
      this.ui.setLoad('camera', 'busy');
      try {
        await this.startCamera(this.settings.cameraId);
        this.ui.setLoad('camera', 'ok');
      } catch (err) {
        console.error(err);
        this.ui.setLoad('camera', 'fail');
        const msg = err && err.name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow camera access in the address bar and try again.'
          : location.protocol === 'file:'
            ? 'Open this app through the local server (start.bat or "npm start"), not as a file.'
            : `Could not start the camera (${err && err.name ? err.name : err}).`;
        $('#startError').textContent = msg;
        $('#startError').classList.remove('hidden');
        btn.disabled = false;
        return;
      }
      this.loadModels();
    }
    $('#startScreen').classList.add('hidden');
    this.running = true;
    this.sfx.activate();
    if (!withCamera) this.ui.toast('Camera off. Try the eye presets, Cast buttons and seal keys 1–0.', false, 4);
  }

  async loadModels() {
    const t = this.tracker;
    this.ui.setLoad('face', 'busy');
    this.ui.setLoad('hand', 'busy');
    const face = t.initFace().then(() => this.ui.setLoad('face', 'ok')).catch(e => { console.error(e); this.ui.setLoad('face', 'fail'); this.loadError = 'Face tracking failed to load. Check your connection and reload.'; });
    const hand = t.initHands().then(() => this.ui.setLoad('hand', 'ok')).catch(e => { console.error(e); this.ui.setLoad('hand', 'fail'); this.loadError = 'Hand tracking failed to load. Check your connection and reload.'; });
    await Promise.all([face, hand]);
    this.modelsReady = true;
    this.ui.setLoad('seg', 'busy');
    t.initSeg().then(() => this.ui.setLoad('seg', 'ok')).catch(e => { console.error(e); this.ui.setLoad('seg', 'fail'); });
  }

  async startCamera(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('getUserMedia unavailable'), { name: 'Unsupported' });
    const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    if (deviceId) video.deviceId = { exact: deviceId }; else video.facingMode = 'user';
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      if (!deviceId || err.name === 'NotAllowedError') throw err;
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    }
    if (this.video.srcObject) this.video.srcObject.getTracks().forEach(tr => tr.stop());
    this.video.srcObject = stream;
    await this.video.play();
    if (this.video.readyState < 2) await new Promise(r => this.video.addEventListener('loadeddata', r, { once: true }));
    this.resize(this.video.videoWidth || 1280, this.video.videoHeight || 720);
    this.cameraOn = true;
    this.lastVideoTime = -1;
    this.faceGeo.reset();
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      this.ui.setCameras(devs, this.settings.cameraId);
    } catch { /* ignore */ }
  }

  resize(w, h) {
    this.W = w; this.H = h;
    for (const c of [this.canvas, this.base, this.personCv, this.snap]) { c.width = w; c.height = h; }
    this.fx.world.W = w; this.fx.world.H = h;
    this.history = Array.from({ length: 16 }, () => makeCanvas(Math.round(w / 2), Math.round(h / 2)));
  }

  /* ───────── Settings ───────── */

  updateSetting(key, value) {
    this.settings[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.applySettings(false, key);
  }

  applySettings(initial, key) {
    const s = this.settings;
    document.getElementById('app').classList.toggle('fit-contain', s.fit === 'contain');
    this.fx.ps.scale = QUALITY_SCALE[s.quality] || 1;
    this.stab.holdMs = s.holdMs;
    this.seq.lenient = s.lenient;
    this.trainer.sensitivity = s.knnSensitivity;
    this.maskState.mirror = s.mirror;
    this.sfx.setVolume(s.volume);
    if (key === 'mirror') { this.faceGeo.reset(); this.maskState.locked = false; this.maskState.votes = 0; }
    if (key === 'voice' || (initial && s.voice)) {
      if (initial) { s.voice = false; this.ui.setVoiceToggle(false); }
      else this.voice.setEnabled(s.voice);
    }
    if (key === 'cameraId' && this.cameraOn) {
      this.startCamera(s.cameraId).catch(e => this.ui.toast('Could not switch camera: ' + e.message, true));
    }
  }

  /* ───────── Voice ───────── */

  registerVoice() {
    for (const j of JUTSUS) this.voice.register(j.voice, { type: 'jutsu', id: j.id });
    for (const a of ABILITIES) this.voice.register(a.voice, { type: 'ability', id: a.id });
    this.voice.register(['mangekyo', 'mangekyou'], { type: 'preset', id: 'itachi' });
    this.voice.register(['sharingan', 'sharing an'], { type: 'preset', id: 'sharingan' });
    this.voice.register(['rinnegan', 'rinne gan'], { type: 'preset', id: 'pain' });
    this.voice.register(['byakugan', 'byaku gan'], { type: 'preset', id: 'hyuga' });
    this.voice.register(['tenseigan'], { type: 'preset', id: 'toneri' });
    this.voice.register(['kai', 'release', 'deactivate'], { type: 'release' });
  }

  onVoice(action) {
    if (!this.running) return;
    if (action.type === 'jutsu') this.castJutsu(action.id, { source: 'voice' });
    else if (action.type === 'ability') this.useAbility(action.id, { source: 'voice' });
    else if (action.type === 'preset') this.applyPreset(action.id);
    else if (action.type === 'release') this.release();
  }

  onVoiceState(st) {
    this.voiceListening = st === 'listening';
    if (st === 'unsupported') { this.ui.toast('Voice commands are not supported in this browser (try Chrome or Edge).', true, 4); this.settings.voice = false; this.ui.setVoiceToggle(false); }
    if (st === 'denied') { this.ui.toast('Microphone permission was denied.', true); this.settings.voice = false; this.ui.setVoiceToggle(false); }
  }

  /* ───────── Eyes ───────── */

  setEye(slot, type) {
    return this.dojutsu.set(slot, type, performance.now());
  }

  afterEyeChange(changed, anyOn) {
    if (changed) { if (anyOn) this.sfx.activate(); else this.sfx.deactivate(); }
    this.enforceAbilityRequirements();
    this.ui.refreshEyes();
  }

  selectEye(type, target) {
    let changed = false;
    if (target === 'both') { changed = this.setEye('left', type) | this.setEye('right', type); }
    else changed = this.setEye(target, type);
    this.afterEyeChange(changed, type !== 'none');
  }

  applyPreset(id) {
    const p = PRESETS.find(x => x.id === id);
    if (!p) return;
    this.presetIdx = PRESETS.indexOf(p);
    const changed = this.setEye('left', p.left) | this.setEye('right', p.right) | this.setEye('third', p.third);
    this.afterEyeChange(changed, [p.left, p.right, p.third].some(x => x !== 'none'));
    if (changed) this.ui.toast(p.name);
  }

  cyclePreset(dir) {
    this.presetIdx = (this.presetIdx + dir + PRESETS.length) % PRESETS.length;
    this.applyPreset(PRESETS[this.presetIdx].id);
  }

  hasFamily(fams) { return this.dojutsu.families().some(f => fams.includes(f)); }

  auraColor() {
    for (const slot of ['right', 'left', 'third']) {
      const d = EYES[this.dojutsu.get(slot)];
      if (d.aura && ['mangekyo', 'eternal', 'rinnegan'].includes(d.family)) return d.aura;
    }
    return '#a35cff';
  }

  sharinganEyeType() {
    for (const slot of ['right', 'left']) {
      const t = this.dojutsu.get(slot);
      if (['mangekyo', 'eternal'].includes(EYES[t].family)) return { type: t, slot };
    }
    return { type: 'ms_itachi', slot: 'right' };
  }

  enforceAbilityRequirements() {
    const sus = this.fx.find(Susanoo);
    if (sus && sus.on) {
      if (!this.hasFamily(ABILITY_MAP.susanoo.requires)) sus.toggleOff();
      else sus.setColor(this.auraColor());
    }
    const bv = this.fx.find(ByakuganSight);
    if (bv && bv.on && !this.hasFamily(ABILITY_MAP.byakuganVision.requires)) bv.toggleOff();
  }

  isAbilityActive(id) {
    if (id === 'susanoo') { const s = this.fx.find(Susanoo); return s && s.on; }
    if (id === 'byakuganVision') { const s = this.fx.find(ByakuganSight); return s && s.on; }
    return false;
  }

  /* ───────── Chakra ───────── */

  spend(cost) {
    if (this.settings.unlimitedChakra || !cost) return true;
    if (this.chakra < cost) {
      this.ui.toast('Not enough chakra! Wait a moment to recover.', true);
      this.sfx.fail();
      return false;
    }
    this.chakra -= cost;
    return true;
  }

  /* ───────── Seals & jutsu ───────── */

  handsCenter() {
    const hs = this.hands;
    if (!hs.length) return { x: this.W / 2, y: this.H * 0.72 };
    return { x: hs.reduce((s, h) => s + h.palm.x, 0) / hs.length, y: hs.reduce((s, h) => s + h.palm.y, 0) / hs.length };
  }

  registerSeal(id, at) {
    const seal = SEAL_MAP[id];
    if (!seal) return;
    const now = performance.now();
    this.lastSealAt = now;
    this.sfx.seal();
    this.fx.add(new SealBurst(this.fx, seal, at || this.handsCenter()));
    this.ui.popSeal();
    const hit = this.seq.push(id, now);
    this.ui.setSequence(this.seq.buffer);
    this.ui.refreshJutsuProgress(this.seq);
    if (hit) this.castJutsu(hit.id, { source: 'seal' });
  }

  castJutsu(id, opts = {}) {
    if (!this.running) return;
    const j = JUTSU_MAP[id];
    if (!j) return;
    const fx = this.fx;
    if (id === 'clone') {
      const c = fx.find(ShadowClones);
      if (c && !c.ending) { c.dispel(); this.ui.toast('Clones dispelled'); return; }
    }
    if (id === 'rasengan') {
      const r = fx.find(Rasengan);
      if (r && !r.ending) { if (!r.shuriken) r.evolve(); else r.release(); return; }
    }
    if (!this.spend(j.cost)) return;
    this.sfx.cast();
    fx.callout({ kanji: j.kanji, title: j.name, sub: j.romaji, color: j.color });
    this.ui.flashJutsu(id);
    switch (id) {
      case 'fireball': fx.add(new Fireball(fx)); break;
      case 'phoenix': fx.add(new PhoenixFlower(fx)); break;
      case 'chidori': { const old = fx.find(Chidori); if (old) old.finish(); fx.add(new Chidori(fx)); break; }
      case 'rasengan': {
        const hand = opts.hand || this.hands.find(h => h.shape === 'O') || this.hands[0] || null;
        fx.add(new Rasengan(fx, hand));
        break;
      }
      case 'clone':
        if (this.cameraOn && !this.tracker.seg) this.ui.toast('Body segmentation is still loading: clones will appear once it is ready.', false, 3.5);
        fx.add(new ShadowClones(fx));
        break;
      case 'summon': fx.add(new Summoning(fx)); break;
      case 'earthwall': fx.add(new EarthWall(fx)); break;
      case 'waterdragon': fx.add(new WaterDragon(fx)); break;
    }
    this.seq.reset();
    this.ui.setSequence(this.seq.buffer);
    this.ui.refreshJutsuProgress(this.seq);
  }

  useAbility(id, opts = {}) {
    if (!this.running) return;
    const a = ABILITY_MAP[id];
    if (!a) return;
    if (!this.hasFamily(a.requires)) {
      this.ui.toast(`${a.name} requires the ${a.requires.map(f => FAMILY_LABEL[f]).join(' or ')}.`, true);
      this.sfx.fail();
      return;
    }
    const fx = this.fx, f = this.face, W = this.W, H = this.H;
    const callout = () => fx.callout({ kanji: a.kanji, title: a.name, color: EYES[this.sharinganEyeType().type].glow || '#e0312b' });
    switch (id) {
      case 'susanoo': {
        const s = fx.find(Susanoo);
        if (s && s.on) { s.toggleOff(); break; }
        if (s) s.finish();
        fx.add(new Susanoo(fx, this.auraColor()));
        if (this.cameraOn && !this.tracker.seg) this.ui.toast('Body segmentation is still loading: the aura will wrap your body once ready.', false, 3.5);
        fx.callout({ kanji: a.kanji, title: a.name, color: this.auraColor() });
        break;
      }
      case 'byakuganVision': {
        const s = fx.find(ByakuganSight);
        if (s && s.on) { s.toggleOff(); break; }
        if (s) s.finish();
        fx.add(new ByakuganSight(fx));
        break;
      }
      case 'tsukuyomi': {
        if (fx.has(Tsukuyomi)) return;
        if (!this.spend(a.cost)) return;
        const { type, slot } = this.sharinganEyeType();
        const origin = f ? f[slot].iris : { x: W / 2, y: H / 2 };
        fx.add(new Tsukuyomi(fx, type, { x: origin.x, y: origin.y }));
        callout();
        break;
      }
      case 'amaterasu': {
        if (!this.spend(a.cost)) return;
        const ama = fx.find(Amaterasu) || fx.add(new Amaterasu(fx));
        const scale = f ? f.faceW * 0.55 : W * 0.1;
        const target = opts.at || (f ? f.gaze : null);
        if (target) ama.ignite(target.x, target.y, scale);
        else for (let i = 0; i < 3; i++) ama.ignite(rand(W * 0.2, W * 0.8), rand(H * 0.45, H * 0.85), scale);
        if (f) ama.bleed(opts.side || this.sharinganEyeType().slot);
        this.sfx.blackFlame();
        callout();
        break;
      }
      case 'kamui': {
        if (fx.has(Kamui)) return;
        if (!this.spend(a.cost)) return;
        const p = opts.at || (f ? f.gaze : { x: W / 2, y: H / 2 });
        fx.add(new Kamui(fx, p.x, p.y));
        callout();
        break;
      }
      case 'shinra': {
        if (!this.spend(a.cost)) return;
        const o = opts.at || (f ? { x: f.chin.x, y: f.chin.y + f.faceH * 0.5 } : { x: W / 2, y: H / 2 });
        fx.add(new ShinraTensei(fx, o));
        fx.callout({ kanji: a.kanji, title: a.name, color: '#b48cff' });
        break;
      }
      case 'infinite': {
        if (fx.has(InfiniteTsukuyomi)) return;
        if (!this.spend(a.cost)) return;
        fx.add(new InfiniteTsukuyomi(fx));
        fx.callout({ kanji: a.kanji, title: a.name, color: '#ff2a4a' });
        break;
      }
    }
    this.ui.refreshAbilities();
  }

  release() {
    this.fx.clearAll();
    this.seq.reset();
    this.ui.setSequence(this.seq.buffer);
    this.ui.refreshJutsuProgress(this.seq);
    this.ui.refreshAbilities();
    this.fx.callout({ kanji: '解', title: 'Kai — Release', color: '#d6b26e', dur: 1.6 });
    this.sfx.deactivate();
  }

  /* ───────── Per-frame gesture logic ───────── */

  processSeals(now) {
    const hs = this.hands;
    const needFeat = this.training || (this.settings.sealMode !== 'rules' && this.trainer.total);
    const feat = needFeat && hs.length ? featurize(hs) : null;
    let label = null, knn = null;
    if (feat && this.settings.sealMode !== 'rules') knn = this.trainer.classify(feat);
    if (knn && knn.confident) label = knn.id === 'idle' ? null : knn.id;
    else if (this.settings.sealMode !== 'trained') label = classifyRules(hs);

    if (this.training) this.trainingStep(feat, now);
    else {
      const reg = this.stab.update(label, now);
      if (reg) this.registerSeal(reg, this.handsCenter());
    }
    const idle = hs.length === 0 ? 'Raise both hands to form a seal'
      : hs.length === 1 ? 'Bring your second hand into view'
        : 'Hold a seal until the ring fills';
    this.ui.setSealLive(this.stab.candidate, this.stab.progress, idle);
    const name = id => (id === 'idle' ? 'Idle' : SEAL_MAP[id] ? SEAL_MAP[id].name : id);
    if (knn) this.ui.setTrainerLive(knn.confident ? name(knn.id) : (label ? name(label) : '—'), `k-NN: ${name(knn.id)} · ${(knn.confidence * 100) | 0}% · d=${knn.distance.toFixed(2)}`);
    else this.ui.setTrainerLive(label ? name(label) : '—', hs.length ? 'easy-seal rules' : 'no hands');

    if (this.stab.candidate !== 'none') {
      const c = this.handsCenter();
      for (let i = this.fx.ps.count(45, 1 / 60); i > 0; i--) {
        const a = rand(0, Math.PI * 2), r = rand(20, 70);
        this.fx.ps.emit({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, vx: rand(-20, 20), vy: rand(-90, -30), life: rand(0.4, 0.8), size: rand(8, 18), sprite: this.fx.spr.chakra, alpha: 0.6 });
      }
    }
    if (this.seq.expired(now)) { this.seq.reset(); this.ui.setSequence([]); this.ui.refreshJutsuProgress(this.seq); }
  }

  processGestures(now, dt) {
    const g = this.g, hs = this.hands, f = this.face, fx = this.fx;
    if (!this.settings.gestures || this.training) return;
    const sinceSeal = now - this.lastSealAt;
    const quiet = this.stab.candidate === 'none' && sinceSeal > 1200;

    // Rasengan: a single open palm held steady.
    if (!fx.has(Rasengan) && quiet && hs.length === 1 && hs[0].shape === 'O') {
      const h = hs[0];
      const motion = g.rasPrev ? Math.hypot(h.palm.x - g.rasPrev.x, h.palm.y - g.rasPrev.y) / h.size : 0;
      g.rasPrev = { ...h.palm };
      g.rasHold = motion < 0.09 ? g.rasHold + dt : Math.max(0, g.rasHold - dt * 2);
      if (g.rasHold > 0.12) fx.ring(h.palm.x, h.palm.y, h.size * 1.15, (g.rasHold - 0.12) / 0.9, '#4aa8ff');
      if (g.rasHold > 1.02) { g.rasHold = 0; this.castJutsu('rasengan', { source: 'gesture', hand: h }); }
    } else { g.rasHold = 0; g.rasPrev = null; }

    // Kamui: Mangekyō + one pointing index finger held still.
    g.kamuiCool -= dt;
    if (this.hasFamily(['mangekyo', 'eternal']) && quiet && hs.length === 1 && hs[0].shape === '1' && g.kamuiCool <= 0 && !fx.has(Kamui)) {
      const h = hs[0];
      const motion = g.kamuiPrev ? Math.hypot(h.tip.x - g.kamuiPrev.x, h.tip.y - g.kamuiPrev.y) / h.size : 0;
      g.kamuiPrev = { ...h.tip };
      g.kamuiHold = motion < 0.1 ? g.kamuiHold + dt : Math.max(0, g.kamuiHold - dt * 2);
      if (g.kamuiHold > 0.15) fx.ring(h.tip.x, h.tip.y, h.size * 0.6, (g.kamuiHold - 0.15) / 0.85, '#b48cff');
      if (g.kamuiHold > 1.0) { g.kamuiHold = 0; g.kamuiCool = 3.5; this.useAbility('kamui', { at: { x: h.tip.x, y: h.tip.y } }); }
    } else { g.kamuiHold = 0; g.kamuiPrev = null; }

    // Shinra Tensei: Rinnegan + open palm thrust toward the camera (it grows fast).
    g.shinraCool -= dt;
    const open = hs.filter(h => h.shape === 'O');
    if (this.hasFamily(['rinnegan', 'rinne']) && open.length) {
      const h = open.reduce((a, b) => (b.size > a.size ? b : a));
      g.thrust.push({ t: now, s: h.size });
      while (g.thrust.length && now - g.thrust[0].t > 320) g.thrust.shift();
      if (g.shinraCool <= 0 && g.thrust.length > 3 && h.size / g.thrust[0].s > 1.32) {
        g.shinraCool = 3;
        g.thrust = [];
        this.useAbility('shinra', { at: { ...h.palm } });
      }
    } else g.thrust = [];

    // Amaterasu: Mangekyō + wink one eye; black flames ignite where you look.
    if (f && this.hasFamily(['mangekyo', 'eternal'])) {
      const l = f.left.aperture, r = f.right.aperture;
      const mx = Math.max(l, r), mn = Math.min(l, r);
      const wink = mx > 0.17 && mn < mx * 0.5 && mn < 0.13;
      g.winkT = wink ? g.winkT + dt : 0;
      if (g.winkT > 0.08) this.drawReticle = { x: f.gaze.x, y: f.gaze.y, p: clamp(g.winkT / 0.3) };
      if (g.winkT > 0.3) {
        if (now - g.lastFire > 200) {
          g.lastFire = now;
          const side = l > r ? 'left' : 'right';
          if (!g.winkFired) {
            g.winkFired = true;
            if (!this.spend(ABILITY_MAP.amaterasu.cost)) { g.winkT = -2; return; }
            const ama = fx.find(Amaterasu) || fx.add(new Amaterasu(fx));
            ama.bleed(side);
            this.sfx.blackFlame();
            if (now - g.amaCallout > 5000) { g.amaCallout = now; fx.callout({ kanji: '天照', title: 'Amaterasu', color: '#8c1450' }); }
          }
          const ama = fx.find(Amaterasu) || fx.add(new Amaterasu(fx));
          ama.ignite(f.gaze.x + rand(-10, 10), f.gaze.y + rand(-10, 10), f.faceW * 0.5);
        }
      } else if (!wink) g.winkFired = false;
    } else g.winkT = 0;
  }

  /* ───────── Seal trainer ───────── */

  recordSeal(id) {
    if (this.training) return;
    if (!this.cameraOn) { this.ui.setTrainerStatus('Start the camera first.'); return; }
    const name = id === 'idle' ? 'Idle' : SEAL_MAP[id].name;
    this.training = { id, name, start: performance.now() + 3000, end: performance.now() + 6000, n: 0 };
  }

  trainingStep(feat, now) {
    const tr = this.training;
    if (now < tr.start) {
      this.ui.setTrainerStatus(`Get ready: ${tr.name} in ${Math.ceil((tr.start - now) / 1000)}…`, true);
      return;
    }
    if (now < tr.end) {
      if (feat && tr.n < 120) { this.trainer.add(tr.id, feat); tr.n++; }
      this.ui.setTrainerStatus(`Recording ${tr.name}… ${tr.n} samples (hold & move slightly)`, true);
      return;
    }
    this.training = null;
    this.trainer.recompute();
    const saved = this.trainer.save();
    this.ui.refreshTrainer();
    this.ui.refreshSealGuide();
    this.ui.setTrainerStatus(tr.n ? `Recorded ${tr.n} samples for ${tr.name}.${saved ? '' : ' (Could not save to browser storage.)'}` : 'No hands were detected. Try again with your hands in frame.');
    this.sfx.seal();
  }

  exportSamples() {
    download(new Blob([this.trainer.export()], { type: 'application/json' }), `shinobi-ar-seals-${stamp()}.json`);
  }

  /* ───────── Capture ───────── */

  screenshot() {
    this.canvas.toBlob(b => b && download(b, `shinobi-ar-${stamp()}.png`), 'image/png');
    this.fx.flash('#ffffff', 0.5, 4);
    this.sfx.seal();
  }

  toggleRecord() {
    if (this.recording) { this.recording.rec.stop(); return; }
    if (!window.MediaRecorder) { this.ui.toast('Recording is not supported in this browser.', true); return; }
    const stream = this.canvas.captureStream(30);
    if (this.sfx.recDest) this.sfx.recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks = [];
    rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      download(new Blob(chunks, { type }), `shinobi-ar-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
      this.recording = null;
      this.ui.setRecording(false);
      this.ui.toast('Recording saved');
    };
    rec.start(250);
    this.recording = { rec, start: performance.now() };
    this.ui.setRecording(true, '0:00');
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
  }

  /* ───────── Keyboard ───────── */

  bindKeys() {
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.ui.closeAll(); return; }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'g') { this.ui.isOpen('guideModal') ? this.ui.closeModal('guideModal') : this.ui.openModal('guideModal'); return; }
      if (!this.running || this.ui.anyModalOpen()) return;
      const seal = SEALS.find(s => s.key === k);
      if (seal) { this.registerSeal(seal.id); return; }
      const ab = ABILITIES.find(a => a.key === k);
      if (ab) { this.useAbility(ab.id, { source: 'key' }); return; }
      switch (k) {
        case 'e': this.cyclePreset(e.shiftKey ? -1 : 1); break;
        case ' ': e.preventDefault(); this.castJutsu('rasengan', { source: 'key' }); break;
        case 'x': this.release(); break;
        case 'p': this.screenshot(); break;
        case 'r': this.toggleRecord(); break;
        case 'f': this.toggleFullscreen(); break;
        case 'h': document.getElementById('app').classList.toggle('ui-hidden'); break;
      }
    });
  }

  /* ───────── Segmentation mask ───────── */

  onMask(data, mw, mh) {
    const ms = this.maskState;
    const step = Math.max(1, Math.round(mw / 256));
    const ow = Math.floor(mw / step), oh = Math.floor(mh / step);
    if (this.maskCv.width !== ow || this.maskCv.height !== oh || !this.maskImg) {
      this.maskCv.width = ow; this.maskCv.height = oh;
      this.maskImg = this.mctx.createImageData(ow, oh);
    }
    // Work out once whether the model reports "person" or "background" confidence.
    if (!ms.locked && this.faceGeo.raw) {
      const n = this.faceGeo.raw[1];
      const sx = Math.min(mw - 1, Math.max(0, Math.round(n.x * mw))), sy = Math.min(mh - 1, Math.max(0, Math.round(n.y * mh)));
      ms.votes += data[sy * mw + sx] > 0.5 ? 1 : -1;
      if (Math.abs(ms.votes) >= 8) { ms.invert = ms.votes < 0; ms.locked = true; }
    }
    const d = this.maskImg.data, inv = ms.invert;
    for (let y = 0; y < oh; y++) {
      const row = y * step * mw;
      for (let x = 0; x < ow; x++) {
        let v = data[row + x * step];
        if (inv) v = 1 - v;
        const a = v <= 0.3 ? 0 : v >= 0.7 ? 255 : ((v - 0.3) / 0.4) * 255;
        const i = (y * ow + x) * 4;
        d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a;
      }
    }
    this.mctx.putImageData(this.maskImg, 0, 0);
    if (ms.calls++ % 3 === 0) {
      const edges = [];
      const s = 3;
      for (let y = s; y < oh - s; y += s) {
        for (let x = s; x < ow - s; x += s) {
          const i = (y * ow + x) * 4 + 3;
          if (d[i] < 128) continue;
          if (d[i - s * 4] < 128 || d[i + s * 4] < 128 || d[i - s * ow * 4] < 128 || d[i + s * ow * 4] < 128) {
            const nx = x / ow;
            edges.push({ x: (ms.mirror ? 1 - nx : nx) * this.W, y: (y / oh) * this.H });
          }
        }
      }
      ms.edges = edges;
    }
    ms.ready = true;
    ms.lastRun = performance.now();
  }

  historyFrame(delay) {
    const n = this.history.length;
    return this.history[(this.histIdx - delay + n * 4) % n];
  }

  /* ───────── Frame loop ───────── */

  frame(t) {
    requestAnimationFrame(tt => this.frame(tt));
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    if (!this.running) return;
    try {
      this.step(t, dt);
    } catch (err) {
      console.error(err);
    }
  }

  step(now, dt) {
    const { W, H, fx } = this;
    const mirror = this.settings.mirror;

    // 1. Tracking
    if (this.cameraOn && this.modelsReady && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const wantSeg = fx.needsSeg() && !!this.tracker.seg;
      if (fx.needsSeg() && !this.tracker.segLoading) this.tracker.initSeg();
      const r = this.tracker.detect(this.video, wantSeg, (d, w, h) => this.onMask(d, w, h));
      if (!wantSeg) this.maskState.ready = false;
      this.face = r.face ? this.faceGeo.update(r.face, W, H, mirror) : (this.faceGeo.reset(), null);
      this.hands = (r.hands || []).map(h => analyzeHand(h, W, H, mirror));
      fx.world.face = this.face;
      fx.world.hands = this.hands;
      this.processSeals(now);
      this.processGestures(now, dt);
    } else if (!this.cameraOn) {
      this.ui.setSealLive(null, 0, 'Camera off: press 1–0, −, = to enter seals');
    }

    // 2. Simulation
    fx.update(dt);
    this.chakra = Math.min(100, this.chakra + dt * 9);

    // 3. Base frame (video + world filters)
    const b = this.bctx;
    b.save();
    if (this.cameraOn) {
      if (mirror) { b.translate(W, 0); b.scale(-1, 1); }
      b.drawImage(this.video, 0, 0, W, H);
    } else this.drawDemoBackground(b, now);
    b.restore();
    const modes = fx.modes();
    for (const [name, k] of Object.entries(modes)) {
      if (k <= 0.001) continue;
      const def = MODE_DEF[name];
      b.save();
      b.globalAlpha = k;
      b.filter = def.filter;
      if (this.cameraOn) {
        if (mirror) { b.translate(W, 0); b.scale(-1, 1); }
        b.drawImage(this.video, 0, 0, W, H);
      } else b.drawImage(this.base, 0, 0);
      b.restore();
      b.save();
      b.globalAlpha = k;
      b.globalCompositeOperation = def.blend;
      b.fillStyle = def.tint;
      b.fillRect(0, 0, W, H);
      b.restore();
    }

    // 4. Compose
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    if (fx.shakeAmt > 0.3) {
      const a = fx.shakeAmt;
      ctx.translate(W / 2 + rand(-a, a), H / 2 + rand(-a, a));
      ctx.scale(1 + a * 0.0012, 1 + a * 0.0012);
      ctx.translate(-W / 2, -H / 2);
    }
    ctx.drawImage(this.base, 0, 0);

    const personReady = this.maskState.ready && this.cameraOn;
    fx.person.ready = personReady;
    if (fx.hasBack()) {
      if (personReady) {
        const p = this.pctx;
        p.globalCompositeOperation = 'source-over';
        p.clearRect(0, 0, W, H);
        p.drawImage(this.base, 0, 0);
        p.globalCompositeOperation = 'destination-in';
        p.save();
        if (mirror) { p.translate(W, 0); p.scale(-1, 1); }
        p.drawImage(this.maskCv, 0, 0, W, H);
        p.restore();
        p.globalCompositeOperation = 'source-over';
        if (fx.wantsHistory()) {
          this.histIdx = (this.histIdx + 1) % this.history.length;
          const hc = this.history[this.histIdx], hx = hc.getContext('2d');
          hx.clearRect(0, 0, hc.width, hc.height);
          hx.drawImage(this.personCv, 0, 0, hc.width, hc.height);
        }
      }
      fx.drawBack(ctx);
      if (personReady) ctx.drawImage(this.personCv, 0, 0);
    }

    this.dojutsu.render(ctx, this.face, now, dt);
    if (this.hasFamily(SHARINGAN_FAMS)) this.drawTrails(ctx, now);

    if (fx.effects.length) this.sctx.drawImage(this.canvas, 0, 0);
    fx.draw(ctx);
    fx.drawParticles(ctx);
    if (this.settings.showLandmarks) this.drawLandmarks(ctx);
    if (this.drawReticle) { this.renderReticle(ctx, this.drawReticle); this.drawReticle = null; }
    fx.drawTop(ctx);
    ctx.restore();
    fx.drawScreen(ctx);

    // 5. HUD
    this.updateHud(now, dt);
  }

  drawDemoBackground(b, now) {
    const { W, H } = this;
    const g = b.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.6);
    g.addColorStop(0, '#1e1a17');
    g.addColorStop(1, '#0c0b0a');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    // A pair of eyes so dōjutsu presets can be previewed without a camera.
    const L = this.dojutsu.get('left'), R = this.dojutsu.get('right');
    const r = H * 0.09;
    [[W / 2 - r * 1.6, L], [W / 2 + r * 1.6, R]].forEach(([x, type]) => {
      b.save();
      b.translate(x, H * 0.45);
      b.beginPath();
      b.moveTo(-r * 1.4, 0);
      b.quadraticCurveTo(0, -r * 1.25, r * 1.4, 0);
      b.quadraticCurveTo(0, r * 1.25, -r * 1.4, 0);
      b.closePath();
      b.save();
      b.clip();
      const def = EYES[type];
      b.fillStyle = def.fullEye ? def.sclera : '#efe7dc';
      b.fillRect(-r * 2, -r * 2, r * 4, r * 4);
      const rr = r * 0.82 * (def.scale || 1);
      b.rotate(now / 1000 * this.dojutsu.params.spin * (def.family === 'byakugan' ? 0 : 1));
      b.drawImage(patternCanvas(type), -rr, -rr, rr * 2, rr * 2);
      b.restore();
      b.lineWidth = 4;
      b.strokeStyle = '#120806';
      b.stroke();
      b.restore();
    });
    const T = this.dojutsu.get('third');
    if (T !== 'none') {
      const def = EYES[T], L = r * 1.5, w = r * 0.55;
      b.save();
      b.translate(W / 2, H * 0.45 - r * 2.1);
      b.beginPath();
      b.moveTo(0, -L / 2);
      b.quadraticCurveTo(w * 1.25, 0, 0, L / 2);
      b.quadraticCurveTo(-w * 1.25, 0, 0, -L / 2);
      b.closePath();
      b.save();
      b.clip();
      b.fillStyle = def.fullEye ? def.sclera : '#efe7dc';
      b.fillRect(-w * 2, -L, w * 4, L * 2);
      const rr = L * 0.4;
      b.drawImage(patternCanvas(T), -rr, -rr, rr * 2, rr * 2);
      b.restore();
      b.lineWidth = 3;
      b.strokeStyle = '#120806';
      b.stroke();
      b.restore();
    }
  }

  drawTrails(ctx, now) {
    for (const h of this.hands) for (const i of [4, 8, 12, 16, 20]) this.trails.push({ x: h.pts[i].x, y: h.pts[i].y, t: now });
    this.trails = this.trails.filter(p => now - p.t < 320);
    if (!this.trails.length) return;
    const spr = glowSprite('#ff2a2a', 32, 0.3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.trails) {
      const k = 1 - (now - p.t) / 320;
      ctx.globalAlpha = k * 0.35;
      const s = 14 * k + 4;
      ctx.drawImage(spr, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  renderReticle(ctx, r) {
    const s = Math.min(this.W, this.H) * 0.05;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.strokeStyle = `rgba(200,20,60,${0.4 + 0.5 * r.p})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2 * r.p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 1.4, 0); ctx.lineTo(-s * 0.5, 0);
    ctx.moveTo(s * 1.4, 0); ctx.lineTo(s * 0.5, 0);
    ctx.moveTo(0, -s * 1.4); ctx.lineTo(0, -s * 0.5);
    ctx.moveTo(0, s * 1.4); ctx.lineTo(0, s * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  drawLandmarks(ctx) {
    ctx.save();
    for (const h of this.hands) {
      ctx.strokeStyle = 'rgba(94,224,138,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(h.pts[a].x, h.pts[a].y); ctx.lineTo(h.pts[b].x, h.pts[b].y); }
      ctx.stroke();
      ctx.fillStyle = '#fff';
      for (const p of h.pts) ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.font = '600 16px "Barlow Condensed", sans-serif';
      ctx.fillStyle = '#5ee08a';
      ctx.fillText(h.token, h.palm.x + h.size * 0.6, h.palm.y);
    }
    const f = this.face;
    if (f) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < f.pts.length; i += 3) ctx.fillRect(f.pts[i].x - 1, f.pts[i].y - 1, 2, 2);
      ctx.strokeStyle = 'rgba(94,224,138,0.9)';
      for (const e of [f.left, f.right]) {
        ctx.beginPath();
        ctx.arc(e.iris.x, e.iris.y, e.irisR, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const idx of [FACE_IDX.leftEyePoly, FACE_IDX.rightEyePoly]) {
        ctx.beginPath();
        idx.forEach((i, k) => (k ? ctx.lineTo(f.pts[i].x, f.pts[i].y) : ctx.moveTo(f.pts[i].x, f.pts[i].y)));
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  updateHud(now, dt) {
    const a = this.fpsAcc;
    a.n++; a.t += dt;
    if (a.t >= 0.5) {
      const fps = Math.round(a.n / a.t);
      a.n = 0; a.t = 0;
      this.updateStatus(fps);
      this.ui.refreshAbilities();
      if (this.recording) {
        const s = Math.floor((now - this.recording.start) / 1000);
        this.ui.setRecording(true, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      }
    }
    this.ui.setChakra(this.chakra);
    const hands = this.cameraOn && this.modelsReady && this.hands.length
      ? [...this.hands].sort((p, q) => p.palm.x - q.palm.x).map(describeHand).join('   ') : '';
    this.ui.setHandsDebug(hands ? `Reading: ${hands}` : '', this.settings.showHandDebug);
    this.ui.setSequence(this.seq.buffer);
  }

  /** One line in the top bar that says what the tracker is doing right now. */
  updateStatus(fps) {
    const voice = this.voiceListening ? ' · listening' : '';
    if (!this.cameraOn) return this.ui.setStatus('Preview · camera off' + voice, '');
    if (this.loadError) return this.ui.setStatus(this.loadError, 'error');
    if (!this.modelsReady) return this.ui.setStatus('Loading face and hand tracking…', 'busy');
    const n = this.hands.length;
    const handTxt = n === 0 ? 'no hands' : n === 1 ? '1 hand' : '2 hands';
    if (!this.face) return this.ui.setStatus(`Looking for your face · ${handTxt} · ${fps} fps${voice}`, 'warn');
    this.ui.setStatus(`Eyes tracked · ${handTxt} · ${fps} fps${voice}`, 'ok');
  }

  drawEmblem() {
    const c = $('#emblem');
    const x = c.getContext('2d');
    let a = 0;
    const draw = () => {
      if ($('#startScreen').classList.contains('hidden')) return;
      a += 0.012;
      x.clearRect(0, 0, 192, 192);
      x.save();
      x.translate(96, 96);
      x.rotate(a);
      x.drawImage(patternCanvas('ms_itachi'), -92, -92, 184, 184);
      x.restore();
      requestAnimationFrame(draw);
    };
    draw();
  }
}

window.shinobi = new App();
