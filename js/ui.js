// DOM side of the app: rails, seal readout, mix sheet, modals, settings and the seal trainer.

import { SEALS, SEAL_MAP, JUTSUS, EYES, EYE_ORDER, PRESETS, ABILITIES, FAMILY_LABEL } from './config.js';
import { drawEyeIcon } from './dojutsu.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
};

const LOAD_TEXT = { busy: 'Loading…', ok: 'Ready', fail: 'Failed' };

export class UI {
  constructor(app) {
    this.app = app;
    this.trainerSel = null;
    this.lastSeq = '';
    this.buildPresets();
    this.buildMixSheet();
    this.buildAbilities();
    this.buildJutsuList();
    this.buildSealGuide();
    this.buildTrainer();
    this.bindTuning();
    this.bindModals();
    this.bindSettings();
    this.bindTopbar();
    this.refreshEyes();
  }

  /* ───────── Eyes rail ───────── */
  buildPresets() {
    const list = $('#presetList');
    for (const p of PRESETS) {
      const r = h('canvas', { width: 20, height: 20 }), l = h('canvas', { width: 20, height: 20 });
      const title = `Left: ${EYES[p.left].name} · Right: ${EYES[p.right].name}${p.third !== 'none' ? ` · Third: ${EYES[p.third].name}` : ''}`;
      list.append(h('li', {}, h('button', { class: 'preset', 'data-id': p.id, title, onclick: () => this.app.applyPreset(p.id) },
        h('span', { class: 'pair' }, l, r), h('span', {}, p.name))));
      // On a mirrored camera the user's left eye is on the left of the screen, so draw it first.
      requestAnimationFrame(() => { drawEyeIcon(l, p.left, { sclera: false }); drawEyeIcon(r, p.right, { sclera: false }); });
    }
    $('#btnMix').addEventListener('click', () => this.toggleMix());
  }

  toggleMix(force) {
    const sheet = $('#mixSheet');
    const open = force ?? sheet.classList.contains('hidden');
    sheet.classList.toggle('hidden', !open);
    if (open) this.refreshEyes();
  }

  buildMixSheet() {
    const body = $('#mixBody');
    for (const id of EYE_ORDER) {
      const def = EYES[id];
      const cv = h('canvas', { width: 42, height: 28 });
      const fam = def.family === 'none' ? 'your own eyes' : (def.who || null);
      const pick = slot => h('td', { class: 'pick' }, h('button', {
        class: 'pick-btn', 'data-slot': slot, 'data-id': id, 'aria-pressed': 'false',
        'aria-label': `${def.name} in ${slot} eye`, title: `${slot[0].toUpperCase() + slot.slice(1)} eye`,
        onclick: () => this.app.selectEye(id, slot),
      }));
      body.append(h('tr', {},
        h('td', { class: 'icon' }, cv),
        h('td', {}, h('button', { class: 'mix-name', title: 'Put in both eyes', onclick: () => this.app.selectEye(id, 'both') }, def.name, fam && h('small', {}, fam))),
        pick('left'), pick('right'), pick('third')));
      requestAnimationFrame(() => drawEyeIcon(cv, id));
    }
    $('[data-close-sheet]').addEventListener('click', () => this.toggleMix(false));
  }

  refreshEyes() {
    const d = this.app.dojutsu;
    const cur = { left: d.get('left'), right: d.get('right'), third: d.get('third') };
    $$('#mixBody .pick-btn').forEach(b => b.setAttribute('aria-pressed', String(cur[b.dataset.slot] === b.dataset.id)));
    $$('#presetList .preset').forEach(b => {
      const p = PRESETS.find(x => x.id === b.dataset.id);
      b.classList.toggle('on', p.left === cur.left && p.right === cur.right && p.third === cur.third);
    });
    this.refreshAbilities();
  }

  buildAbilities() {
    const list = $('#abilityList');
    for (const a of ABILITIES) {
      list.append(h('li', { 'data-id': a.id }, h('button', { class: 'ability', title: `${a.kanji} · ${a.name}: ${a.how} (key ${a.key.toUpperCase()})`, onclick: () => this.app.useAbility(a.id, { source: 'button' }) },
        h('span', { class: 'kj' }, a.kanji.slice(0, 2)),
        h('span', { class: 'n' }, a.name),
        h('span', { class: 'h' }, a.how),
        h('kbd', {}, a.key.toUpperCase()))));
    }
  }

  refreshAbilities() {
    const fams = this.app.dojutsu.families();
    let shown = 0;
    $$('#abilityList li').forEach(li => {
      const a = ABILITIES.find(x => x.id === li.dataset.id);
      const ok = a.requires.some(f => fams.includes(f));
      li.classList.toggle('hidden', !ok);
      li.firstChild.classList.toggle('active', !!this.app.isAbilityActive(a.id));
      if (ok) shown++;
    });
    const note = $('#abilityNote');
    const text = shown ? '' : 'Choose a Mangekyō, Rinnegan, Rinne-Sharingan or Byakugan to unlock abilities.';
    if (note.textContent !== text) note.textContent = text;
  }

  bindTuning() {
    const p = this.app.dojutsu.params;
    for (const [id, key] of [['eyeSize', 'size'], ['eyeGlow', 'glow'], ['eyeSpin', 'spin'], ['eyeOpacity', 'opacity']]) {
      const input = $('#' + id), out = input.parentElement.querySelector('output');
      input.value = p[key];
      const sync = () => { p[key] = parseFloat(input.value); out.textContent = Math.round(p[key] * 100) + '%'; };
      input.addEventListener('input', sync);
      sync();
    }
  }

  /* ───────── Jutsu rail ───────── */
  buildJutsuList() {
    const list = $('#jutsuList');
    for (const j of JUTSUS) {
      const detail = j.seals.length
        ? h('div', { class: 'jutsu-seals', 'aria-label': 'Seals: ' + j.seals.map(s => SEAL_MAP[s].name).join(', ') },
          j.seals.map(s => h('span', { title: SEAL_MAP[s].name }, SEAL_MAP[s].kanji)))
        : h('div', { class: 'jutsu-gesture' }, j.gesture);
      list.append(h('li', { class: 'jutsu', 'data-id': j.id, title: `${j.kanji} · ${j.romaji}` },
        h('div', { class: 'jutsu-line' },
          h('span', { class: 'jutsu-name' }, j.name),
          h('button', { class: 'cast-btn', title: 'Cast now, without seals', onclick: () => this.app.castJutsu(j.id, { source: 'button' }) }, 'Cast')),
        detail));
    }
    $('#btnSealGuide').addEventListener('click', () => { this.openModal('guideModal'); this.showGuideTab('seals'); });
  }

  refreshJutsuProgress(seq) {
    for (const el of $$('#jutsuList .jutsu')) {
      const j = JUTSUS.find(x => x.id === el.dataset.id);
      if (!j.seals.length) continue;
      const k = seq.buffer.length ? seq.progress(j.seals) : 0;
      $$('.jutsu-seals span', el).forEach((t, i) => { t.classList.toggle('done', i < k); t.classList.toggle('next', i === k && k > 0); });
    }
  }

  flashJutsu(id) {
    const el = $(`#jutsuList .jutsu[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('cast');
    void el.offsetWidth;
    el.classList.add('cast');
  }

  /* ───────── Seal readout ───────── */
  setSealLive(candidate, progress, idleText) {
    const k = $('#sealKanji'), n = $('#sealName');
    const seal = candidate && candidate !== 'none' ? SEAL_MAP[candidate] : null;
    $('#sealRing').style.strokeDashoffset = String(289 * (1 - (seal ? progress : 0)));
    if (seal) {
      if (k.textContent !== seal.kanji) k.textContent = seal.kanji;
      k.classList.add('live');
      n.classList.remove('idle');
      if (n.dataset.seal !== seal.id) {
        n.dataset.seal = seal.id;
        n.replaceChildren(seal.name, h('small', {}, seal.jp));
      }
    } else {
      k.classList.remove('live');
      if (k.textContent !== '印') k.textContent = '印';
      n.classList.add('idle');
      const t = idleText || 'Raise both hands to form a seal';
      if (n.textContent !== t || n.dataset.seal) { delete n.dataset.seal; n.textContent = t; }
    }
  }

  popSeal() {
    const k = $('#sealKanji');
    k.classList.remove('pop');
    void k.offsetWidth;
    k.classList.add('pop');
  }

  setSequence(buffer) {
    const key = buffer.join(',');
    if (key === this.lastSeq && $('#sealSeq').childElementCount) return;
    const fresh = buffer.length > (this.lastSeq ? this.lastSeq.split(',').length : 0);
    this.lastSeq = key;
    const el = $('#sealSeq');
    el.innerHTML = '';
    if (!buffer.length) { el.append(h('span', { class: 'empty' }, 'Seals you make appear here, in order')); return; }
    buffer.slice(-8).forEach((id, i, arr) => el.append(h('span', { class: fresh && i === arr.length - 1 ? 'fresh' : '', title: SEAL_MAP[id].name }, SEAL_MAP[id].kanji)));
  }

  setHandsDebug(text, show) {
    const el = $('#handsDebug');
    const t = show ? text : '';
    if (el.textContent !== t) el.textContent = t;
  }

  setChakra(v) { $('#chakraFill').style.width = `${Math.max(0, Math.min(100, v))}%`; }

  setStatus(text, level) {
    const el = $('#status');
    el.className = 'status ' + (level || '');
    const t = $('#statusText');
    if (t.textContent !== text) t.textContent = text;
  }

  toast(msg, warn = false, life = 2.6) {
    const box = $('#toasts');
    const t = h('div', { class: 'toast' + (warn ? ' warn' : ''), style: `--life:${life}s` }, msg);
    box.append(t);
    setTimeout(() => t.remove(), (life + 0.5) * 1000);
    while (box.childElementCount > 3) box.firstChild.remove();
  }

  setLoad(key, state) {
    const row = $(`#loadList tr[data-k="${key}"]`);
    if (!row) return;
    row.classList.remove('busy', 'ok', 'fail');
    if (state) row.classList.add(state);
    row.querySelector('td').textContent = LOAD_TEXT[state] || 'Waiting';
  }

  /* ───────── Modals ───────── */
  bindModals() {
    $$('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) this.closeModal(m.id); });
    });
    $$('#guideTabs button').forEach(b => b.addEventListener('click', () => this.showGuideTab(b.dataset.tab)));
    this.guideTab = 'seals';
  }

  showGuideTab(tab) {
    $$('#guideTabs button').forEach(x => { x.classList.toggle('on', x.dataset.tab === tab); x.setAttribute('aria-selected', String(x.dataset.tab === tab)); });
    $$('#guideModal .tab').forEach(x => x.classList.toggle('hidden', x.dataset.tab !== tab));
    this.guideTab = tab;
  }

  openModal(id) {
    $('#' + id).classList.remove('hidden');
    if (id === 'guideModal') { this.refreshSealGuide(); this.refreshTrainer(); }
  }
  closeModal(id) { $('#' + id).classList.add('hidden'); }
  isOpen(id) { return !$('#' + id).classList.contains('hidden'); }
  anyModalOpen() { return $$('.modal').some(m => !m.classList.contains('hidden')); }
  closeAll() {
    $$('.modal').forEach(m => m.classList.add('hidden'));
    this.toggleMix(false);
    this.showRail(null);
  }

  showRail(which) {
    const app = $('#app');
    const was = app.classList.contains('show-' + which);
    app.classList.remove('show-eyes', 'show-jutsu');
    if (which && !was) app.classList.add('show-' + which);
  }

  bindTopbar() {
    $('#btnGuide').addEventListener('click', () => this.openModal('guideModal'));
    $('#btnSettings').addEventListener('click', () => this.openModal('settingsModal'));
    $('#btnShot').addEventListener('click', () => this.app.screenshot());
    $('#btnRec').addEventListener('click', () => this.app.toggleRecord());
    $('#btnFull').addEventListener('click', () => this.app.toggleFullscreen());
    $$('[data-show]').forEach(b => b.addEventListener('click', () => this.showRail(b.dataset.show)));
    $$('[data-open]').forEach(b => b.addEventListener('click', () => { this.showRail(null); this.openModal(b.dataset.open); }));
  }

  setRecording(on, label) {
    $('#btnRec').classList.toggle('active', on);
    $('#btnRec').title = on ? 'Stop recording (R)' : 'Record video (R)';
    $('#recTime').textContent = on ? (label || '') : '';
  }

  /* ───────── Seal guide ───────── */
  buildSealGuide() {
    const body = $('#sealGuide tbody');
    for (const s of SEALS) {
      body.append(h('tr', { 'data-id': s.id },
        h('td', { class: 'key' }, s.key === '-' ? '−' : s.key.toUpperCase()),
        h('td', { class: 'kanji' }, s.kanji),
        h('td', { class: 'name' }, s.name, h('small', {}, s.jp)),
        h('td', { class: 'easy' }, s.easy.join(' ')),
        h('td', { class: 'how' }, s.hint)));
    }
  }

  refreshSealGuide() {
    const ids = this.app.trainer.trainedIds;
    $$('#sealGuide tbody tr').forEach(r => r.classList.toggle('trained', ids.includes(r.dataset.id)));
  }

  /* ───────── Trainer ───────── */
  buildTrainer() {
    const body = $('#trainerGrid tbody');
    const items = [...SEALS, { id: 'idle', name: 'Idle (no seal)', kanji: '無' }];
    for (const s of items) {
      body.append(h('tr', {}, h('td', {}, h('button', { class: 'trainer-row', 'data-id': s.id, onclick: () => this.selectTrainer(s.id) },
        h('span', { class: 'kj' }, s.kanji), h('span', { class: 'n' }, s.name), h('span', { class: 'c' }, 'none yet')))));
    }
    $('#btnRecordSeal').addEventListener('click', () => {
      if (!this.trainerSel) { this.setTrainerStatus('Select a seal first.'); return; }
      this.app.recordSeal(this.trainerSel);
    });
    $('#btnClearSeal').addEventListener('click', () => {
      if (!this.trainerSel) { this.setTrainerStatus('Select a seal first.'); return; }
      this.app.trainer.clear(this.trainerSel);
      this.refreshTrainer();
      this.setTrainerStatus('Cleared the recording for this seal.');
    });
    $('#btnClearAll').addEventListener('click', () => {
      if (!confirm('Delete all recorded seal samples from this browser?')) return;
      this.app.trainer.clear();
      this.refreshTrainer();
      this.setTrainerStatus('All recordings cleared.');
    });
    $('#btnExport').addEventListener('click', () => this.app.exportSamples());
    $('#fileImport').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { this.setTrainerStatus('Import failed: file is too large.'); e.target.value = ''; return; }
      try {
        this.app.trainer.import(await f.text());
        this.refreshTrainer();
        this.setTrainerStatus('Recordings imported.');
      } catch (err) {
        this.setTrainerStatus('Import failed: ' + err.message);
      }
      e.target.value = '';
    });
    const sens = $('#knnSens'), out = sens.parentElement.querySelector('output');
    sens.value = this.app.settings.knnSensitivity;
    const sync = () => { out.textContent = Number(sens.value).toFixed(2) + '×'; };
    sens.addEventListener('input', () => { sync(); this.app.updateSetting('knnSensitivity', parseFloat(sens.value)); });
    sync();
  }

  selectTrainer(id) {
    this.trainerSel = id;
    $$('#trainerGrid .trainer-row').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    const name = id === 'idle' ? 'Idle' : SEAL_MAP[id].name;
    const n = this.app.trainer.count(id);
    this.setTrainerStatus(`${name}: ${n ? n + ' samples recorded' : 'not recorded yet'}. Press Record and hold the pose.`);
  }

  refreshTrainer() {
    $$('#trainerGrid .trainer-row').forEach(b => {
      const n = this.app.trainer.count(b.dataset.id);
      b.classList.toggle('has', n > 0);
      b.querySelector('.c').textContent = n ? `${n} samples` : 'none yet';
    });
  }

  setTrainerStatus(text, rec = false) {
    const el = $('#trainerStatus');
    el.textContent = text;
    el.classList.toggle('rec', rec);
  }

  setTrainerLive(label, sub) {
    if (!this.isOpen('guideModal') || this.guideTab !== 'trainer') return;
    $('#trainerLive').textContent = label;
    $('#trainerLiveSub').textContent = sub || '';
  }

  /* ───────── Settings ───────── */
  bindSettings() {
    const s = this.app.settings;
    const bindSel = (id, key) => { const el = $('#' + id); el.value = s[key]; el.addEventListener('change', () => this.app.updateSetting(key, el.value)); };
    const bindChk = (id, key) => { const el = $('#' + id); el.checked = !!s[key]; el.addEventListener('change', () => this.app.updateSetting(key, el.checked)); };
    const bindRange = (id, key, fmt) => {
      const el = $('#' + id), out = el.parentElement.querySelector('output');
      el.value = s[key];
      const sync = () => { out.textContent = fmt(parseFloat(el.value)); };
      el.addEventListener('input', () => { sync(); this.app.updateSetting(key, parseFloat(el.value)); });
      sync();
    };
    bindSel('setFit', 'fit');
    bindSel('setQuality', 'quality');
    bindSel('setSealMode', 'sealMode');
    bindRange('setHold', 'holdMs', v => `${v} ms`);
    bindRange('setVolume', 'volume', v => `${Math.round(v * 100)}%`);
    bindChk('setMirror', 'mirror');
    bindChk('setLenient', 'lenient');
    bindChk('setGestures', 'gestures');
    bindChk('setVoice', 'voice');
    bindChk('setHandDebug', 'showHandDebug');
    bindChk('setLandmarks', 'showLandmarks');
    bindChk('setChakra', 'unlimitedChakra');
    $('#setCamera').addEventListener('change', e => this.app.updateSetting('cameraId', e.target.value));
  }

  setCameras(list, current) {
    const sel = $('#setCamera');
    sel.innerHTML = '';
    sel.append(h('option', { value: '' }, 'Default camera'));
    list.forEach((d, i) => sel.append(h('option', { value: d.deviceId }, d.label || `Camera ${i + 1}`)));
    sel.value = current || '';
  }

  setVoiceToggle(on) { $('#setVoice').checked = on; }
}
