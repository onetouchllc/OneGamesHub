/**
 * engine.js — ONE GAMES HUB Core Engine
 * Provides: GameEngine base class, Canvas2D renderer utilities,
 * ParticleSystem, AnimationLoop, SoundManager, InputManager, Tween
 */

'use strict';

// ─────────────────────────────────────────────
// 1. MATH & COLOR UTILITIES
// ─────────────────────────────────────────────
const MathUtils = {
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  lerp:  (a, b, t) => a + (b - a) * t,
  rand:  (min, max) => Math.random() * (max - min) + min,
  randInt:(min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  dist:  (a, b) => Math.hypot(b.x - a.x, b.y - a.y),
  normalise: (v) => {
    const m = Math.hypot(v.x, v.y);
    return m ? { x: v.x / m, y: v.y / m } : { x: 0, y: 0 };
  },
  degToRad: d => d * Math.PI / 180,
};

const ColorUtils = {
  hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return { r, g, b };
  },
  rgba(r,g,b,a=1) { return `rgba(${r},${g},${b},${a})`; },
  hsla(h,s,l,a=1) { return `hsla(${h},${s}%,${l}%,${a})`; },
  lerpColor(c1, c2, t) {
    return {
      r: Math.round(MathUtils.lerp(c1.r, c2.r, t)),
      g: Math.round(MathUtils.lerp(c1.g, c2.g, t)),
      b: Math.round(MathUtils.lerp(c1.b, c2.b, t)),
    };
  },
};

// ─────────────────────────────────────────────
// 2. ANIMATION LOOP
// ─────────────────────────────────────────────
class AnimationLoop {
  constructor(onTick) {
    this.onTick = onTick;
    this._id = null;
    this._last = 0;
    this.running = false;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsTick = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._step(this._last);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._id);
    this._id = null;
  }

  _step(now) {
    if (!this.running) return;
    const dt = Math.min((now - this._last) / 1000, 0.05); // cap at 50ms
    this._last = now;

    // FPS counter
    this._fpsAccum += dt;
    this._fpsTick++;
    if (this._fpsAccum >= 1) {
      this.fps = this._fpsTick;
      this._fpsTick = 0;
      this._fpsAccum = 0;
    }

    this.onTick(dt, now);
    this._id = requestAnimationFrame(t => this._step(t));
  }
}

// ─────────────────────────────────────────────
// 3. CANVAS RENDERER
// ─────────────────────────────────────────────
class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
  }

  resize(w, h) {
    this.canvas.width = this.width = w;
    this.canvas.height = this.height = h;
  }

  clear(color = '#050810') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  // Glowing circle
  circle(x, y, r, fillColor, glowColor, glowBlur = 12) {
    const c = this.ctx;
    if (glowColor) { c.shadowColor = glowColor; c.shadowBlur = glowBlur; }
    c.fillStyle = fillColor;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
  }

  // Glowing rounded rect
  roundRect(x, y, w, h, r, fillColor, glowColor, glowBlur = 10) {
    const c = this.ctx;
    if (glowColor) { c.shadowColor = glowColor; c.shadowBlur = glowBlur; }
    c.fillStyle = fillColor;
    c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
    c.shadowBlur = 0;
  }

  // Glowing line
  line(x1, y1, x2, y2, color, width = 2, glowBlur = 0) {
    const c = this.ctx;
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    if (glowBlur) { c.shadowColor = color; c.shadowBlur = glowBlur; }
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.shadowBlur = 0;
  }

  // Baloo 2 text
  text(txt, x, y, { size = 14, color = '#e0e8ff', align = 'center',
       family = "'Baloo 2', sans-serif", glow = null, weight = '800' } = {}) {
    const c = this.ctx;
    c.font = `${weight} ${size}px ${family}`;
    c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
    if (glow) { c.shadowColor = glow; c.shadowBlur = 12; }
    c.fillText(txt, x, y);
    c.shadowBlur = 0;
  }

  // Gradient fill helper
  linearGrad(x1, y1, x2, y2, stops) {
    const g = this.ctx.createLinearGradient(x1, y1, x2, y2);
    stops.forEach(([t, color]) => g.addColorStop(t, color));
    return g;
  }

  // Grid lines
  drawGrid(cellW, cellH, color = 'rgba(0,200,255,0.06)') {
    const c = this.ctx;
    c.strokeStyle = color; c.lineWidth = 1;
    for (let x = 0; x <= this.width; x += cellW) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, this.height); c.stroke();
    }
    for (let y = 0; y <= this.height; y += cellH) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(this.width, y); c.stroke();
    }
  }

  // Shine overlay on a circle (cosmetic)
  shine(x, y, r) {
    this.ctx.fillStyle = 'rgba(255,255,255,0.18)';
    this.ctx.beginPath();
    this.ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.35, 0, Math.PI * 2);
    this.ctx.fill();
  }
}

// ─────────────────────────────────────────────
// 4. PARTICLE SYSTEM
// ─────────────────────────────────────────────
class Particle {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y;
    this.vx = opts.vx ?? MathUtils.rand(-150, 150);
    this.vy = opts.vy ?? MathUtils.rand(-220, -60);
    this.life = opts.life ?? MathUtils.rand(0.4, 0.9);
    this.maxLife = this.life;
    this.r = opts.r ?? MathUtils.rand(2, 5);
    this.color = opts.color ?? '#00c8ff';
    this.gravity = opts.gravity ?? 180;
    this.drag = opts.drag ?? 0.97;
    this.alive = true;
  }

  update(dt) {
    this.vy += this.gravity * dt;
    this.vx *= this.drag; this.vy *= this.drag;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

class ParticleSystem {
  constructor() { this.particles = []; }

  burst(x, y, count = 20, opts = {}) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = MathUtils.rand(60, 200);
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ...opts,
      }));
    }
  }

  trail(x, y, opts = {}) {
    this.particles.push(new Particle(x, y, {
      vx: MathUtils.rand(-20, 20),
      vy: MathUtils.rand(-20, 20),
      life: MathUtils.rand(0.1, 0.25),
      r: MathUtils.rand(1, 3),
      gravity: 0,
      ...opts,
    }));
  }

  update(dt) {
    this.particles = this.particles.filter(p => { p.update(dt); return p.alive; });
  }

  draw(ctx) {
    this.particles.forEach(p => p.draw(ctx));
  }

  get count() { return this.particles.length; }
}

// ─────────────────────────────────────────────
// 5. TWEEN / EASING
// ─────────────────────────────────────────────
const Easing = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => t < 0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2,
  elastic: t => t === 0 ? 0 : t === 1 ? 1
    : Math.pow(2,-10*t)*Math.sin((t*10-0.75)*(2*Math.PI)/3)+1,
  bounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1/d1) return n1*t*t;
    if (t < 2/d1) return n1*(t-=1.5/d1)*t+0.75;
    if (t < 2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
    return n1*(t-=2.625/d1)*t+0.984375;
  },
};

class Tween {
  constructor(target, props, duration, ease = Easing.easeOut, onComplete) {
    this.target = target;
    this.start = Object.fromEntries(Object.keys(props).map(k => [k, target[k]]));
    this.end = props;
    this.duration = duration;
    this.elapsed = 0;
    this.ease = ease;
    this.onComplete = onComplete;
    this.done = false;
  }

  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    const t = this.ease(MathUtils.clamp(this.elapsed / this.duration, 0, 1));
    for (const k of Object.keys(this.end)) {
      this.target[k] = MathUtils.lerp(this.start[k], this.end[k], t);
    }
    if (this.elapsed >= this.duration) {
      this.done = true;
      if (this.onComplete) this.onComplete();
    }
  }
}

class TweenManager {
  constructor() { this.tweens = []; }
  add(target, props, duration, ease, onComplete) {
    const t = new Tween(target, props, duration, ease, onComplete);
    this.tweens.push(t); return t;
  }
  update(dt) {
    this.tweens = this.tweens.filter(t => { t.update(dt); return !t.done; });
  }
}

// ─────────────────────────────────────────────
// 6. INPUT MANAGER
// ─────────────────────────────────────────────
class InputManager {
  constructor(canvas) {
    this.keys = {};
    this.mouse = { x: 0, y: 0, down: false };
    this._canvas = canvas;
    this._scaleX = 1; this._scaleY = 1;

    window.addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.key.toLowerCase()] = false; });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this._scaleX = canvas.width / r.width;
      this._scaleY = canvas.height / r.height;
      this.mouse.x = (e.clientX - r.left) * this._scaleX;
      this.mouse.y = (e.clientY - r.top) * this._scaleY;
    });
    canvas.addEventListener('mousedown', () => this.mouse.down = true);
    canvas.addEventListener('mouseup',   () => this.mouse.down = false);
  }

  isDown(key) { return !!this.keys[key]; }
  isAnyDown(...keys) { return keys.some(k => this.isDown(k)); }
}

// ─────────────────────────────────────────────
// 7. SOUND MANAGER (Web Audio API)
// ─────────────────────────────────────────────
class SoundManager {
  constructor() {
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) { this._ctx = null; }
    this.muted = false;
  }

  _resume() {
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
  }

  beep(freq = 440, type = 'square', duration = 0.06, vol = 0.15) {
    if (!this._ctx || this.muted) return;
    this._resume();
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain); gain.connect(this._ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
    osc.start(); osc.stop(this._ctx.currentTime + duration);
  }

  // Preset sounds
  sfx = {
    click:  () => this.beep(880, 'square', 0.04, 0.1),
    hit:    () => this.beep(220, 'sawtooth', 0.08, 0.15),
    match:  () => { this.beep(523, 'sine', 0.1, 0.12); setTimeout(() => this.beep(659, 'sine', 0.1, 0.12), 80); },
    win:    () => [523,659,784,1047].forEach((f,i) => setTimeout(() => this.beep(f,'sine',0.15,0.12), i*100)),
    lose:   () => [330,277,220].forEach((f,i) => setTimeout(() => this.beep(f,'sawtooth',0.12,0.12), i*120)),
    place:  () => this.beep(440, 'triangle', 0.05, 0.1),
    bounce: () => this.beep(660, 'sine', 0.04, 0.08),
    score:  () => { this.beep(784,'sine',0.06,0.1); setTimeout(()=>this.beep(1047,'sine',0.08,0.1),60); },
  };
}

// ─────────────────────────────────────────────
// 8. BASE GAME CLASS
// ─────────────────────────────────────────────
class GameEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   */
  constructor(canvas, opts = {}) {
    this.renderer  = new CanvasRenderer(canvas);
    this.particles = new ParticleSystem();
    this.tweens    = new TweenManager();
    this.input     = new InputManager(canvas);
    this.sound     = new SoundManager();
    this.loop      = new AnimationLoop((dt, now) => this._tick(dt, now));
    this.state     = {};
    this.paused    = false;

    // CSS var palette
    this.colors = {
      bg:      '#050810',
      surface: '#0a0f1e',
      cyan:    '#00c8ff',
      orange:  '#ff6b2b',
      gold:    '#ffd700',
      red:     '#ff3a5c',
      green:   '#00ff88',
      text:    '#e0e8ff',
      muted:   '#5a6a9a',
    };

    if (opts.autoStart !== false) this.loop.start();
  }

  // Override in subclass
  update(dt) {}
  draw(renderer) {}

  _tick(dt, now) {
    if (this.paused) return;
    this.tweens.update(dt);
    this.particles.update(dt);
    this.update(dt, now);
    this.renderer.clear(this.colors.bg);
    this.draw(this.renderer);
    // Draw particles on top
    this.particles.draw(this.renderer.ctx);
  }

  pause()  { this.paused = true; }
  resume() { this.paused = false; }
  destroy(){ this.loop.stop(); }

  // Convenience burst at position
  burst(x, y, color = '#00c8ff', count = 18) {
    this.particles.burst(x, y, count, { color, gravity: 200 });
  }
}

// ─────────────────────────────────────────────
// 9. ROOM STATE SYNC HELPER
// ─────────────────────────────────────────────
class RoomSync {
  constructor(gameId) {
    this.gameId = gameId;
    this._listeners = {};
  }

  emit(event, data) {
    window.parent.postMessage({ type: 'socket:emit', event: `${this.gameId}:${event}`, data }, '*');
  }

  on(event, cb) {
    const handler = e => {
      if (e.data?.type === `${this.gameId}:${event}`) cb(e.data.data);
    };
    window.addEventListener('message', handler);
    this._listeners[event] = handler;
    return () => window.removeEventListener('message', handler);
  }

  onRoomReady(cb) {
    window.addEventListener('message', e => {
      if (e.data?.type === 'room:ready') cb(e.data);
    });
  }

  onPlayerLeft(cb) {
    window.addEventListener('message', e => {
      if (e.data?.type === 'room:playerLeft') cb();
    });
  }
}

// ─────────────────────────────────────────────
// 10. EXPORTS (window globals for browser use)
// ─────────────────────────────────────────────
window.GameEngine   = GameEngine;
window.CanvasRenderer = CanvasRenderer;
window.ParticleSystem = ParticleSystem;
window.AnimationLoop  = AnimationLoop;
window.TweenManager   = TweenManager;
window.SoundManager   = SoundManager;
window.InputManager   = InputManager;
window.RoomSync       = RoomSync;
window.MathUtils      = MathUtils;
window.ColorUtils     = ColorUtils;
window.Easing         = Easing;
window.Particle       = Particle;
window.Tween          = Tween;

console.log('[GameEngine] v1.0 loaded — ONE GAMES HUB');
