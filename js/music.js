// Character songs. The app ships no music: you can attach a song file you own to each character,
// and it plays when you wear that character's eyes. Files stay in this browser (IndexedDB) and are
// never uploaded.

/** Characters that can have a song, in display order. */
export const THEMES = {
  sharingan: { name: 'Sharingan' },
  itachi: { name: 'Itachi' },
  sasuke: { name: 'Sasuke' },
  kakashi: { name: 'Kakashi' },
  obito: { name: 'Obito' },
  shisui: { name: 'Shisui' },
  madara: { name: 'Madara' },
  pain: { name: 'Pain' },
  hyuga: { name: 'Hyūga' },
  kaguya: { name: 'Kaguya' },
  toneri: { name: 'Toneri' },
};
export const THEME_ORDER = Object.keys(THEMES);

const PRESET_THEME = {
  sharingan: 'sharingan', itachi: 'itachi', sasuke: 'sasuke', sasuke_ems: 'sasuke', sasuke_rinne: 'sasuke',
  kakashi: 'kakashi', obito: 'obito', shisui: 'shisui', madara: 'madara', madara_sp: 'madara', pain: 'pain',
  hyuga: 'hyuga', kaguya: 'kaguya', toneri: 'toneri', hybrid: 'sharingan',
};
const FAMILY_THEME = { eternal: 'sasuke', mangekyo: 'itachi', rinne: 'madara', rinnegan: 'pain', tenseigan: 'toneri', byakugan: 'hyuga', sharingan: 'sharingan' };
const FAMILY_RANK = ['eternal', 'mangekyo', 'rinne', 'rinnegan', 'tenseigan', 'byakugan', 'sharingan'];

/** Which character the current eyes belong to: a matching preset wins, otherwise the strongest eye family. */
export function themeFor(presetId, families) {
  if (presetId && PRESET_THEME[presetId]) return PRESET_THEME[presetId];
  for (const fam of FAMILY_RANK) if (families.includes(fam)) return FAMILY_THEME[fam];
  return null;
}

/** Plays the person's own song for a character: looped, faded, routed through the master mix so recordings include it. */
export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.volume = 0.45;
    this.sig = null;
    this.voice = null;
  }

  get ctx() { return this.sfx.ctx; }

  ensureBus() {
    if (this.bus || !this.ctx) return !!this.bus;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = this.volume;
    this.bus.connect(this.sfx.master);
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.bus) this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** Play a song blob for a character; with no blob, fade out whatever is playing. */
  play(key, blob) {
    const sig = key && blob ? `${key}|${blob.size}` : null;
    if (sig === this.sig) return;
    this.sig = sig;
    this.stopVoice(1.2);
    if (!sig || !this.ensureBus()) return;
    this.voice = this.startSong(blob);
  }

  stop() { this.sig = null; this.stopVoice(1.0); }

  stopVoice(fade) {
    const v = this.voice;
    this.voice = null;
    if (!v) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => v.stop(), fade * 1000 + 100);
  }

  startSong(blob) {
    const ctx = this.ctx;
    const url = URL.createObjectURL(blob);
    const el = new Audio();
    el.src = url;
    el.loop = true;
    const src = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5);
    src.connect(gain).connect(this.bus);
    el.play().catch(err => console.warn('song could not play', err));
    return {
      gain,
      stop: () => { el.pause(); el.removeAttribute('src'); el.load(); src.disconnect(); URL.revokeObjectURL(url); },
    };
  }
}

/* ───────── Your own songs (IndexedDB) ───────── */

export class SongStore {
  constructor() { this.dbp = null; }

  db() {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
        const req = indexedDB.open('shinobi-ar', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('songs');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbp;
  }

  async tx(mode, fn) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const t = db.transaction('songs', mode);
      const req = fn(t.objectStore('songs'));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  get(key) { return this.tx('readonly', s => s.get(key)).catch(() => undefined); }
  set(key, file) { return this.tx('readwrite', s => s.put({ name: file.name, type: file.type, blob: file }, key)); }
  remove(key) { return this.tx('readwrite', s => s.delete(key)); }

  async names() {
    const out = {};
    for (const k of THEME_ORDER) {
      const v = await this.get(k);
      if (v) out[k] = v.name;
    }
    return out;
  }
}
