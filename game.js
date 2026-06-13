/* ============================================================
   FABLEDEVIL — a clean little rage platformer ;)
   Canvas platformer. Every trap is perfectly planned.
   ============================================================ */
"use strict";

const W = 960, H = 540;
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const R = (x, y, w, h) => ({ x, y, w, h });
const FONT = "'Outfit', system-ui, -apple-system, sans-serif";

// ---------------------------------------------------------------- theme
const PALETTES = {
  dark: {
    paper: "#14161d", paper2: "#1c1f29", ink: "#ece8df",
    grid: "rgba(236,232,223,0.045)", vignette: "rgba(0,0,0,0.30)",
    danger: "#ff5d52", accent: "#ffb24d", door: "#ffb24d",
    blood: "#ff5d52", bloodDark: "#b83a31", dust: "#565b69",
    metal: "#2c3140", crack: "rgba(18,20,27,0.5)", wipe: "#0b0c11",
    shadow: "rgba(0,0,0,0.28)",
  },
  light: {
    paper: "#f5f2ea", paper2: "#e8e2d6", ink: "#1c1e26",
    grid: "rgba(28,30,38,0.05)", vignette: "rgba(70,55,40,0.06)",
    danger: "#e5463c", accent: "#ef7c1b", door: "#ef7c1b",
    blood: "#e5463c", bloodDark: "#a8322a", dust: "#c0b8a8",
    metal: "#c9c2b3", crack: "rgba(245,242,234,0.55)", wipe: "#1c1e26",
    shadow: "rgba(40,35,28,0.14)",
  },
};
let theme = PALETTES.dark;

function applyTheme(mode, save = true) {
  theme = PALETTES[mode] || PALETTES.dark;
  document.documentElement.setAttribute("data-theme", mode);
  if (save) { try { localStorage.setItem("fd_theme", mode); } catch {} }
  const t = document.getElementById("ic-theme");
  if (t) t.innerHTML = mode === "dark" ? SUN_PATH : MOON_PATH;
}
function currentMode() { return document.documentElement.getAttribute("data-theme") || "dark"; }
function toggleTheme() { applyTheme(currentMode() === "dark" ? "light" : "dark"); }

// ---------------------------------------------------------------- audio
const AudioFX = (() => {
  let ac = null, muted = false;
  const ensure = () => {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
  };
  function tone(freq, dur, type = "square", vol = 0.12, slide = 0) {
    if (muted) return;
    const a = ensure();
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  }
  function noise(dur, vol = 0.25, lp = 900) {
    if (muted) return;
    const a = ensure();
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = lp;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }
  return {
    init: ensure,
    jump: () => tone(330, 0.12, "square", 0.08, 260),
    land: () => noise(0.06, 0.10, 500),
    death: () => { noise(0.25, 0.3, 700); tone(160, 0.3, "sawtooth", 0.14, -110); },
    pop: () => tone(700, 0.07, "square", 0.09, 300),
    rumble: () => noise(0.35, 0.22, 220),
    slam: () => { noise(0.18, 0.3, 350); tone(90, 0.18, "sine", 0.2, -40); },
    poof: () => tone(500, 0.16, "triangle", 0.1, -320),
    bounce: () => tone(300, 0.18, "sine", 0.12, 520),
    zap: () => { tone(1200, 0.12, "sawtooth", 0.07, -700); noise(0.07, 0.1, 1600); },
    beep: () => tone(900, 0.04, "square", 0.04),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, "square", 0.09), i * 90)); },
    laugh: () => { [300, 260, 300, 260, 220].forEach((f, i) => setTimeout(() => tone(f, 0.09, "sawtooth", 0.06), i * 110)); },
    toggleMute: () => { muted = !muted; return muted; },
    isMuted: () => muted,
  };
})();

// ---------------------------------------------------------------- input
const keys = {};
let jumpBuffered = 0;
addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  if (!keys[e.code]) {
    if (["Space", "ArrowUp", "KeyW"].includes(e.code)) jumpBuffered = 0.12;
  }
  keys[e.code] = true;
  if (e.code === "KeyR" && Game.state === "play") Game.restartLevel(true);
  if (e.code === "KeyM") setMuteIcon(AudioFX.toggleMute());
  if (e.code === "KeyT") toggleTheme();
  if (e.code === "KeyF") toggleFullscreen();
  AudioFX.init();
});
addEventListener("keyup", (e) => (keys[e.code] = false));

// touch input (mobile)
const touch = { left: false, right: false, jump: false };
const IS_TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

const heldLeft = () => keys["ArrowLeft"] || keys["KeyA"] || touch.left;
const heldRight = () => keys["ArrowRight"] || keys["KeyD"] || touch.right;
const heldJump = () => keys["Space"] || keys["ArrowUp"] || keys["KeyW"] || touch.jump;

// ---------------------------------------------------------------- particles
const particles = [];
function spawnBlood(x, y) {
  for (let i = 0; i < 26; i++) {
    const a = rand(-Math.PI, 0), s = rand(120, 420);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: rand(2.5, 6), life: rand(0.5, 1.1), t: 0,
      color: Math.random() < 0.8 ? theme.blood : theme.bloodDark, grav: true,
    });
  }
}
function spawnDust(x, y, n = 6, color = null) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: x + rand(-10, 10), y, vx: rand(-60, 60), vy: rand(-90, -20),
      r: rand(2, 4.5), life: rand(0.25, 0.5), t: 0, color: color || theme.dust, grav: false,
    });
  }
}
function spawnPoof(x, y) {
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 160);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: rand(3, 7), life: rand(0.3, 0.55), t: 0, color: theme.accent, grav: false,
    });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t > p.life) { particles.splice(i, 1); continue; }
    if (p.grav) p.vy += 1300 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- blood stains (persist until respawn)
let stains = [];
function addStain(x, y) {
  for (let i = 0; i < 8; i++) stains.push({ x: x + rand(-26, 26), y: y + rand(-4, 4), r: rand(3, 9) });
}

// ================================================================ TRAPS
// Every trap implements: update(dt,g), solids() -> [rects], kills() -> [rects], draw()

class CollapseFloor {
  constructor(rect, trigger, opts = {}) {
    this.rect = { ...rect };
    this.trigger = trigger;
    this.shakeTime = opts.shakeTime ?? 0.18;
    this.delay = opts.delay ?? 0;
    this.reset();
  }
  reset() { this.state = "idle"; this.t = 0; this.dy = 0; this.vy = 0; }
  update(dt, g) {
    if (this.state === "idle" && aabb(g.player, this.trigger)) {
      this.state = "wait"; this.t = 0;
    } else if (this.state === "wait") {
      this.t += dt;
      if (this.t >= this.delay) { this.state = "shake"; this.t = 0; AudioFX.rumble(); g.shake(4, 0.18); }
    } else if (this.state === "shake") {
      this.t += dt;
      if (this.t >= this.shakeTime) { this.state = "fall"; AudioFX.pop(); }
    } else if (this.state === "fall") {
      this.vy += 2400 * dt;
      this.dy += this.vy * dt;
    }
  }
  solids() { return this.state === "fall" ? [] : [this.rect]; }
  kills() { return []; }
  draw() {
    if (this.dy > H) return;
    const r = this.rect;
    let ox = 0;
    if (this.state === "shake") ox = rand(-2.5, 2.5);
    ctx.fillStyle = theme.ink;
    if (this.state === "fall") {
      const n = Math.max(2, Math.floor(r.w / 46));
      const cw = r.w / n;
      for (let i = 0; i < n; i++) {
        const wob = Math.sin(i * 7.3) * this.dy * 0.18;
        ctx.fillRect(r.x + i * cw + 1, r.y + this.dy + wob, cw - 2, r.h);
      }
    } else {
      ctx.fillRect(r.x + ox, r.y, r.w, r.h);
    }
  }
}

class PopSpikes {
  constructor(x, y, w, trigger, opts = {}) {
    this.x = x; this.y = y; this.w = w;
    this.dir = opts.dir ?? "up";
    this.size = opts.size ?? 26;
    this.delay = opts.delay ?? 0;
    this.trigger = trigger; // null => periodic
    this.period = opts.period ?? 0;
    this.phase = opts.phase ?? 0;
    this.holdOut = opts.holdOut ?? 0.8;
    this.speed = opts.speed ?? 14;
    this.reset();
  }
  reset() { this.out = 0; this.state = this.trigger ? "idle" : "cycle"; this.t = -this.delay; this.ct = this.phase; }
  update(dt, g) {
    if (this.state === "idle") {
      if (aabb(g.player, this.trigger)) { this.state = "popping"; this.t = -this.delay; }
    } else if (this.state === "popping") {
      this.t += dt;
      if (this.t >= 0) {
        if (this.out === 0) AudioFX.pop();
        this.out = clamp(this.out + this.speed * dt, 0, 1);
      }
    } else if (this.state === "cycle") {
      this.ct += dt;
      const cyc = this.ct % this.period;
      if (cyc < this.holdOut) {
        if (this.out < 0.1) AudioFX.pop();
        this.out = clamp(this.out + this.speed * dt, 0, 1);
      } else {
        this.out = clamp(this.out - this.speed * 0.6 * dt, 0, 1);
      }
    }
  }
  solids() { return []; }
  kills() {
    if (this.out < 0.45) return [];
    const h = this.size * this.out - 6;
    if (this.dir === "up") return [R(this.x + 4, this.y - h, this.w - 8, h)];
    return [R(this.x + 4, this.y, this.w - 8, h)];
  }
  draw() {
    if (this.out <= 0.01) return;
    const h = this.size * this.out;
    const n = Math.max(2, Math.round(this.w / 18));
    const sw = this.w / n;
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const bx = this.x + i * sw;
      if (this.dir === "up") {
        ctx.moveTo(bx, this.y);
        ctx.lineTo(bx + sw / 2, this.y - h);
        ctx.lineTo(bx + sw, this.y);
      } else {
        ctx.moveTo(bx, this.y);
        ctx.lineTo(bx + sw / 2, this.y + h);
        ctx.lineTo(bx + sw, this.y);
      }
    }
    ctx.fill();
  }
}

class FallBlock {
  constructor(rect, trigger, opts = {}) {
    this.home = { ...rect };
    this.trigger = trigger;
    this.shakeT = opts.shakeTime ?? 0.12;
    this.floorY = opts.floorY ?? 480;
    this.reset();
  }
  reset() { this.rect = { ...this.home }; this.state = "idle"; this.t = 0; this.vy = 0; }
  update(dt, g) {
    if (this.state === "idle" && aabb(g.player, this.trigger)) {
      this.state = "shake"; this.t = 0; AudioFX.rumble();
    } else if (this.state === "shake") {
      this.t += dt;
      if (this.t > this.shakeT) this.state = "fall";
    } else if (this.state === "fall") {
      this.vy += 3000 * dt;
      this.rect.y += this.vy * dt;
      if (this.rect.y + this.rect.h >= this.floorY) {
        this.rect.y = this.floorY - this.rect.h;
        this.state = "landed";
        AudioFX.slam();
        g.shake(7, 0.22);
        spawnDust(this.rect.x + this.rect.w / 2, this.floorY, 12);
      }
    }
  }
  solids() { return this.state === "fall" ? [] : [this.rect]; }
  kills() { return this.state === "fall" ? [R(this.rect.x + 3, this.rect.y + 4, this.rect.w - 6, this.rect.h - 4)] : []; }
  draw() {
    const r = this.rect;
    let ox = this.state === "shake" ? rand(-2, 2) : 0;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(r.x + ox, r.y, r.w, r.h);
    ctx.strokeStyle = theme.crack;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.3 + ox, r.y);
    ctx.lineTo(r.x + r.w * 0.45 + ox, r.y + r.h * 0.5);
    ctx.lineTo(r.x + r.w * 0.32 + ox, r.y + r.h);
    ctx.stroke();
  }
}

class Crusher {
  constructor(x, w, opts = {}) {
    this.x = x; this.w = w;
    this.topY = opts.topY ?? 0;
    this.headH = opts.headH ?? 46;
    this.floorY = opts.floorY ?? 480;
    this.period = opts.period ?? 0;
    this.phase = opts.phase ?? 0;
    this.trigger = opts.trigger ?? null;
    this.slamSpeed = opts.slamSpeed ?? 1500;
    this.upSpeed = opts.upSpeed ?? 240;
    this.holdT = opts.hold ?? 0.32;
    this.reset();
  }
  reset() {
    this.y = this.topY;
    this.state = this.trigger ? "armed" : "waiting";
    this.t = this.phase;
    this.slammed = false;
  }
  update(dt, g) {
    const maxY = this.floorY - this.headH;
    if (this.state === "armed") {
      if (aabb(g.player, this.trigger)) { this.state = "slam"; }
    } else if (this.state === "waiting") {
      this.t += dt;
      if (this.t >= this.period) { this.t = 0; this.state = "slam"; }
    } else if (this.state === "slam") {
      this.y += this.slamSpeed * dt;
      if (this.y >= maxY) {
        this.y = maxY;
        this.state = "hold"; this.t = 0;
        if (!this.slammed) { AudioFX.slam(); g.shake(6, 0.18); spawnDust(this.x + this.w / 2, this.floorY, 10); }
        this.slammed = true;
      }
    } else if (this.state === "hold") {
      this.t += dt;
      if (this.t >= this.holdT) this.state = "rise";
    } else if (this.state === "rise") {
      this.y -= this.upSpeed * dt;
      if (this.y <= this.topY) {
        this.y = this.topY;
        this.slammed = false;
        this.state = this.trigger ? "spent" : "waiting";
        this.t = 0;
      }
    }
  }
  headRect() { return R(this.x, this.y, this.w, this.headH); }
  solids() { return [this.headRect()]; }
  kills() {
    if (this.state === "slam") return [R(this.x + 2, this.y + this.headH - 14, this.w - 4, 16)];
    return [];
  }
  draw() {
    ctx.fillStyle = theme.metal;
    ctx.fillRect(this.x + this.w / 2 - 9, this.topY, 18, this.y - this.topY + 4);
    const h = this.headRect();
    ctx.fillStyle = theme.ink;
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(h.x, h.y + h.h - 12, h.w, 12);
    ctx.clip();
    ctx.fillStyle = theme.accent;
    for (let i = -1; i < h.w / 16 + 1; i++) {
      ctx.beginPath();
      ctx.moveTo(h.x + i * 16, h.y + h.h);
      ctx.lineTo(h.x + i * 16 + 8, h.y + h.h - 12);
      ctx.lineTo(h.x + i * 16 + 16, h.y + h.h - 12);
      ctx.lineTo(h.x + i * 16 + 8, h.y + h.h);
      ctx.fill();
    }
    ctx.restore();
  }
}

class CrumblePlatform {
  constructor(rect, opts = {}) {
    this.home = { ...rect };
    this.delay = opts.delay ?? 0.35;
    this.reset();
  }
  reset() { this.rect = { ...this.home }; this.state = "idle"; this.t = 0; this.vy = 0; }
  update(dt, g) {
    if (this.state === "idle") {
      const p = g.player;
      const standing = p.grounded &&
        Math.abs(p.y + p.h - this.rect.y) < 3 &&
        p.x + p.w > this.rect.x && p.x < this.rect.x + this.rect.w;
      if (standing) { this.state = "shaking"; this.t = 0; AudioFX.rumble(); }
    } else if (this.state === "shaking") {
      this.t += dt;
      if (this.t >= this.delay) this.state = "fall";
    } else if (this.state === "fall") {
      this.vy += 2400 * dt;
      this.rect.y += this.vy * dt;
    }
  }
  solids() { return this.state === "fall" ? [] : [this.rect]; }
  kills() { return []; }
  draw() {
    if (this.rect.y > H + 40) return;
    const ox = this.state === "shaking" ? rand(-2, 2) : 0;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(this.rect.x + ox, this.rect.y, this.rect.w, this.rect.h);
    ctx.fillStyle = theme.crack;
    for (let i = 1; i < 3; i++)
      ctx.fillRect(this.rect.x + (this.rect.w / 3) * i - 1 + ox, this.rect.y + 2, 2, this.rect.h - 4);
  }
}

class SlidingHole {
  constructor(x0, x1, opts = {}) {
    this.x0 = x0; this.x1 = x1;
    this.y = opts.y ?? 480;
    this.h = opts.h ?? 60;
    this.gapW = opts.gapW ?? 92;
    this.startGap = opts.startGap ?? x1 - 100;
    this.speed = opts.speed ?? 130;
    this.trigger = opts.trigger ?? null;
    this.homing = opts.homing ?? true;
    this.reset();
  }
  reset() { this.gx = this.startGap; this.active = !this.trigger; }
  update(dt, g) {
    if (!this.active && this.trigger && aabb(g.player, this.trigger)) { this.active = true; AudioFX.rumble(); }
    if (!this.active) return;
    const target = clamp(g.player.x + g.player.w / 2, this.x0 + this.gapW / 2 + 4, this.x1 - this.gapW / 2 - 4);
    const d = target - this.gx;
    const step = clamp(d, -this.speed * dt, this.speed * dt);
    this.gx += step;
  }
  solids() {
    const gl = this.gx - this.gapW / 2, gr = this.gx + this.gapW / 2;
    const out = [];
    if (gl > this.x0 + 2) out.push(R(this.x0, this.y, gl - this.x0, this.h));
    if (gr < this.x1 - 2) out.push(R(gr, this.y, this.x1 - gr, this.h));
    return out;
  }
  kills() { return []; }
  draw() {
    ctx.fillStyle = theme.ink;
    for (const s of this.solids()) ctx.fillRect(s.x, s.y, s.w, s.h);
    const gl = this.gx - this.gapW / 2, gr = this.gx + this.gapW / 2;
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(gl, this.y + i * 18);
      ctx.lineTo(gl + 7, this.y + i * 18 + 9);
      ctx.lineTo(gl, this.y + i * 18 + 18);
      ctx.moveTo(gr, this.y + i * 18);
      ctx.lineTo(gr - 7, this.y + i * 18 + 9);
      ctx.lineTo(gr, this.y + i * 18 + 18);
    }
    ctx.fill();
  }
}

class StaticSpikes {
  constructor(x, y, w, opts = {}) {
    this.x = x; this.y = y; this.w = w;
    this.size = opts.size ?? 26;
    this.dir = opts.dir ?? "up";
  }
  reset() {}
  update() {}
  solids() { return []; }
  kills() {
    if (this.dir === "up") return [R(this.x + 4, this.y - this.size + 8, this.w - 8, this.size - 8)];
    return [R(this.x + 4, this.y, this.w - 8, this.size - 8)];
  }
  draw() {
    const n = Math.max(2, Math.round(this.w / 18)), sw = this.w / n;
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const bx = this.x + i * sw;
      if (this.dir === "up") {
        ctx.moveTo(bx, this.y); ctx.lineTo(bx + sw / 2, this.y - this.size); ctx.lineTo(bx + sw, this.y);
      } else {
        ctx.moveTo(bx, this.y); ctx.lineTo(bx + sw / 2, this.y + this.size); ctx.lineTo(bx + sw, this.y);
      }
    }
    ctx.fill();
  }
}

class InvertZone {
  constructor(rect) { this.rect = rect; }
  reset() {}
  update(dt, g) { if (aabb(g.player, this.rect)) g.invertControls = true; }
  solids() { return []; }
  kills() { return []; }
  draw() {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = theme.accent;
    ctx.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = theme.accent;
    ctx.font = `900 30px ${FONT}`;
    ctx.textAlign = "center";
    ctx.translate(this.rect.x + this.rect.w / 2, this.rect.y + 60);
    ctx.rotate(Math.PI);
    ctx.fillText("?", 0, 0);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- NEW TRAPS

class MovingPlatform {
  // ferries the player. Moves between (x,y) and (toX,toY) with easing + pause at ends.
  constructor(rect, opts = {}) {
    this.w = rect.w; this.h = rect.h;
    this.ax = rect.x; this.ay = rect.y;
    this.bx = opts.toX ?? rect.x; this.by = opts.toY ?? rect.y;
    this.speed = opts.speed ?? 80;
    this.phase = opts.phase ?? 0;
    this.pause = opts.pause ?? 0;
    this.reset();
  }
  reset() {
    const dist = Math.hypot(this.bx - this.ax, this.by - this.ay) || 1;
    this.travel = dist / this.speed;
    this.cycle = this.travel * 2 + this.pause * 2;
    this.t = this.phase * this.cycle;
    const p = this._posAt(this.t);
    this.px = p.x; this.py = p.y; this.dx = 0; this.dy = 0;
  }
  _posAt(t) {
    let u = ((t % this.cycle) + this.cycle) % this.cycle;
    let f;
    if (u < this.travel) f = u / this.travel;
    else if (u < this.travel + this.pause) f = 1;
    else if (u < this.travel * 2 + this.pause) f = 1 - (u - this.travel - this.pause) / this.travel;
    else f = 0;
    const e = easeInOut(f);
    return { x: lerp(this.ax, this.bx, e), y: lerp(this.ay, this.by, e) };
  }
  update(dt, g) {
    const prevx = this.px, prevy = this.py;
    this.t += dt;
    const p = this._posAt(this.t);
    this.px = p.x; this.py = p.y;
    this.dx = this.px - prevx; this.dy = this.py - prevy;
    const pl = g.player;
    const onTop = pl.vy >= -1 &&
      pl.x + pl.w > prevx + 2 && pl.x < prevx + this.w - 2 &&
      Math.abs((pl.y + pl.h) - prevy) <= 8;
    if (onTop) { pl.x += this.dx; pl.y += this.dy; }
  }
  solids() { return [R(this.px, this.py, this.w, this.h)]; }
  kills() { return []; }
  draw() {
    ctx.fillStyle = theme.ink;
    roundRect(this.px, this.py, this.w, this.h, 4); ctx.fill();
    ctx.fillStyle = theme.paper;
    for (let i = 0; i < 3; i++)
      ctx.fillRect(this.px + this.w / 2 - 14 + i * 12, this.py + this.h / 2 - 1.5, 6, 3);
  }
}

class Conveyor {
  // a solid belt that pushes whoever stands on it.
  constructor(rect, opts = {}) {
    this.rect = { ...rect };
    this.dir = opts.dir ?? 1;
    this.force = opts.force ?? 150;
    this.reset();
  }
  reset() { this.t = 0; }
  update(dt, g) {
    this.t += dt * this.dir;
    const p = g.player, r = this.rect;
    const standing = p.grounded && Math.abs((p.y + p.h) - r.y) < 4 &&
      p.x + p.w > r.x && p.x < r.x + r.w;
    if (standing) p.x += this.dir * this.force * dt;
  }
  solids() { return [this.rect]; }
  kills() { return []; }
  draw() {
    const r = this.rect;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.fillStyle = theme.paper;
    const off = (this.t * 70) % 40;
    for (let x = r.x - 40 + off; x < r.x + r.w; x += 40) {
      ctx.beginPath();
      if (this.dir > 0) {
        ctx.moveTo(x, r.y + 10); ctx.lineTo(x + 12, r.y + r.h / 2); ctx.lineTo(x, r.y + r.h - 10);
      } else {
        ctx.moveTo(x + 12, r.y + 10); ctx.lineTo(x, r.y + r.h / 2); ctx.lineTo(x + 12, r.y + r.h - 10);
      }
      ctx.lineWidth = 3; ctx.strokeStyle = theme.paper; ctx.stroke();
    }
    ctx.restore();
  }
}

class Spring {
  // non-solid bounce pad. preserves horizontal momentum for running spring-jumps.
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y; this.w = opts.w ?? 50; this.h = opts.h ?? 14;
    this.power = opts.power ?? -980;
    this.reset();
  }
  reset() { this.c = 0; }
  update(dt, g) {
    this.c = Math.max(0, this.c - dt * 5);
    const p = g.player;
    const overX = p.x + p.w > this.x + 3 && p.x < this.x + this.w - 3;
    const bottom = p.y + p.h;
    if (overX && p.vy >= 0 && bottom >= this.y - 6 && bottom <= this.y + 40) {
      p.y = this.y - p.h;
      p.vy = this.power;
      p.grounded = false;
      this.c = 1;
      AudioFX.bounce();
      spawnDust(this.x + this.w / 2, this.y, 6);
    }
  }
  solids() { return []; }
  kills() { return []; }
  draw() {
    const comp = this.c * 6;
    const top = this.y + comp;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const coils = 3;
    for (let i = 0; i <= coils; i++) {
      const yy = lerp(this.y + this.h + 6, top + 4, i / coils);
      const xx = this.x + (i % 2 === 0 ? 6 : this.w - 6);
      if (i === 0) ctx.moveTo(this.x + 6, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.fillStyle = theme.accent;
    roundRect(this.x, top, this.w, 7, 3); ctx.fill();
  }
}

class Saw {
  // spinning blade gliding along a polyline (ping-pong).
  constructor(path, opts = {}) {
    this.path = path.map((p) => ({ ...p }));
    this.r = opts.r ?? 22;
    this.speed = opts.speed ?? 130;
    this.reset();
  }
  reset() {
    this.seg = 0; this.dir = 1; this.f = 0; this.spin = 0;
    this.x = this.path[0].x; this.y = this.path[0].y;
  }
  update(dt) {
    this.spin += dt * 9;
    if (this.path.length < 2) return;
    const a = this.path[this.seg];
    const b = this.path[this.seg + this.dir];
    if (!b) { this.dir *= -1; return; }
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    this.f += (this.speed * dt) / len;
    while (this.f >= 1) {
      this.f -= 1;
      this.seg += this.dir;
      if (this.seg + this.dir < 0 || this.seg + this.dir >= this.path.length) {
        this.dir *= -1;
      }
    }
    const a2 = this.path[this.seg], b2 = this.path[this.seg + this.dir] || a2;
    this.x = lerp(a2.x, b2.x, this.f);
    this.y = lerp(a2.y, b2.y, this.f);
  }
  solids() { return []; }
  kills() { return [R(this.x - this.r * 0.66, this.y - this.r * 0.66, this.r * 1.32, this.r * 1.32)]; }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spin);
    ctx.fillStyle = theme.ink;
    const teeth = 10;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
      ctx.lineTo(Math.cos(a0) * this.r, Math.sin(a0) * this.r);
      ctx.lineTo(Math.cos(a1) * this.r * 0.74, Math.sin(a1) * this.r * 0.74);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = theme.paper;
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

class Laser {
  // telegraphed beam. off -> warn -> fire, cyclic.
  constructor(opts = {}) {
    this.x = opts.x; this.y = opts.y; this.len = opts.len ?? 400;
    this.vertical = opts.vertical ?? false;
    this.thick = opts.thick ?? 10;
    this.period = opts.period ?? 2.2;
    this.warn = opts.warn ?? 0.55;
    this.fire = opts.fire ?? 0.5;
    this.phase = opts.phase ?? 0;
    this.reset();
  }
  reset() { this.t = this.phase * this.period; this.fired = false; }
  update(dt) {
    this.t += dt;
    const st = this._state();
    if (st === "fire" && !this.fired) { AudioFX.zap(); this.fired = true; }
    if (st !== "fire") this.fired = false;
    if (st === "warn" && Math.random() < 0.06) AudioFX.beep();
  }
  _state() {
    const u = this.t % this.period;
    if (u < this.period - this.warn - this.fire) return "off";
    if (u < this.period - this.fire) return "warn";
    return "fire";
  }
  _beam() {
    return this.vertical
      ? R(this.x - this.thick / 2, this.y, this.thick, this.len)
      : R(this.x, this.y - this.thick / 2, this.len, this.thick);
  }
  solids() { return []; }
  kills() { return this._state() === "fire" ? [this._beam()] : []; }
  draw() {
    const st = this._state();
    // emitter nubs
    ctx.fillStyle = theme.metal;
    if (this.vertical) {
      ctx.fillRect(this.x - 8, this.y - 8, 16, 8);
      ctx.fillRect(this.x - 8, this.y + this.len, 16, 8);
    } else {
      ctx.fillRect(this.x - 8, this.y - 8, 8, 16);
      ctx.fillRect(this.x + this.len, this.y - 8, 8, 16);
    }
    if (st === "off") return;
    const b = this._beam();
    if (st === "warn") {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = theme.danger;
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (this.vertical) { ctx.moveTo(this.x, this.y); ctx.lineTo(this.x, this.y + this.len); }
      else { ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.len, this.y); }
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = theme.danger;
      ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.danger;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = theme.paper;
      ctx.globalAlpha = 0.5;
      if (this.vertical) ctx.fillRect(b.x + b.w / 2 - 1, b.y, 2, b.h);
      else ctx.fillRect(b.x, b.y + b.h / 2 - 1, b.w, 2);
      ctx.restore();
    }
  }
}

class Teleporter {
  // step in A -> appear at B (and back if twoWay).
  constructor(ax, ay, bx, by, opts = {}) {
    const w = opts.w ?? 30, h = opts.h ?? 48;
    this.a = R(ax, ay, w, h);
    this.b = R(bx, by, w, h);
    this.twoWay = opts.twoWay ?? true;
    this.reset();
  }
  reset() { this.cool = 0; this.t = 0; }
  update(dt, g) {
    this.t += dt;
    this.cool = Math.max(0, this.cool - dt);
    if (this.cool > 0) return;
    const p = g.player;
    const warp = (from, to) => {
      spawnPoof(from.x + from.w / 2, from.y + from.h / 2);
      p.x = to.x + to.w / 2 - p.w / 2;
      p.y = to.y + to.h - p.h;
      p.vx = 0;
      this.cool = 0.45;
      AudioFX.poof();
      spawnPoof(to.x + to.w / 2, to.y + to.h / 2);
    };
    if (aabb(p, this.a)) warp(this.a, this.b);
    else if (this.twoWay && aabb(p, this.b)) warp(this.b, this.a);
  }
  solids() { return []; }
  kills() { return []; }
  _portal(r) {
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.ellipse(0, 0, r.w / 2 - 2, r.h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = this.t * 2 + i * 2.1;
      ctx.beginPath();
      ctx.ellipse(0, 0, (r.w / 2 - 4) * (0.4 + 0.2 * i), (r.h / 2 - 4) * (0.4 + 0.2 * i), a, 0, Math.PI * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }
  draw() { this._portal(this.a); if (this.twoWay) this._portal(this.b); else this._portal(this.b); }
}

class Button {
  // floor switch. sets g.flags[key]. momentary or latching.
  constructor(x, y, key, opts = {}) {
    this.x = x; this.y = y; this.w = opts.w ?? 44; this.h = 10;
    this.key = key;
    this.momentary = opts.momentary ?? false;
    this.reset();
  }
  reset() { this.pressed = false; this.dip = 0; }
  update(dt, g) {
    const hit = R(this.x, this.y - 8, this.w, this.h + 12);
    const on = aabb(g.player, hit);
    if (this.momentary) { this.pressed = on; }
    else if (on) { if (!this.pressed) AudioFX.beep(); this.pressed = true; }
    g.flags[this.key] = this.pressed;
    this.dip = clamp(this.dip + (this.pressed ? 1 : -1) * dt * 8, 0, 1);
  }
  solids() { return []; }
  kills() { return []; }
  draw() {
    ctx.fillStyle = theme.metal;
    ctx.fillRect(this.x + 4, this.y + 4, this.w - 8, this.h);
    ctx.fillStyle = this.pressed ? theme.accent : theme.ink;
    roundRect(this.x, this.y + this.dip * 5, this.w, 7, 3); ctx.fill();
  }
}

class Gate {
  // solid when closed; slides into the ceiling when its flag opens it.
  constructor(rect, key, opts = {}) {
    this.rect = { ...rect };
    this.key = key;
    this.invert = opts.invert ?? false;
    this.reset();
  }
  reset() { this.open = 0; }
  update(dt, g) {
    let want = !!g.flags[this.key];
    if (this.invert) want = !want;
    this.open = clamp(this.open + (want ? 1 : -1) * dt * 4, 0, 1);
  }
  _cur() {
    const r = this.rect;
    const shift = this.open * (r.h + 4);
    return R(r.x, r.y - shift, r.w, r.h);
  }
  solids() { return this.open > 0.92 ? [] : [this._cur()]; }
  kills() { return []; }
  draw() {
    const c = this._cur();
    ctx.fillStyle = theme.ink;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = theme.accent;
    for (let i = 0; i < 3; i++) ctx.fillRect(c.x + c.w / 2 - 2, c.y + 10 + i * (c.h / 3), 4, c.h / 6);
  }
}

class BlinkPlatform {
  // solid platform that phases in and out on a timer.
  constructor(rect, opts = {}) {
    this.rect = { ...rect };
    this.period = opts.period ?? 1.8;
    this.onFrac = opts.onFrac ?? 0.5;
    this.phase = opts.phase ?? 0;
    this.reset();
  }
  reset() { this.t = this.phase * this.period; }
  update(dt) { this.t += dt; }
  _on() { return (this.t % this.period) < this.period * this.onFrac; }
  solids() { return this._on() ? [this.rect] : []; }
  kills() { return []; }
  draw() {
    const on = this._on();
    const r = this.rect;
    if (on) {
      ctx.fillStyle = theme.ink;
      roundRect(r.x, r.y, r.w, r.h, 4); ctx.fill();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = theme.ink;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      roundRect(r.x, r.y, r.w, r.h, 4); ctx.stroke();
      ctx.restore();
    }
  }
}

class Pendulum {
  // swinging spiked bob mounted at (px,py).
  constructor(px, py, opts = {}) {
    this.px = px; this.py = py;
    this.len = opts.len ?? 380;
    this.amp = opts.amp ?? 0.85;
    this.speed = opts.speed ?? 1.6;
    this.r = opts.r ?? 18;
    this.phase = opts.phase ?? 0;
    this.reset();
  }
  reset() { this.t = this.phase; }
  update(dt) { this.t += dt; }
  _ang() { return Math.sin(this.t * this.speed) * this.amp; }
  _bob() { const a = this._ang(); return { x: this.px + Math.sin(a) * this.len, y: this.py + Math.cos(a) * this.len }; }
  solids() { return []; }
  kills() { const b = this._bob(); return [R(b.x - this.r * 0.66, b.y - this.r * 0.66, this.r * 1.32, this.r * 1.32)]; }
  draw() {
    const b = this._bob();
    ctx.strokeStyle = theme.metal;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(this.px, this.py); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.fillStyle = theme.ink;
    ctx.beginPath(); ctx.arc(this.px, this.py, 5, 0, Math.PI * 2); ctx.fill();
    // spiked bob
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = theme.ink;
    const teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
      ctx.lineTo(Math.cos(a0) * this.r, Math.sin(a0) * this.r);
      ctx.lineTo(Math.cos(a1) * this.r * 0.7, Math.sin(a1) * this.r * 0.7);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

class Turret {
  // fires projectiles horizontally on a timer.
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y;
    this.dir = opts.dir ?? -1;
    this.period = opts.period ?? 1.6;
    this.speed = opts.speed ?? 260;
    this.phase = opts.phase ?? 0;
    this.r = opts.r ?? 7;
    this.reset();
  }
  reset() { this.t = this.phase * this.period; this.shots = []; }
  update(dt) {
    this.t += dt;
    if (this.t >= this.period) { this.t -= this.period; this.shots.push({ x: this.x, y: this.y }); AudioFX.pop(); }
    for (const s of this.shots) s.x += this.dir * this.speed * dt;
    this.shots = this.shots.filter((s) => s.x > -30 && s.x < W + 30);
  }
  solids() { return []; }
  kills() { return this.shots.map((s) => R(s.x - this.r, s.y - this.r, this.r * 2, this.r * 2)); }
  draw() {
    ctx.fillStyle = theme.metal;
    ctx.fillRect(this.x - (this.dir < 0 ? 4 : 14), this.y - 11, 18, 22);
    ctx.fillRect(this.x + (this.dir < 0 ? -14 : 6), this.y - 4, 10, 8);
    ctx.fillStyle = theme.danger;
    for (const s of this.shots) {
      ctx.beginPath(); ctx.arc(s.x, s.y, this.r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- door
function drawDoorShape(x, y, w, h, color = null) {
  ctx.fillStyle = color || theme.door;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + 14);
  ctx.quadraticCurveTo(x, y, x + w / 2, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 14);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = theme.paper;
  ctx.beginPath();
  ctx.arc(x + w - 9, y + h / 2 + 4, 3.4, 0, Math.PI * 2);
  ctx.fill();
}

class FakeDoor {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y; this.w = 38; this.h = 64;
    this.label = opts.label ?? null;
    this.reset();
  }
  reset() { this.sprung = false; this.out = 0; }
  update(dt, g) {
    if (!this.sprung && aabb(g.player, R(this.x - 2, this.y, this.w + 4, this.h))) {
      this.sprung = true;
      AudioFX.laugh();
    }
    if (this.sprung) this.out = clamp(this.out + 16 * dt, 0, 1);
  }
  solids() { return []; }
  kills() { return this.out > 0.4 ? [R(this.x - 6, this.y, this.w + 12, this.h)] : []; }
  draw() {
    drawDoorShape(this.x, this.y, this.w, this.h);
    if (this.label) {
      ctx.fillStyle = theme.ink;
      ctx.globalAlpha = 0.45;
      ctx.font = `italic 15px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(this.label, this.x + this.w / 2, this.y - 12);
      ctx.globalAlpha = 1;
    }
    if (this.out > 0.01) {
      const n = 4;
      ctx.fillStyle = theme.ink;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const by = this.y + this.h - i * (this.h / n);
        const len = 30 * this.out;
        ctx.moveTo(this.x + 4, by);
        ctx.lineTo(this.x - len, by - this.h / n / 2);
        ctx.lineTo(this.x + 4, by - this.h / n);
        ctx.moveTo(this.x + this.w - 4, by);
        ctx.lineTo(this.x + this.w + len, by - this.h / n / 2);
        ctx.lineTo(this.x + this.w - 4, by - this.h / n);
      }
      ctx.fill();
    }
  }
}

class Door {
  constructor(positions, opts = {}) {
    this.positions = positions.map((p) => ({ ...p }));
    this.fleeDist = opts.fleeDist ?? 110;
    this.w = 38; this.h = 64;
    this.reset();
  }
  reset() { this.i = 0; this.poofT = 0; }
  get pos() { return this.positions[this.i]; }
  update(dt, g) {
    this.poofT = Math.max(0, this.poofT - dt);
    if (this.i < this.positions.length - 1) {
      const p = g.player;
      const dx = (p.x + p.w / 2) - (this.pos.x + this.w / 2);
      const dy = (p.y + p.h / 2) - (this.pos.y + this.h / 2);
      if (Math.hypot(dx, dy) < this.fleeDist) {
        spawnPoof(this.pos.x + this.w / 2, this.pos.y + this.h / 2);
        this.i++;
        this.poofT = 0.25;
        spawnPoof(this.pos.x + this.w / 2, this.pos.y + this.h / 2);
        AudioFX.poof();
        if (this.i === this.positions.length - 1) AudioFX.laugh();
      }
    }
  }
  playerWins(p) {
    const r = R(this.pos.x + 6, this.pos.y + 6, this.w - 12, this.h - 6);
    return this.i === this.positions.length - 1 && aabb(p, r);
  }
  draw() {
    const s = this.poofT > 0 ? 1 + this.poofT * 1.2 : 1;
    ctx.save();
    ctx.translate(this.pos.x + this.w / 2, this.pos.y + this.h);
    ctx.scale(s, s);
    ctx.translate(-(this.w / 2), -this.h);
    drawDoorShape(0, 0, this.w, this.h);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- decor text
class Note {
  constructor(x, y, text, opts = {}) {
    this.x = x; this.y = y; this.text = text;
    this.size = opts.size ?? 16;
    this.angle = opts.angle ?? 0;
  }
  reset() {} update() {} solids() { return []; } kills() { return []; }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = theme.ink;
    ctx.globalAlpha = 0.36;
    ctx.font = `italic ${this.size}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }
}

// ================================================================ LEVELS
const floorSeg = (x0, x1, y = 480) => R(x0, y, x1 - x0, H - y);
const wallL = () => R(-40, -200, 40, H + 400);
const wallR = () => R(W, -200, 40, H + 400);
const roof = (h = 30) => R(0, 0, W, h);

const LEVELS = [
  // ---------------------------------------------------- 1
  {
    name: "NOTHING TO SEE HERE",
    build: () => ({
      spawn: { x: 60, y: 440 },
      door: new Door([{ x: 876, y: 416 }]),
      solids: [floorSeg(0, 400), floorSeg(500, 960), wallL(), wallR()],
      traps: [
        new CollapseFloor(R(400, 480, 100, 60), R(330, 300, 30, 180)),
        new PopSpikes(760, 480, 80, R(708, 330, 26, 150), { delay: 0.06 }),
        new Note(210, 430, "just walk to the door :)"),
      ],
    }),
  },
  // ---------------------------------------------------- 2
  {
    name: "TRUST ISSUES",
    build: () => ({
      spawn: { x: 60, y: 440 },
      door: new Door([{ x: 876, y: 416 }]),
      solids: [floorSeg(0, 200), floorSeg(760, 960), wallL(), wallR()],
      traps: [
        new CrumblePlatform(R(270, 408, 92, 16), { delay: 0.32 }),
        new CrumblePlatform(R(430, 360, 92, 16), { delay: 0.32 }),
        new CrumblePlatform(R(590, 408, 92, 16), { delay: 0.18 }),
        new FallBlock(R(440, 40, 70, 42), R(430, 200, 92, 170), { floorY: 540 }),
        new PopSpikes(764, 480, 70, R(700, 330, 20, 150), { delay: 0.02 }),
        new Note(310, 380, "they look sturdy", { angle: -0.05 }),
      ],
    }),
  },
  // ---------------------------------------------------- 3
  {
    name: "POINTY SITUATION",
    build: () => ({
      spawn: { x: 50, y: 440 },
      door: new Door([{ x: 880, y: 416 }]),
      solids: [floorSeg(0, 960), wallL(), wallR()],
      traps: [
        new PopSpikes(220, 480, 64, null, { period: 1.7, phase: 0.0, holdOut: 0.75 }),
        new PopSpikes(330, 480, 64, null, { period: 1.7, phase: 0.28, holdOut: 0.75 }),
        new PopSpikes(440, 480, 64, null, { period: 1.7, phase: 0.56, holdOut: 0.75 }),
        new PopSpikes(550, 480, 64, null, { period: 1.7, phase: 0.84, holdOut: 0.75 }),
        new PopSpikes(660, 480, 64, null, { period: 1.7, phase: 1.12, holdOut: 0.75 }),
        new PopSpikes(790, 480, 76, R(742, 330, 18, 150), { delay: 0.05 }),
        new Note(120, 420, "find the rhythm", { angle: 0.04 }),
      ],
    }),
  },
  // ---------------------------------------------------- 4
  {
    name: "THE SKY IS FALLING",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 876, y: 416 }]),
      solids: [floorSeg(0, 960), roof(40), wallL(), wallR()],
      traps: [
        new FallBlock(R(200, 40, 64, 42), R(180, 200, 104, 280)),
        new FallBlock(R(360, 40, 64, 42), R(340, 200, 104, 280)),
        new FallBlock(R(520, 40, 64, 42), R(500, 200, 104, 280)),
        new FallBlock(R(680, 40, 64, 42), R(660, 200, 104, 280)),
        new FallBlock(R(820, 40, 76, 42), R(770, 200, 40, 280), { shakeTime: 0.04 }),
        new Note(120, 100, "look up.", { size: 14 }),
      ],
    }),
  },
  // ---------------------------------------------------- 5  (NEW: moving platform)
  {
    name: "GOING UP?",
    build: () => ({
      spawn: { x: 60, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 300), floorSeg(620, 960), wallL(), wallR()],
      traps: [
        new MovingPlatform(R(300, 452, 100, 16), { toX: 520, speed: 95, pause: 0.5 }),
        new Note(160, 430, "hop on. free ride :)"),
        new PopSpikes(806, 480, 70, R(706, 330, 18, 150), { delay: 0.05 }),
      ],
    }),
  },
  // ---------------------------------------------------- 6  (fleeing door)
  {
    name: "COME BACK HERE!",
    build: () => ({
      spawn: { x: 60, y: 440 },
      door: new Door(
        [
          { x: 870, y: 416 },
          { x: 470, y: 416 },
          { x: 120, y: 416 },
          { x: 856, y: 288 },
        ],
        { fleeDist: 105 }
      ),
      solids: [floorSeg(0, 960), R(640, 420, 92, 14), R(800, 352, 160, 16), wallL(), wallR()],
      traps: [
        new PopSpikes(652, 420, 68, R(640, 320, 92, 100), { delay: 0.45 }),
        new Note(760, 250, "it just wants a hug"),
      ],
    }),
  },
  // ---------------------------------------------------- 7  (NEW: conveyor)
  {
    name: "TREADMILL DAY",
    build: () => ({
      spawn: { x: 150, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(120, 960), wallL(), wallR()],
      traps: [
        new Conveyor(R(300, 480, 320, 60), { dir: -1, force: 165 }),
        new Note(450, 430, "keep walking →"),
        new PopSpikes(812, 480, 66, R(720, 330, 16, 150), { delay: 0.04 }),
      ],
    }),
  },
  // ---------------------------------------------------- 8  (sliding hole)
  {
    name: "THE FLOOR HATES YOU",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 880, y: 416 }]),
      solids: [wallL(), wallR()],
      traps: [
        new SlidingHole(0, 960, { gapW: 96, startGap: 760, speed: 150, trigger: R(120, 300, 20, 180) }),
        new PopSpikes(806, 480, 64, R(756, 330, 16, 150), { delay: 0.03 }),
        new Note(420, 420, "the hole is friendly", { angle: -0.03 }),
      ],
    }),
  },
  // ---------------------------------------------------- 9  (NEW: spring)
  {
    name: "BOING",
    build: () => ({
      spawn: { x: 60, y: 440 },
      door: new Door([{ x: 884, y: 226 }]),
      solids: [floorSeg(0, 440), R(480, 290, 480, 16), wallL(), wallR()],
      traps: [
        new Spring(360, 480, { power: -1220 }),
        new Note(160, 430, "trampoline time"),
        new PopSpikes(700, 290, 60, R(580, 200, 18, 90), { delay: 0.3 }),
      ],
    }),
  },
  // ---------------------------------------------------- 10 (invert)
  {
    name: "?NOISUFNOC",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 880, y: 416 }]),
      solids: [floorSeg(0, 350), floorSeg(430, 540), floorSeg(620, 960), wallL(), wallR()],
      traps: [
        new InvertZone(R(280, 0, 420, 480)),
        new StaticSpikes(355, 540, 70, { dir: "up", size: 40 }),
        new StaticSpikes(545, 540, 70, { dir: "up", size: 40 }),
        new PopSpikes(700, 480, 64, R(648, 330, 16, 150), { delay: 0.4 }),
        new Note(490, 300, "sdrawkcab", { size: 18 }),
      ],
    }),
  },
  // ---------------------------------------------------- 11 (NEW: blink platforms)
  {
    name: "NOW YOU SEE IT",
    build: () => ({
      spawn: { x: 60, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 250), floorSeg(740, 960), wallL(), wallR()],
      traps: [
        new BlinkPlatform(R(300, 430, 96, 16), { period: 1.7, onFrac: 0.62, phase: 0.0 }),
        new BlinkPlatform(R(444, 400, 96, 16), { period: 1.7, onFrac: 0.62, phase: 0.34 }),
        new BlinkPlatform(R(588, 430, 96, 16), { period: 1.7, onFrac: 0.62, phase: 0.68 }),
        new Note(150, 430, "now you don't"),
        new PopSpikes(806, 480, 66, R(720, 330, 16, 150), { delay: 0.05 }),
      ],
    }),
  },
  // ---------------------------------------------------- 12 (fake doors)
  {
    name: "PICK A DOOR",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), wallL(), wallR()],
      traps: [
        new FakeDoor(380, 416, { label: "definitely this one" }),
        new FakeDoor(600, 416, { label: "or this one?" }),
        new FallBlock(R(800, 40, 70, 42), R(745, 200, 50, 280), { shakeTime: 0.05 }),
        new PopSpikes(700, 480, 70, R(560, 330, 30, 150), { delay: 0.85 }),
        new Note(884 + 19, 396, "scam", { size: 13, angle: 0.06 }),
      ],
    }),
  },
  // ---------------------------------------------------- 13 (NEW: saw)
  {
    name: "SAW IT COMING",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), roof(30), wallL(), wallR()],
      traps: [
        new Saw([{ x: 300, y: 444 }, { x: 640, y: 444 }], { r: 24, speed: 165 }),
        new Saw([{ x: 520, y: 90 }, { x: 520, y: 430 }], { r: 22, speed: 185 }),
        new Note(150, 430, "perfectly safe"),
        new PopSpikes(820, 480, 64, R(740, 330, 16, 150), { delay: 0.04 }),
      ],
    }),
  },
  // ---------------------------------------------------- 14 (crushers)
  {
    name: "FLAT EARTH SOCIETY",
    build: () => ({
      spawn: { x: 50, y: 440 },
      door: new Door([{ x: 880, y: 416 }]),
      solids: [floorSeg(0, 960), roof(36), wallL(), wallR()],
      traps: [
        new Crusher(230, 92, { topY: 36, period: 1.9, phase: 0.0 }),
        new Crusher(450, 92, { topY: 36, period: 1.9, phase: 0.95 }),
        new Crusher(640, 92, { topY: 36, period: 1.9, phase: 0.45 }),
        new Crusher(806, 100, { topY: 36, trigger: R(770, 320, 12, 160), slamSpeed: 2100 }),
        new Note(340, 110, "nice and flat here"),
      ],
    }),
  },
  // ---------------------------------------------------- 15 (NEW: laser)
  {
    name: "SAY CHEESE",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), roof(30), wallL(), wallR()],
      traps: [
        new Laser({ x: 300, y: 30, len: 418, vertical: true, period: 2.2, warn: 0.55, fire: 0.5, phase: 0.0 }),
        new Laser({ x: 480, y: 30, len: 418, vertical: true, period: 2.2, warn: 0.55, fire: 0.5, phase: 0.5 }),
        new Laser({ x: 660, y: 30, len: 418, vertical: true, period: 2.2, warn: 0.55, fire: 0.5, phase: 1.0 }),
        new Note(150, 430, "hold still"),
        new PopSpikes(820, 480, 64, R(740, 330, 16, 150), { delay: 0.04 }),
      ],
    }),
  },
  // ---------------------------------------------------- 16 (NEW: teleporter)
  {
    name: "MIND THE GAP",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 360), floorSeg(620, 960), wallL(), wallR()],
      traps: [
        new StaticSpikes(360, 540, 260, { dir: "up", size: 44 }),
        new Teleporter(300, 432, 648, 432, { w: 30, h: 48, twoWay: false }),
        new Note(170, 430, "step in →"),
        new PopSpikes(806, 480, 66, R(720, 330, 16, 150), { delay: 0.05 }),
      ],
    }),
  },
  // ---------------------------------------------------- 17 (NEW: pendulum)
  {
    name: "TICK TOCK",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), roof(30), wallL(), wallR()],
      traps: [
        new Pendulum(240, 30, { len: 400, amp: 0.85, speed: 1.6, r: 18, phase: 0.0 }),
        new Pendulum(470, 30, { len: 400, amp: 0.85, speed: 1.6, r: 18, phase: 1.1 }),
        new Pendulum(700, 30, { len: 400, amp: 0.85, speed: 1.6, r: 18, phase: 2.2 }),
        new Note(150, 430, "mind the swing"),
        new PopSpikes(844, 480, 58, R(764, 330, 14, 150), { delay: 0.04 }),
      ],
    }),
  },
  // ---------------------------------------------------- 18 (NEW: turret)
  {
    name: "INCOMING",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), wallL(), wallR()],
      traps: [
        new Turret(942, 430, { dir: -1, period: 1.3, speed: 300, phase: 0.0 }),
        new Turret(942, 388, { dir: -1, period: 1.7, speed: 250, phase: 0.6 }),
        new Note(150, 430, "duck! (you can't)"),
        new PopSpikes(300, 480, 64, null, { period: 1.8, phase: 0, holdOut: 0.7 }),
      ],
    }),
  },
  // ---------------------------------------------------- 19 (NEW: button + gate)
  {
    name: "PRESS TO WIN",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), wallL(), wallR()],
      traps: [
        new Button(330, 470, "g", { momentary: false }),
        new Gate(R(620, 300, 28, 180), "g"),
        new FakeDoor(720, 416, { label: "this way!" }),
        new PopSpikes(812, 480, 66, R(740, 330, 16, 150), { delay: 0.05 }),
        new Note(352, 440, "press to open the gate"),
      ],
    }),
  },
  // ---------------------------------------------------- 20 (NEW: ferries + spikes)
  {
    name: "ELEVATOR ACTION",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 300), floorSeg(660, 960), R(450, 330, 120, 16), wallL(), wallR()],
      traps: [
        new StaticSpikes(300, 540, 360, { dir: "up", size: 46 }),
        new MovingPlatform(R(300, 452, 120, 16), { toY: 320, speed: 62, pause: 0.45 }),
        new MovingPlatform(R(560, 320, 120, 16), { toY: 452, speed: 62, pause: 0.45, phase: 0.5 }),
        new Note(150, 430, "going up ↑"),
        new PopSpikes(812, 480, 64, R(740, 330, 16, 150), { delay: 0.05 }),
      ],
    }),
  },
  // ---------------------------------------------------- 21 (NEW: conveyor + crushers)
  {
    name: "RUNAWAY BELT",
    build: () => ({
      spawn: { x: 80, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), roof(30), wallL(), wallR()],
      traps: [
        new Conveyor(R(260, 480, 420, 60), { dir: 1, force: 150 }),
        new Crusher(360, 90, { topY: 30, period: 1.7, phase: 0.0 }),
        new Crusher(520, 90, { topY: 30, period: 1.7, phase: 0.85 }),
        new Crusher(660, 90, { topY: 30, period: 1.7, phase: 0.4 }),
        new Note(150, 430, "belt + hammers, fun"),
        new PopSpikes(812, 480, 64, R(740, 330, 16, 150), { delay: 0.04 }),
      ],
    }),
  },
  // ---------------------------------------------------- 22 (NEW: springs)
  {
    name: "SPRING FEVER",
    build: () => ({
      spawn: { x: 60, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 300), floorSeg(460, 650), floorSeg(790, 960), wallL(), wallR()],
      traps: [
        new StaticSpikes(300, 540, 160, { dir: "up", size: 44 }),
        new StaticSpikes(650, 540, 140, { dir: "up", size: 44 }),
        new Spring(250, 480, { power: -1080 }),
        new Spring(600, 480, { power: -1080 }),
        new Note(150, 430, "run and bounce →"),
        new PopSpikes(820, 480, 64, R(742, 330, 16, 150), { delay: 0.05 }),
      ],
    }),
  },
  // ---------------------------------------------------- 23 (NEW: blink + saw)
  {
    name: "PEEKABOO",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 260), floorSeg(700, 960), wallL(), wallR()],
      traps: [
        new StaticSpikes(260, 540, 440, { dir: "up", size: 46 }),
        new BlinkPlatform(R(320, 420, 100, 16), { period: 1.6, onFrac: 0.6, phase: 0.0 }),
        new BlinkPlatform(R(540, 420, 100, 16), { period: 1.6, onFrac: 0.6, phase: 0.5 }),
        new Saw([{ x: 480, y: 150 }, { x: 480, y: 360 }], { r: 22, speed: 180 }),
        new Note(150, 430, "time it"),
        new PopSpikes(806, 480, 66, R(720, 330, 16, 150), { delay: 0.05 }),
      ],
    }),
  },
  // ---------------------------------------------------- 24 (NEW: turret + laser)
  {
    name: "CROSSFIRE",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), roof(30), wallL(), wallR()],
      traps: [
        new Turret(942, 430, { dir: -1, period: 1.2, speed: 300 }),
        new Laser({ x: 430, y: 30, len: 418, vertical: true, period: 2.0, warn: 0.5, fire: 0.45, phase: 0.0 }),
        new Laser({ x: 620, y: 30, len: 418, vertical: true, period: 2.0, warn: 0.5, fire: 0.45, phase: 0.5 }),
        new Note(150, 430, "crossfire!"),
        new PopSpikes(280, 480, 64, null, { period: 1.7, phase: 0, holdOut: 0.7 }),
      ],
    }),
  },
  // ---------------------------------------------------- 25 (NEW: teleporter + platform)
  {
    name: "PORTAL HOPPER",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 196 }]),
      solids: [floorSeg(0, 300), floorSeg(640, 960), R(760, 260, 200, 16), wallL(), wallR()],
      traps: [
        new StaticSpikes(300, 540, 340, { dir: "up", size: 46 }),
        new MovingPlatform(R(320, 452, 100, 16), { toX: 520, speed: 95, pause: 0.4 }),
        new Teleporter(700, 432, 820, 222, { w: 30, h: 48, twoWay: false }),
        new Note(150, 430, "ride, then warp up"),
        new PopSpikes(806, 260, 60, R(720, 180, 16, 80), { delay: 0.05 }),
      ],
    }),
  },
  // ---------------------------------------------------- 26 (NEW: pop spikes + lasers)
  {
    name: "RHYTHM HELL",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 960), roof(30), wallL(), wallR()],
      traps: [
        new PopSpikes(240, 480, 64, null, { period: 1.5, phase: 0.0, holdOut: 0.7 }),
        new PopSpikes(360, 480, 64, null, { period: 1.5, phase: 0.3, holdOut: 0.7 }),
        new PopSpikes(480, 480, 64, null, { period: 1.5, phase: 0.6, holdOut: 0.7 }),
        new Laser({ x: 600, y: 30, len: 418, vertical: true, period: 1.8, warn: 0.45, fire: 0.4, phase: 0.0 }),
        new Laser({ x: 720, y: 30, len: 418, vertical: true, period: 1.8, warn: 0.45, fire: 0.4, phase: 0.9 }),
        new Note(150, 430, "feel the beat"),
        new PopSpikes(844, 480, 58, R(770, 330, 14, 150), { delay: 0.04 }),
      ],
    }),
  },
  // ---------------------------------------------------- 27 (NEW: mixed sampler)
  {
    name: "KITCHEN SINK",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 360), floorSeg(540, 960), roof(30), wallL(), wallR()],
      traps: [
        new Conveyor(R(120, 480, 200, 60), { dir: 1, force: 120 }),
        new StaticSpikes(360, 540, 180, { dir: "up", size: 44 }),
        new MovingPlatform(R(360, 452, 100, 16), { toX: 450, speed: 80, pause: 0.4 }),
        new Saw([{ x: 660, y: 150 }, { x: 660, y: 360 }], { r: 20, speed: 170 }),
        new Crusher(770, 90, { topY: 30, period: 1.8, phase: 0.3 }),
        new Note(150, 430, "a bit of everything"),
        new PopSpikes(844, 480, 58, R(800, 330, 14, 150), { delay: 0.04 }),
      ],
    }),
  },
  // ---------------------------------------------------- 28 (NEW: trust nobody)
  {
    name: "TRUST NOBODY",
    build: () => ({
      spawn: { x: 55, y: 440 },
      door: new Door([{ x: 884, y: 416 }]),
      solids: [floorSeg(0, 620), floorSeg(770, 960), wallL(), wallR()],
      traps: [
        new FakeDoor(300, 416, { label: "100% real" }),
        new FakeDoor(520, 416, { label: "trust me" }),
        new CollapseFloor(R(620, 480, 150, 60), R(560, 300, 30, 180)),
        new Button(700, 470, "x", { momentary: false }),
        new FallBlock(R(820, 40, 70, 42), R(790, 200, 40, 280), { shakeTime: 0.05 }),
        new Note(150, 430, "trust nobody"),
      ],
    }),
  },
  // ---------------------------------------------------- 29 (the gauntlet)
  {
    name: "THE OLD GAUNTLET",
    build: () => ({
      spawn: { x: 45, y: 440 },
      door: new Door(
        [
          { x: 884, y: 416 },
          { x: 70, y: 200 },
        ],
        { fleeDist: 70 }
      ),
      solids: [
        floorSeg(0, 230), floorSeg(360, 960, 480),
        R(40, 264, 130, 16), R(205, 336, 90, 14), R(330, 410, 80, 14),
        wallL(), wallR(),
      ],
      traps: [
        new CollapseFloor(R(230, 480, 130, 60), R(170, 280, 24, 200)),
        new FallBlock(R(420, 40, 64, 42), R(400, 200, 104, 280)),
        new SlidingHole(500, 790, { gapW: 88, startGap: 740, speed: 135, trigger: R(470, 300, 20, 180) }),
        new PopSpikes(800, 480, 70, R(750, 330, 20, 150), { delay: 0.05 }),
        new PopSpikes(218, 336, 64, R(205, 240, 90, 96), { delay: 0.5 }),
        new Note(600, 430, "almost there :)"),
        new Note(105, 240, "ok fine. you earned it.", { size: 13 }),
      ],
    }),
  },
  // ---------------------------------------------------- 30 (NEW: finale)
  {
    name: "THE FINAL FABLE",
    build: () => ({
      spawn: { x: 50, y: 440 },
      door: new Door(
        [
          { x: 884, y: 416 },
          { x: 110, y: 236 },
        ],
        { fleeDist: 78 }
      ),
      solids: [floorSeg(0, 250), floorSeg(700, 960), R(40, 300, 210, 16), roof(30), wallL(), wallR()],
      traps: [
        new Spring(150, 480, { power: -1000 }),
        new MovingPlatform(R(280, 452, 100, 16), { toX: 560, speed: 100, pause: 0.35 }),
        new Saw([{ x: 470, y: 150 }, { x: 470, y: 430 }], { r: 22, speed: 190 }),
        new Laser({ x: 610, y: 30, len: 418, vertical: true, period: 1.9, warn: 0.45, fire: 0.4 }),
        new PopSpikes(806, 480, 66, R(720, 330, 16, 150), { delay: 0.05 }),
        new StaticSpikes(250, 540, 450, { dir: "up", size: 44 }),
        new Note(150, 250, "the devil's last laugh"),
      ],
    }),
  },
];

const DEATH_LINES = [
  "OUCH.", "LOL.", "SKILL ISSUE.", "SO CLOSE.", "AGAIN?", "PERFECTLY PLANNED.",
  "YOU FELL FOR IT.", "THE DEVIL LAUGHS.", "CLASSIC.", "WHO PUT THAT THERE?",
  "OOPS.", "TRY WALKING SLOWER.", "THAT ONE'S ON YOU.", "HE-HE.", "NICE ONE.",
];
const ROASTS = [
  [0, "wait... flawless?!"],
  [25, "pretty respectable, honestly."],
  [75, "the devil enjoyed every single one."],
  [150, "have you considered walking?"],
  [9999, "the floor knows you personally now."],
];

// ================================================================ GAME
const Game = {
  state: "menu",
  levelIndex: 0,
  level: null,
  player: null,
  deaths: 0,
  invertControls: false,
  flags: {},
  deathT: 0,
  deathLine: "",
  winT: 0,
  shakeAmt: 0,
  shakeT: 0,
  wipe: 0,
  wipeDir: 0,
  wipeNext: null,
  time: 0,

  shake(amt, t) { this.shakeAmt = Math.max(this.shakeAmt, amt); this.shakeT = Math.max(this.shakeT, t); },

  loadLevel(i) {
    this.levelIndex = i;
    const def = LEVELS[i];
    this.flags = {};
    this.level = def.build();
    this.level.name = def.name;
    this.spawnPlayer();
    stains = [];
    particles.length = 0;
    document.getElementById("hud-levelname").textContent = def.name;
    document.getElementById("hud-levelnum").textContent = i + 1;
  },

  spawnPlayer() {
    const s = this.level.spawn;
    this.player = {
      x: s.x, y: s.y, w: 26, h: 32,
      vx: 0, vy: 0,
      grounded: false, coyote: 0, face: 1,
      squash: 0, jumping: false,
    };
  },

  restartLevel(manual = false) {
    if (manual) { this.deaths++; saveProgress(); updateDeathHud(); }
    this.loadLevel(this.levelIndex);
    this.state = "play";
  },

  die(x, y) {
    if (this.state !== "play") return;
    this.deaths++;
    saveProgress();
    updateDeathHud();
    AudioFX.death();
    spawnBlood(x, y);
    addStain(x, Math.min(y + 20, 478));
    this.shake(9, 0.3);
    this.state = "dead";
    this.deathT = 0;
    this.deathLine = DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)];
  },

  winLevel() {
    this.state = "win";
    this.winT = 0;
    AudioFX.win();
    const done = getDone();
    done[this.levelIndex] = true;
    localStorage.setItem("fd_done", JSON.stringify(done));
  },

  startWipe(cb) { this.wipeDir = 1; this.wipeNext = cb; },

  update(dt) {
    this.time += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakeAmt = 0;
    updateParticles(dt);

    if (this.wipeDir !== 0) {
      this.wipe += this.wipeDir * dt * 3;
      if (this.wipeDir > 0 && this.wipe >= 1) {
        this.wipe = 1;
        if (this.wipeNext) this.wipeNext();
        this.wipeNext = null;
        this.wipeDir = -1;
      } else if (this.wipeDir < 0 && this.wipe <= 0) {
        this.wipe = 0; this.wipeDir = 0;
      }
    }

    if (this.state === "play") this.updatePlay(dt);
    else if (this.state === "dead") {
      this.deathT += dt;
      for (const t of this.level.traps) t.update(dt, this);
      if (this.deathT > 0.85) {
        this.startWipe(() => { this.loadLevel(this.levelIndex); this.state = "play"; });
        this.state = "respawning";
      }
    } else if (this.state === "win") {
      this.winT += dt;
      if (this.winT > 0.8) {
        this.state = "betweenLevels";
        if (this.levelIndex + 1 >= LEVELS.length) {
          this.startWipe(() => showEnd());
        } else {
          this.startWipe(() => { this.loadLevel(this.levelIndex + 1); this.state = "play"; });
        }
      }
    }
  },

  collectSolids() {
    const out = [...this.level.solids];
    for (const t of this.level.traps) out.push(...t.solids());
    return out;
  },

  updatePlay(dt) {
    const p = this.player;
    this.invertControls = false;

    for (const t of this.level.traps) t.update(dt, this);
    this.level.door.update(dt, this);

    let dir = 0;
    if (heldLeft()) dir -= 1;
    if (heldRight()) dir += 1;
    if (this.invertControls) dir = -dir;
    if (dir !== 0) p.face = dir;

    const SPEED = 265;
    const accel = p.grounded ? 2600 : 1800;
    const target = dir * SPEED;
    if (target > p.vx) p.vx = Math.min(target, p.vx + accel * dt);
    else if (target < p.vx) p.vx = Math.max(target, p.vx - accel * dt);

    jumpBuffered = Math.max(0, jumpBuffered - dt);
    p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
    if (jumpBuffered > 0 && p.coyote > 0) {
      p.vy = -645;
      p.grounded = false;
      p.coyote = 0;
      p.jumping = true;
      jumpBuffered = 0;
      AudioFX.jump();
      spawnDust(p.x + p.w / 2, p.y + p.h, 4);
    }
    if (p.vy >= 0) p.jumping = false;
    if (!heldJump() && p.jumping && p.vy < -220) { p.vy = -220; p.jumping = false; }

    p.vy = Math.min(p.vy + 2150 * dt, 980);

    const solids = this.collectSolids();
    const wasGrounded = p.grounded;

    p.x += p.vx * dt;
    for (const s of solids) {
      if (aabb(p, s)) {
        if (p.vx > 0) p.x = s.x - p.w;
        else if (p.vx < 0) p.x = s.x + s.w;
        else p.x = p.x + p.w / 2 < s.x + s.w / 2 ? s.x - p.w : s.x + s.w;
        p.vx = 0;
      }
    }

    p.y += p.vy * dt;
    p.grounded = false;
    for (const s of solids) {
      if (aabb(p, s)) {
        if (p.vy > 0) {
          p.y = s.y - p.h;
          p.grounded = true;
          if (!wasGrounded && p.vy > 350) { AudioFX.land(); spawnDust(p.x + p.w / 2, p.y + p.h, 5); p.squash = 0.12; }
          p.vy = 0;
        } else if (p.vy < 0) {
          p.y = s.y + s.h;
          p.vy = 0;
        }
      }
    }
    p.squash = Math.max(0, p.squash - dt);

    for (const s of solids) {
      if (aabb(R(p.x + 4, p.y + 4, p.w - 8, p.h - 8), s)) {
        this.die(p.x + p.w / 2, p.y + p.h / 2);
        return;
      }
    }

    for (const t of this.level.traps) {
      for (const k of t.kills()) {
        if (aabb(p, k)) { this.die(p.x + p.w / 2, p.y + p.h / 2); return; }
      }
    }

    if (p.y > H + 40) {
      this.deaths++;
      saveProgress();
      updateDeathHud();
      AudioFX.death();
      this.state = "dead";
      this.deathT = 0;
      this.deathLine = DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)];
      this.shake(6, 0.25);
      return;
    }

    if (this.level.door.playerWins(p)) this.winLevel();
  },

  // ============================================================== draw
  draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme.paper;
    ctx.fillRect(0, 0, W, H);

    if (this.shakeAmt > 0) {
      ctx.translate(rand(-this.shakeAmt, this.shakeAmt), rand(-this.shakeAmt, this.shakeAmt));
    }

    if (this.level) {
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = theme.blood;
      for (const s of stains) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      this.level.door.draw();

      ctx.fillStyle = theme.ink;
      for (const s of this.level.solids) {
        if (s.x < -20 || s.x > W) continue;
        ctx.fillRect(s.x, s.y, s.w, s.h);
      }

      for (const t of this.level.traps) t.draw();

      if (this.state === "play" || this.state === "win" || this.state === "betweenLevels") this.drawPlayer();

      drawParticles();

      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, theme.vignette);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      if (this.state === "dead" || this.state === "respawning") {
        const a = clamp(this.deathT * 4, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = theme.danger;
        ctx.font = `900 58px ${FONT}`;
        ctx.textAlign = "center";
        const wob = Math.sin(this.time * 30) * 2 * (1 - this.deathT);
        ctx.fillText(this.deathLine, W / 2 + wob, H / 2 - 30);
        ctx.globalAlpha = 1;
      }

      if (this.state === "win" || this.state === "betweenLevels") {
        const a = clamp(this.winT * 5, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = theme.accent;
        ctx.font = `900 52px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(this.levelIndex + 1 >= LEVELS.length ? "WHAT?!" : "FINE. NEXT.", W / 2, H / 2 - 40);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    if (this.wipe > 0.001) {
      const maxR = Math.hypot(W, H) / 2 + 40;
      const r = (1 - this.wipe) * maxR;
      ctx.fillStyle = theme.wipe;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(W / 2, H / 2, Math.max(r, 0), 0, Math.PI * 2, true);
      ctx.fill();
    }
  },

  drawPlayer() {
    const p = this.player;
    const squashY = p.squash > 0 ? 1 - p.squash * 2.2 : 1;
    const stretchY = !p.grounded ? clamp(1 + Math.abs(p.vy) / 2600, 1, 1.18) : squashY;
    const sx = 1 / stretchY;
    const cx = p.x + p.w / 2, by = p.y + p.h;

    // ground shadow
    if (p.grounded) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = theme.shadow;
      ctx.beginPath();
      ctx.ellipse(cx, by + 2, p.w * 0.6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(sx, stretchY);

    ctx.fillStyle = theme.ink;
    roundRect(-p.w / 2, -p.h, p.w, p.h, 7);
    ctx.fill();

    const lookX = p.face * 3;
    const lookY = clamp(p.vy / 700, -2.5, 2.5);
    ctx.fillStyle = theme.paper;
    ctx.beginPath();
    ctx.ellipse(-5 + lookX, -p.h + 11, 4.6, 5.6, 0, 0, Math.PI * 2);
    ctx.ellipse(6 + lookX, -p.h + 11, 4.6, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    ctx.arc(-5 + lookX + p.face * 1.4, -p.h + 11 + lookY, 2, 0, Math.PI * 2);
    ctx.arc(6 + lookX + p.face * 1.4, -p.h + 11 + lookY, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (p.grounded && Math.abs(p.vx) > 180 && Math.random() < 0.25) {
      spawnDust(p.x + p.w / 2 - p.face * 10, p.y + p.h, 1);
    }
  },
};

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- progress / DOM
function getDone() {
  try { return JSON.parse(localStorage.getItem("fd_done")) || {}; } catch { return {}; }
}
function saveProgress() { localStorage.setItem("fd_deaths", Game.deaths); }
function loadProgress() {
  let d = localStorage.getItem("fd_deaths");
  if (d === null) d = localStorage.getItem("ld_deaths"); // migrate from Level Devil
  Game.deaths = parseInt(d) || 0;
  if (!localStorage.getItem("fd_done")) {
    const old = localStorage.getItem("ld_done");
    if (old) localStorage.setItem("fd_done", old);
  }
}
function updateDeathHud() {
  document.getElementById("hud-deaths").textContent = Game.deaths;
  document.getElementById("menu-deaths").textContent = Game.deaths;
}

const menuEl = document.getElementById("menu");
const hudEl = document.getElementById("hud");
const endEl = document.getElementById("end-screen");
const touchEl = document.getElementById("touch-controls");

// ---------------------------------------------------------------- topbar controls (theme / mute / fullscreen)
const SUN_PATH = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="4.4" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.9 1.9M17.1 17.1L19 19M19 5l-1.9 1.9M6.9 17.1L5 19"/></g></svg>';
const MOON_PATH = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.4 6.4 0 0 0 10.5 10.5z" fill="currentColor"/></svg>';
const VOL_ON = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7.5 7.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const VOL_OFF = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const FS_ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const FS_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>';

function setMuteIcon(muted) {
  const el = document.getElementById("ic-mute");
  if (el) el.innerHTML = muted ? VOL_OFF : VOL_ON;
}
function setFsIcon() {
  const el = document.getElementById("ic-fs");
  if (el) el.innerHTML = document.fullscreenElement ? FS_ON : FS_OFF;
}
function toggleFullscreen() {
  const d = document;
  const el = d.documentElement;
  try {
    if (!d.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el);
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen)?.call(d);
    }
  } catch {}
}
document.addEventListener("fullscreenchange", () => { setFsIcon(); fit(); });

function wireTopbar() {
  const bt = document.getElementById("btn-theme");
  const bm = document.getElementById("btn-mute");
  const bf = document.getElementById("btn-fs");
  if (bt) bt.addEventListener("click", () => { toggleTheme(); });
  if (bm) bm.addEventListener("click", () => { AudioFX.init(); setMuteIcon(AudioFX.toggleMute()); });
  if (bf) bf.addEventListener("click", () => { toggleFullscreen(); });
  setMuteIcon(AudioFX.isMuted());
  setFsIcon();
}

// ---------------------------------------------------------------- touch controls
function bindHold(id, on, off) {
  const el = document.getElementById(id);
  const press = (e) => { e.preventDefault(); el.classList.add("held"); AudioFX.init(); on(); };
  const release = (e) => { e.preventDefault(); el.classList.remove("held"); off(); };
  el.addEventListener("pointerdown", press);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("pointerleave", release);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
bindHold("tc-left", () => (touch.left = true), () => (touch.left = false));
bindHold("tc-right", () => (touch.right = true), () => (touch.right = false));
bindHold("tc-jump",
  () => { touch.jump = true; jumpBuffered = 0.12; },
  () => (touch.jump = false)
);
document.getElementById("tc-restart").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (Game.state === "play") Game.restartLevel(true);
});

function setTouchControlsVisible(v) {
  touchEl.classList.toggle("hidden", !(v && IS_TOUCH));
}

function buildLevelGrid() {
  const grid = document.getElementById("level-grid");
  grid.innerHTML = "";
  const done = getDone();
  let unlockedUpTo = 0;
  for (let i = 0; i < LEVELS.length; i++) { if (done[i]) unlockedUpTo = i + 1; }
  for (let i = 0; i < LEVELS.length; i++) {
    const b = document.createElement("button");
    b.textContent = i + 1;
    b.disabled = i > unlockedUpTo;
    if (done[i]) b.classList.add("done");
    b.addEventListener("click", () => startGame(i));
    grid.appendChild(b);
  }
}

function startGame(i) {
  AudioFX.init();
  if (IS_TOUCH && !document.fullscreenElement) toggleFullscreen();
  menuEl.classList.add("hidden");
  endEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  setTouchControlsVisible(true);
  Game.loadLevel(i);
  Game.state = "play";
  Game.wipe = 1;
  Game.wipeDir = -1;
}

function showMenu() {
  buildLevelGrid();
  updateDeathHud();
  menuEl.classList.remove("hidden");
  endEl.classList.add("hidden");
  hudEl.classList.add("hidden");
  setTouchControlsVisible(false);
  Game.state = "menu";
}

function showEnd() {
  hudEl.classList.add("hidden");
  setTouchControlsVisible(false);
  endEl.classList.remove("hidden");
  Game.state = "end";
  document.getElementById("end-deaths").textContent = Game.deaths;
  let roast = ROASTS[ROASTS.length - 1][1];
  for (const [n, t] of ROASTS) { if (Game.deaths <= n) { roast = t; break; } }
  document.getElementById("end-roast").textContent = roast;
}

document.getElementById("play-btn").addEventListener("click", () => startGame(0));
document.getElementById("end-menu-btn").addEventListener("click", showMenu);

// ---------------------------------------------------------------- layout / overlays sizing
function fit() {
  const vw = window.innerWidth;
  const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const pad = IS_TOUCH ? 0 : 36;
  const scale = Math.min((vw - pad) / W, (vh - pad) / H);
  const cw = Math.round(W * scale), ch = Math.round(H * scale);
  cv.style.width = cw + "px";
  cv.style.height = ch + "px";
  for (const el of [menuEl, hudEl, endEl]) {
    el.style.width = cw + "px";
    el.style.height = el === hudEl ? "auto" : ch + "px";
    el.style.left = `calc(50% - ${cw / 2}px)`;
    el.style.top = `calc(50% - ${ch / 2}px)`;
  }
  // portrait rotate hint
  const rot = document.getElementById("rotate-hint");
  if (rot) rot.classList.toggle("show", IS_TOUCH && vw < vh);
}
addEventListener("resize", fit);
if (window.visualViewport) window.visualViewport.addEventListener("resize", fit);

// ---------------------------------------------------------------- boot
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("fd_theme"); } catch {}
  if (!saved) saved = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  applyTheme(saved, false);
})();
wireTopbar();
loadProgress();
updateDeathHud();
buildLevelGrid();
fit();

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 1 / 30);
  Game.update(dt);
  Game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
