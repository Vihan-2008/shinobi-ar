// Optional voice commands via the browser's Web Speech API.

export class Voice {
  constructor(onCommand, onState) {
    this.onCommand = onCommand;
    this.onState = onState || (() => {});
    this.enabled = false;
    this.rec = null;
    this.commands = []; // { phrases: [], action }
    this.cooldown = new Map();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR;
    if (SR) {
      this.rec = new SR();
      this.rec.continuous = true;
      this.rec.interimResults = true;
      this.rec.lang = 'en-US';
      this.rec.onresult = (e) => this.handle(e);
      this.rec.onend = () => { if (this.enabled) setTimeout(() => this.safeStart(), 250); else this.onState('off'); };
      this.rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.enabled = false;
          this.onState('denied');
        }
      };
    }
  }

  register(phrases, action) {
    this.commands.push({ phrases: phrases.map(p => p.toLowerCase()), action });
    this.commands.sort((a, b) => Math.max(...b.phrases.map(p => p.length)) - Math.max(...a.phrases.map(p => p.length)));
  }

  safeStart() {
    try { this.rec.start(); this.onState('listening'); } catch { /* already started */ }
  }

  setEnabled(on) {
    if (!this.supported) { this.onState('unsupported'); return false; }
    this.enabled = on;
    if (on) this.safeStart();
    else { try { this.rec.stop(); } catch { /* not running */ } this.onState('off'); }
    return true;
  }

  handle(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript.toLowerCase();
      const now = performance.now();
      for (const c of this.commands) {
        const hit = c.phrases.find(p => text.includes(p));
        if (!hit) continue;
        const key = c.phrases[0];
        if (now - (this.cooldown.get(key) || 0) < 2500) break;
        this.cooldown.set(key, now);
        this.onCommand(c.action, hit);
        break;
      }
    }
  }
}
