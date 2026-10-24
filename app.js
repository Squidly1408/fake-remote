/* Fidget Remote: a pretend TV remote. Controls nothing. Vanilla JS, no build step. */
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k, d) { try { const v = localStorage.getItem('fidgetRemote.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fidgetRemote.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
};
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } };

/* ================= Block zoom / selection / callouts ================= */
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd < 320) e.preventDefault(); // kill double-tap zoom
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
});

/* ================= Audio (Web Audio, all synthesised) ================= */
const A = {
  ctx: null, out: null, noise: null, on: store.get('sound', true),
  get() {
    if (!this.on) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { return null; }
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.7;
      this.out.connect(comp);
      const len = this.ctx.sampleRate;
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  setOn(v) {
    this.on = v; store.set('sound', v);
    if (this.ctx) { if (v) this.ctx.resume(); else this.ctx.suspend(); }
  }
};

function ramp(param, pts, t) {
  pts.forEach(([dt, v], i) => i ? param.linearRampToValueAtTime(v, t + dt) : param.setValueAtTime(v, t + dt));
}
function envelope(g, t, a, vol, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.setValueAtTime(vol, t + Math.max(a, dur * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
// Simple percussive oscillator
function tone({ f = 440, to = null, type = 'sine', dur = 0.1, vol = 0.3, a = 0.004, delay = 0, lp = 0 }) {
  const c = A.get(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let n = o;
  if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
  n.connect(g); g.connect(A.out);
  o.start(t); o.stop(t + dur + 0.05);
}
// Filtered noise burst
function noise({ dur = 0.05, vol = 0.2, type = 'bandpass', f = 3000, to = null, q = 1, a = 0.002, delay = 0 }) {
  const c = A.get(); if (!c) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = A.noise; s.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(A.out);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
// Shaped "voice" for animal noises: frequency + filter contours, optional vibrato
function voice({ type = 'sawtooth', f, ff = [[0, 2000]], ftype = 'bandpass', q = 1, vol = 0.4, dur = 0.5, a = 0.03, delay = 0, vib = 0, vibRate = 6 }) {
  const c = A.get(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; ramp(o.frequency, f, t);
  const fl = c.createBiquadFilter(); fl.type = ftype; fl.Q.value = q; ramp(fl.frequency, ff, t);
  const g = c.createGain(); envelope(g, t, a, vol, dur);
  if (vib) {
    const l = c.createOscillator(); l.frequency.value = vibRate;
    const lg = c.createGain(); lg.gain.value = vib;
    l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  o.connect(fl); fl.connect(g); g.connect(A.out);
  o.start(t); o.stop(t + dur + 0.05);
}

const S = {
  down(p = 1) { p *= 0.97 + Math.random() * 0.06; noise({ dur: 0.022, vol: 0.4, f: 2600 * p, q: 2.2 }); tone({ f: 190 * p, to: 80 * p, dur: 0.045, vol: 0.28, type: 'triangle' }); },
  up(p = 1) { p *= 0.97 + Math.random() * 0.06; noise({ dur: 0.014, vol: 0.16, f: 4400 * p, q: 3 }); },
  power(on) {
    tone({ f: on ? 55 : 150, to: on ? 170 : 40, dur: 0.28, vol: 0.4 });
    noise({ dur: on ? 0.35 : 0.12, vol: 0.18, type: 'lowpass', f: on ? 400 : 1500, to: on ? 3000 : 200, q: 0.7, a: 0.01 });
  },
  tick(v) { tone({ f: 500 + v * 14, dur: 0.045, vol: 0.13, type: 'square', lp: 2200 }); },
  hiss(d = 0.22) { noise({ dur: d, vol: 0.11, type: 'highpass', f: 1200, q: 0.5, a: 0.01 }); },
  blip(f = 880, d = 0.07) { tone({ f, dur: d, vol: 0.14 }); },
  mute(m) { tone({ f: m ? 760 : 480, to: m ? 360 : 900, dur: 0.12, vol: 0.14, type: 'triangle' }); },
  chime(f) {
    tone({ f, dur: 0.6, vol: 0.32 }); tone({ f: f * 2, dur: 0.4, vol: 0.08 });
    [1.5, 2, 3].forEach((m, i) => tone({ f: f * m, dur: 0.18, vol: 0.06, type: 'triangle', delay: 0.06 + i * 0.05 }));
  },
  unlock() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.18, vol: 0.18, type: 'triangle', delay: i * 0.08 })); }
};

const ANIMAL_SOUNDS = {
  dog() {
    [0, 0.22].forEach(d => {
      voice({ f: [[0, 620], [0.12, 210]], ff: [[0, 1800], [0.12, 600]], ftype: 'lowpass', q: 4, vol: 0.5, dur: 0.14, a: 0.01, delay: d });
      noise({ dur: 0.08, vol: 0.18, f: 900, delay: d });
    });
  },
  cat() {
    voice({ f: [[0, 450], [0.18, 820], [0.6, 500]], ff: [[0, 900], [0.2, 2400], [0.6, 800]], q: 5, vol: 0.6, dur: 0.65, vib: 12 });
  },
  cow() {
    voice({ f: [[0, 150], [0.2, 162], [1.1, 112]], ff: [[0, 250], [0.35, 950], [1.1, 300]], ftype: 'lowpass', q: 7, vol: 0.6, dur: 1.15, a: 0.12, vib: 3, vibRate: 5 });
  },
  duck() {
    [0, 0.2].forEach(d => voice({ type: 'square', f: [[0, 340], [0.14, 240]], ff: [[0, 1300], [0.14, 900]], q: 6, vol: 0.5, dur: 0.16, a: 0.01, delay: d }));
  },
  frog() {
    [0, 0.42].forEach(g => {
      for (let i = 0; i < 4; i++) voice({ type: 'square', f: [[0, 175], [0.04, 135]], ff: [[0, 700]], ftype: 'lowpass', q: 5, vol: 0.45, dur: 0.045, a: 0.005, delay: g + i * 0.055 });
    });
  },
  lion() {
    voice({ f: [[0, 105], [0.3, 150], [1.0, 68]], ff: [[0, 300], [0.3, 1100], [1.0, 250]], ftype: 'lowpass', q: 2, vol: 0.65, dur: 1.05, a: 0.15, vib: 20, vibRate: 28 });
    noise({ dur: 1.0, vol: 0.22, type: 'lowpass', f: 1000, to: 200, a: 0.15 });
  }
};

/* ================= Generic press binding ================= */
function bindPress(el, onPress, opts = {}) {
  let rptT = 0, rptI = 0;
  const stopRepeat = () => { clearTimeout(rptT); clearInterval(rptI); };
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    el.classList.add('pressed');
    onPress(false);
    if (opts.repeat) {
      stopRepeat();
      rptT = setTimeout(() => { rptI = setInterval(() => onPress(true), 110); }, 420);
    }
  });
  const up = () => {
    stopRepeat();
    if (!el.classList.contains('pressed')) return;
    el.classList.remove('pressed');
    if (opts.release) opts.release();
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, up));
  // Keyboard activation (click with detail 0)
  el.addEventListener('click', e => {
    if (e.detail !== 0) return;
    el.classList.add('pressed'); onPress(false);
    setTimeout(() => { el.classList.remove('pressed'); if (opts.release) opts.release(); }, 110);
  });
}

/* ================= Screens / navigation ================= */
let mode = 'start';
function showScreen(m, push = true) {
  mode = m;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === m));
  if (m !== 'start' && push) { try { history.pushState({ m }, ''); } catch (e) { /* ignore */ } }
  if (m === 'kids') kidsIdle();
}
window.addEventListener('popstate', () => {
  if (mode === 'kids') { try { history.pushState({ m: 'kids' }, ''); } catch (e) { /* ignore */ } } // back button can't escape kids mode
  else if (mode === 'adult') showScreen('start', false);
});

$$('.mode-btn').forEach(b => bindPress(b, () => { S.down(0.9); buzz(12); }, {
  release: () => { S.up(0.9); showScreen(b.dataset.mode); }
}));

function syncSound() {
  $$('.sound-toggle').forEach(b => {
    b.setAttribute('aria-pressed', String(A.on));
    $('.ico', b).textContent = A.on ? '🔊' : '🔇';
    const l = $('.lbl', b); if (l) l.textContent = A.on ? 'Sound on' : 'Sound off';
  });
}
$$('.sound-toggle').forEach(b => bindPress(b, () => {
  A.setOn(!A.on); syncSound(); buzz(10);
  if (A.on) S.blip(988, 0.09);
}));
syncSound();

/* ================= ADULT MODE ================= */
const SHOWS = [
  { name: 'NEWS 24', icon: '📰', bg: 'linear-gradient(160deg,#0b3d91,#1e88e5)', ticker: 'BREAKING: Local person presses buttons, feels great  •  Remote declared "very clicky"  •  Weather: buttony  •' },
  { name: 'WILD EARTH', icon: '🦒', bg: 'linear-gradient(160deg,#2e7d32,#a5d6a7)' },
  { name: 'COOK IT!', icon: '🍳', bg: 'linear-gradient(160deg,#ef6c00,#ffcc80)' },
  { name: 'SPORTS+', icon: '⚽', bg: 'linear-gradient(160deg,#1b5e20,#43a047)' },
  { name: 'DEEP SPACE', icon: '🚀', bg: 'radial-gradient(circle at 70% 30%,#3949ab,#0d0d2b 70%)' },
  { name: 'TOONZ', icon: '🐙', bg: 'linear-gradient(160deg,#ec407a,#ffd54f)' },
  { name: 'WEATHER', icon: '⛅', bg: 'linear-gradient(180deg,#4fc3f7,#e1f5fe)' },
  { name: 'ROCK TV', icon: '🎸', bg: 'linear-gradient(160deg,#6a1b9a,#f06292)' },
  { name: 'OCEAN', icon: '🐠', bg: 'linear-gradient(180deg,#00acc1,#004d61)' },
  { name: 'RETRO', icon: '👾', bg: 'linear-gradient(160deg,#212121,#7b1fa2)' },
  { name: 'CINEMA', icon: '🎬', bg: 'linear-gradient(160deg,#3e2723,#8d6e63)' },
  { name: 'TEST CARD', bars: true }
];
const APPS = [
  { n: 'Streamy', i: '🎞️', c: '#c62828' }, { n: 'TubeView', i: '▶️', c: '#e65100' }, { n: 'Tunes', i: '🎵', c: '#2e7d32' },
  { n: 'Photos', i: '🖼️', c: '#1565c0' }, { n: 'Games', i: '🎮', c: '#6a1b9a' }, { n: 'Settings', i: '⚙️', c: '#455a64' }
];
const INPUTS = ['TV', 'HDMI 1', 'HDMI 2', 'AV'];
const VOLMAX = 50;
const T = { on: false, ch: 1, last: 1, vol: 18, muted: false, input: 0, menu: false, sel: 0, paused: false, digits: '', dt: 0 };

const scr = $('#tvScreen');
const content = $('#tvContent');
const menuEl = $('#tvMenu');
const showFor = ch => SHOWS[(ch - 1) % SHOWS.length];
const isDead = ch => ch % 13 === 0;

menuEl.innerHTML = APPS.map(a => `<div class="tile" style="--c:${a.c}"><span>${a.i}</span>${a.n}</div>`).join('');
const tiles = $$('.tile', menuEl);

/* Static noise */
const nc = $('#tvNoise'), nx = nc.getContext('2d');
const img = nx.createImageData(nc.width, nc.height);
const px = new Uint32Array(img.data.buffer);
let staticUntil = 0, staticForever = false, rafOn = false;
function drawNoise() {
  for (let i = 0; i < px.length; i++) { const v = (Math.random() * 255) | 0; px[i] = 0xff000000 | (v << 16) | (v << 8) | v; }
  nx.putImageData(img, 0, 0);
}
function noiseLoop() {
  if (T.on && (staticForever || performance.now() < staticUntil)) {
    nc.classList.add('show'); drawNoise(); requestAnimationFrame(noiseLoop);
  } else { nc.classList.remove('show'); rafOn = false; }
}
function staticFor(ms) {
  staticUntil = Math.max(staticUntil, performance.now() + ms);
  if (!rafOn) { rafOn = true; requestAnimationFrame(noiseLoop); }
}

/* OSD helpers */
const osdTimers = {};
function osd(el, ms = 2000) {
  el.classList.add('show');
  clearTimeout(osdTimers[el.id]);
  if (ms) osdTimers[el.id] = setTimeout(() => el.classList.remove('show'), ms);
}
function hideOsd() { $$('.osd', scr).forEach(o => o.classList.remove('show')); }
function toast(msg, ms = 1600) { const t = $('#osdToast'); t.textContent = msg; osd(t, ms); }
function bigIcon(txt) { const i = $('#osdIcon'); i.textContent = txt; osd(i, 900); }

function render() {
  scr.classList.toggle('paused', T.paused);
  $('#osdNoSig').classList.remove('show');
  staticForever = false;
  if (T.input > 0) {
    content.innerHTML = `<div class="nosig"><div class="bx"><div class="by">${INPUTS[T.input]}<small>NO SIGNAL</small></div></div></div>`;
    return;
  }
  if (isDead(T.ch)) {
    content.innerHTML = '';
    staticForever = true; staticFor(0);
    $('#osdNoSig').classList.add('show');
    return;
  }
  const s = showFor(T.ch);
  content.innerHTML = s.bars
    ? `<div class="show bars"><span class="show-tag">CH ${T.ch}</span></div>`
    : `<div class="show" style="background:${s.bg}"><span class="show-icon">${s.icon}</span><span class="show-name">${s.name}</span>${s.ticker ? `<div class="ticker"><span>${s.ticker}</span></div>` : ''}</div>`;
}
function showCh() { $('#osdCh').textContent = T.ch; osd($('#osdCh'), 2200); }
function showVol() {
  $('#volFill').style.width = (T.vol / VOLMAX * 100) + '%';
  $('#volNum').textContent = T.muted ? '--' : T.vol;
  $('#osdVol').classList.toggle('muted', T.muted);
  osd($('#osdVol'), 2000);
}
function banner(next) {
  const s = isDead(T.ch) ? { name: 'No signal' } : showFor(T.ch);
  const n = showFor(T.ch + 1);
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const b = $('#osdBanner');
  b.innerHTML = next
    ? `<b>Guide</b><br>Now: ${s.name}<br>Next: ${n.name}`
    : `<b>${T.ch} · ${s.name}</b><br>${time} · HD · Pretend broadcast`;
  osd(b, 3000);
}
function flashColour(c) { const f = $('#tvFlash'); f.style.background = c; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }

function closeMenu() { T.menu = false; menuEl.classList.remove('show'); }
function openMenu() { T.menu = true; menuEl.classList.add('show'); selTile(T.sel); }
function selTile(i) { T.sel = (i + tiles.length) % tiles.length; tiles.forEach((t, j) => t.classList.toggle('sel', j === T.sel)); }

function setCh(n) {
  n = ((n - 1) % 999 + 999) % 999 + 1;
  if (n !== T.ch) { T.last = T.ch; T.ch = n; }
  T.input = 0; closeMenu();
  staticFor(240); S.hiss(0.2);
  render(); showCh();
}
function changeVol(d) {
  if (T.muted) { T.muted = false; $('#osdMute').classList.remove('show'); }
  T.vol = clamp(T.vol + d, 0, VOLMAX);
  S.tick(T.vol); showVol();
}
function digit(d) {
  T.digits = (T.digits + d).slice(-3);
  $('#osdCh').textContent = T.digits.padEnd(3, '-');
  osd($('#osdCh'), 0);
  clearTimeout(T.dt);
  T.dt = setTimeout(() => {
    const n = parseInt(T.digits, 10); T.digits = '';
    if (n > 0) setCh(n); else showCh();
  }, T.digits.length >= 3 ? 350 : 1300);
}
function togglePower() {
  T.on = !T.on;
  scr.classList.remove('init');
  scr.classList.toggle('off', !T.on);
  scr.classList.toggle('on', T.on);
  $('#tvLed').classList.toggle('on', T.on);
  S.power(T.on); buzz([18, 40, 28]);
  if (T.on) { closeMenu(); render(); staticFor(380); setTimeout(() => { if (T.on) showCh(); }, 450); }
  else { staticForever = false; hideOsd(); clearTimeout(T.dt); T.digits = ''; }
}

function act(k) {
  if (k === 'power') return togglePower();
  if (!T.on) return; // TV is off: the buttons still click, nothing else happens
  if (/^\d$/.test(k)) return digit(k);
  switch (k) {
    case 'volup': return changeVol(1);
    case 'voldown': return changeVol(-1);
    case 'chup': return setCh(T.ch + 1);
    case 'chdown': return setCh(T.ch - 1);
    case 'prev': return setCh(T.last);
    case 'mute':
      T.muted = !T.muted; S.mute(T.muted);
      $('#osdMute').classList.toggle('show', T.muted); showVol(); return;
    case 'input':
      T.input = (T.input + 1) % INPUTS.length; closeMenu();
      staticFor(200); render(); toast('Input: ' + INPUTS[T.input]); return;
    case 'home': case 'menu':
      if (T.menu) { closeMenu(); S.blip(520); } else { openMenu(); S.blip(880); } return;
    case 'back': case 'exit':
      if (T.menu) { closeMenu(); S.blip(520); } else { hideOsd(); if (isDead(T.ch) && !T.input) $('#osdNoSig').classList.add('show'); if (T.muted) $('#osdMute').classList.add('show'); } return;
    case 'up': case 'down': case 'left': case 'right':
      if (T.menu) {
        const d = { up: -3, down: 3, left: -1, right: 1 }[k];
        selTile(T.sel + d); S.blip(1200, 0.03); return;
      }
      if (k === 'up') return setCh(T.ch + 1);
      if (k === 'down') return setCh(T.ch - 1);
      return changeVol(k === 'right' ? 1 : -1);
    case 'ok':
      if (T.menu) {
        const t = tiles[T.sel]; t.classList.remove('launch'); void t.offsetWidth; t.classList.add('launch');
        S.blip(660); S.blip(990, 0.09);
        toast(APPS[T.sel].n === 'Settings' ? 'Nothing to break in here' : `${APPS[T.sel].n} is pretend`);
        return;
      }
      return banner(false);
    case 'info': return banner(false);
    case 'guide': return banner(true);
    case 'list': return toast('Channels 1–999, all excellent');
    case 'play': T.paused = !T.paused; render(); return bigIcon(T.paused ? '❚❚' : '▶');
    case 'stop': T.paused = true; render(); return bigIcon('■');
    case 'rew': return bigIcon('◀◀');
    case 'ff': return bigIcon('▶▶');
    case 'red': flashColour('#ff3b30'); return toast('Red: does nothing (perfectly)', 1000);
    case 'green': flashColour('#34c759'); return toast('Green: all good', 1000);
    case 'yellow': flashColour('#ffd60a'); return toast('Yellow: mellow', 1000);
    case 'blue': flashColour('#0a84ff'); return toast('Blue: very calm', 1000);
  }
}

const led = $('#led');
function blinkLed() { led.classList.add('blink'); clearTimeout(blinkLed.t); blinkLed.t = setTimeout(() => led.classList.remove('blink'), 90); }
const dpad = $('#dpad');

function remotePress(btn, repeat) {
  const k = btn.dataset.k;
  const p = parseFloat(btn.dataset.p || '1');
  if (!repeat) S.down(p);
  buzz(k === 'power' ? 0 : (repeat ? 5 : 9));
  blinkLed();
  if (btn.classList.contains('dp')) { dpad.className = 'dpad t-' + k; }
  if (btn.classList.contains('rk')) btn.parentElement.classList.add(btn.classList.contains('up') ? 'tilt-up' : 'tilt-down');
  act(k);
}
function remoteRelease(btn) {
  S.up(parseFloat(btn.dataset.p || '1'));
  if (btn.classList.contains('dp')) dpad.className = 'dpad';
  if (btn.classList.contains('rk')) btn.parentElement.classList.remove('tilt-up', 'tilt-down');
}
$$('#remote [data-k]').forEach(btn => bindPress(btn, rep => remotePress(btn, rep), {
  repeat: btn.hasAttribute('data-repeat'),
  release: () => remoteRelease(btn)
}));

// Desktop keyboard support for the adult remote
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', '+': 'volup', '=': 'volup', '-': 'voldown',
  PageUp: 'chup', PageDown: 'chdown', m: 'mute', p: 'power', Escape: 'back', Backspace: 'back', h: 'home', i: 'info' };
document.addEventListener('keydown', e => {
  if (mode !== 'adult' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.activeElement && document.activeElement.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
  const k = /^\d$/.test(e.key) ? e.key : KEYMAP[e.key];
  if (!k) return;
  const btn = $(`#remote [data-k="${k}"]`); if (!btn) return;
  e.preventDefault();
  btn.classList.add('pressed'); remotePress(btn, e.repeat);
  setTimeout(() => { btn.classList.remove('pressed'); remoteRelease(btn); }, 100);
});

const adultEl = $('#adult');
const tvToggle = $('#tvToggle');
function applyTvPref(remoteOnly) {
  adultEl.classList.toggle('remote-only', remoteOnly);
  tvToggle.textContent = remoteOnly ? 'Show TV' : 'Hide TV';
}
applyTvPref(store.get('remoteOnly', false));
bindPress(tvToggle, () => {
  const ro = !adultEl.classList.contains('remote-only');
  applyTvPref(ro); store.set('remoteOnly', ro); S.down(1.2); buzz(8);
}, { release: () => S.up(1.2) });
bindPress($('#adultBack'), () => { S.down(1.2); buzz(8); }, { release: () => { S.up(1.2); showScreen('start', false); } });

/* ================= KIDS MODE ================= */
const SHAPES = {
  heart: '<path d="M50 88C20 66 6 50 6 32 6 18 18 8 31 8c9 0 15 5 19 12 4-7 10-12 19-12 13 0 25 10 25 24 0 18-14 34-44 56z"/>',
  circle: '<circle cx="50" cy="50" r="42"/>',
  star: '<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"/>',
  triangle: '<polygon points="50,8 94,90 6,90" stroke-linejoin="round" stroke-width="8" stroke="#fff"/>',
  diamond: '<polygon points="50,4 94,50 50,96 6,50"/>',
  square: '<rect x="10" y="10" width="80" height="80" rx="14"/>'
};
const svgShape = (k) => `<svg viewBox="0 0 100 100" fill="#fff" aria-hidden="true">${SHAPES[k]}</svg>`;
const COLORS = [
  { name: 'Red', c: '#ff5a5a', d: '#c93636', shape: 'heart', note: 523.25 },
  { name: 'Blue', c: '#3d8bff', d: '#1f5fc2', shape: 'circle', note: 587.33 },
  { name: 'Yellow', c: '#ffcf33', d: '#cf9d00', shape: 'star', note: 659.25 },
  { name: 'Green', c: '#36c96a', d: '#1f9447', shape: 'triangle', note: 783.99 },
  { name: 'Purple', c: '#a66bff', d: '#7441c7', shape: 'diamond', note: 880 },
  { name: 'Orange', c: '#ff9535', d: '#cf650c', shape: 'square', note: 1046.5 }
];
const ANIMALS = [
  { name: 'Dog', e: '🐶', say: 'Woof!', c: '#ffe0b2', d: '#e0a96a', s: 'dog' },
  { name: 'Cat', e: '🐱', say: 'Meow!', c: '#ffcade', d: '#e08aa8', s: 'cat' },
  { name: 'Cow', e: '🐮', say: 'Moo!', c: '#d2f0c8', d: '#8fc47e', s: 'cow' },
  { name: 'Duck', e: '🦆', say: 'Quack!', c: '#fff39a', d: '#d8c348', s: 'duck' },
  { name: 'Frog', e: '🐸', say: 'Ribbit!', c: '#b9ece4', d: '#6fbfb2', s: 'frog' },
  { name: 'Lion', e: '🦁', say: 'Roar!', c: '#ffd2bf', d: '#e08f6c', s: 'lion' }
];
// Checkerboard: colour, animal, colour / animal, colour, animal ...
const KIDS = [];
{ let ci = 0, ai = 0;
  for (let cell = 0; cell < 12; cell++) {
    const r = Math.floor(cell / 3), c = cell % 3;
    if ((r + c) % 2 === 0) KIDS.push({ kind: 'color', ...COLORS[ci++] }); else KIDS.push({ kind: 'animal', ...ANIMALS[ai++] });
  } }

const kGrid = $('#kGrid'), kShow = $('#kShow'), ktv = $('#ktv');
kGrid.innerHTML = KIDS.map((it, i) => it.kind === 'color'
  ? `<button class="kbtn" data-i="${i}" style="--c:${it.c};--d:${it.d}" aria-label="${it.name}">${svgShape(it.shape)}<span>${it.name}</span></button>`
  : `<button class="kbtn animal" data-i="${i}" style="--c:${it.c};--d:${it.d}" aria-label="${it.name}"><span class="em">${it.e}</span><span>${it.name}</span></button>`
).join('');

function kidsIdle() {
  kShow.style.background = '';
  kShow.innerHTML = '<div class="k-big wiggle">👋</div><div class="k-word">Press a button!</div>';
}
function kidShow(it) {
  if (it.kind === 'color') {
    kShow.style.background = `radial-gradient(circle at 50% 40%, ${it.c}, ${it.d})`;
    kShow.innerHTML = `<div class="k-big">${svgShape(it.shape)}</div><div class="k-word">${it.name}!</div>`;
  } else {
    kShow.style.background = `radial-gradient(circle at 50% 40%, #fff, ${it.c} 60%, ${it.d})`;
    kShow.innerHTML = `<div class="k-big wiggle">${it.e}</div><div class="k-word">${it.say}</div>`;
  }
  kShow.classList.remove('pop'); void kShow.offsetWidth; kShow.classList.add('pop');
  ktv.classList.remove('wobble'); void ktv.offsetWidth; ktv.classList.add('wobble');
}
let particles = 0;
function burst(el, it) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 9 && particles < 70; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    if (it.kind === 'animal') p.textContent = ['⭐', '✨', '💛', it.e][i % 4];
    else { p.classList.add('dot'); p.style.background = it.c; }
    const ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 80;
    p.style.left = cx + 'px'; p.style.top = cy + 'px';
    p.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
    p.style.setProperty('--dy', (Math.sin(ang) * dist - 30) + 'px');
    p.style.setProperty('--r', ((Math.random() - 0.5) * 120) + 'deg');
    document.body.appendChild(p); particles++;
    setTimeout(() => { p.remove(); particles--; }, 950);
  }
}
$$('.kbtn', kGrid).forEach(btn => {
  const it = KIDS[+btn.dataset.i];
  bindPress(btn, () => {
    if (it.kind === 'color') S.chime(it.note); else ANIMAL_SOUNDS[it.s]();
    buzz(22);
    kidShow(it); burst(btn, it);
    btn.classList.remove('boing'); void btn.offsetWidth; btn.classList.add('boing');
  });
});

/* Parent lock: hold 3 seconds to exit */
const lock = $('#kLock'), ring = $('#kRing'), hint = $('#kHint');
const HOLD = 3000, RING = 2 * Math.PI * 26;
ring.style.strokeDasharray = RING; ring.style.strokeDashoffset = RING;
let holdStart = 0, holdRaf = 0, holdStep = -1;
function holdTick() {
  const p = Math.min(1, (performance.now() - holdStart) / HOLD);
  ring.style.strokeDashoffset = RING * (1 - p);
  const step = Math.floor(p * 3);
  if (step !== holdStep && p < 1) { holdStep = step; S.blip(600 + step * 200, 0.05); buzz(8); }
  if (p >= 1) { endHold(); S.unlock(); buzz([20, 40, 20]); showScreen('start', false); }
}
function startHold() {
  if (holdStart) return;
  holdStart = performance.now(); holdStep = -1;
  lock.classList.add('holding'); hint.classList.add('show');
  holdRaf = setInterval(holdTick, 30);
}
function endHold() {
  clearInterval(holdRaf); holdStart = 0;
  lock.classList.remove('holding'); ring.style.strokeDashoffset = RING;
  clearTimeout(endHold.t); endHold.t = setTimeout(() => hint.classList.remove('show'), 1200);
}
lock.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  e.preventDefault();
  try { lock.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  startHold();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => lock.addEventListener(t, () => { if (holdStart) endHold(); }));
lock.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startHold(); } });
lock.addEventListener('keyup', e => { if ((e.key === 'Enter' || e.key === ' ') && holdStart) endHold(); });

kidsIdle();
})();
