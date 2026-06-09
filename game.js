/* ============================================================
   LEVEL DEVIL — not a troll game ;)
   Canvas rage-platformer. Every trap is perfectly planned.
   ============================================================ */
"use strict";

const W = 960, H = 540;
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const R = (x, y, w, h) => ({ x, y, w, h });

const INK = "#161616";
const PAPER = "#f2efea";
const RED = "#e03131";
const PURPLE = "#8a3ffc";

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
    win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, "square", 0.09), i * 90)); },
    laugh: () => { [300, 260, 300, 260, 220].forEach((f, i) => setTimeout(() => tone(f, 0.09, "sawtooth", 0.06), i * 110)); },
    toggleMute: () => { muted = !muted; return muted; },
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
  if (e.code === "KeyM") AudioFX.toggleMute();
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
      color: Math.random() < 0.8 ? RED : "#9c1f1f", grav: true,
    });
  }
}
function spawnDust(x, y, n = 6, color = "#b9b2a6") {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: x + rand(-10, 10), y, vx: rand(-60, 60), vy: rand(-90, -20),
      r: rand(2, 4.5), life: rand(0.25, 0.5), t: 0, color, grav: false,
    });
  }
}
function spawnPoof(x, y) {
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 160);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: rand(3, 7), life: rand(0.3, 0.55), t: 0, color: PURPLE, grav: false,
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
// Every trap implements: update(dt), solids() -> [rects], kills() -> [rects], draw()

class CollapseFloor {
  // looks like normal floor; trigger -> shake -> drop
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
    ctx.fillStyle = INK;
    if (this.state === "fall") {
      // break into chunks while falling
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
  // spikes that burst out of a surface. dir: 'up' | 'down'
  constructor(x, y, w, trigger, opts = {}) {
    this.x = x; this.y = y; this.w = w;
    this.dir = opts.dir ?? "up";
    this.size = opts.size ?? 26;
    this.delay = opts.delay ?? 0;
    this.trigger = trigger; // null => periodic
    this.period = opts.period ?? 0;
    this.phase = opts.phase ?? 0;
    this.holdOut = opts.holdOut ?? 0.8;
    this.speed = opts.speed ?? 14; // pop speed factor
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
    ctx.fillStyle = INK;
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
  // block hanging from ceiling; falls when triggered. Kills while falling, then becomes terrain.
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
    ctx.fillStyle = INK;
    ctx.fillRect(r.x + ox, r.y, r.w, r.h);
    // crack lines
    ctx.strokeStyle = "rgba(242,239,234,.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.3 + ox, r.y);
    ctx.lineTo(r.x + r.w * 0.45 + ox, r.y + r.h * 0.5);
    ctx.lineTo(r.x + r.w * 0.32 + ox, r.y + r.h);
    ctx.stroke();
  }
}

class Crusher {
  // piston slamming from the ceiling. periodic or triggered.
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
    this.y = this.topY; // top of head
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
    // shaft
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(this.x + this.w / 2 - 9, this.topY, 18, this.y - this.topY + 4);
    // head
    const h = this.headRect();
    ctx.fillStyle = INK;
    ctx.fillRect(h.x, h.y, h.w, h.h);
    // warning stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(h.x, h.y + h.h - 12, h.w, 12);
    ctx.clip();
    ctx.fillStyle = "#e0a131";
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
    ctx.fillStyle = INK;
    ctx.fillRect(this.rect.x + ox, this.rect.y, this.rect.w, this.rect.h);
    ctx.fillStyle = "rgba(242,239,234,.3)";
    for (let i = 1; i < 3; i++)
      ctx.fillRect(this.rect.x + (this.rect.w / 3) * i - 1 + ox, this.rect.y + 2, 2, this.rect.h - 4);
  }
}

class SlidingHole {
  // a floor strip with a moving gap. The gap homes toward the player when triggered.
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
    ctx.fillStyle = INK;
    for (const s of this.solids()) ctx.fillRect(s.x, s.y, s.w, s.h);
    // jagged gap edges
    const gl = this.gx - this.gapW / 2, gr = this.gx + this.gapW / 2;
    ctx.fillStyle = INK;
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

class FakeDoor {
  // looks exactly like the real door. touch it -> spikes. lol.
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
      ctx.fillStyle = "rgba(22,22,22,.45)";
      ctx.font = "italic 15px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(this.label, this.x + this.w / 2, this.y - 12);
    }
    if (this.out > 0.01) {
      // spikes burst out of the doorway
      const n = 4, sw = this.w / 2;
      ctx.fillStyle = INK;
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

class InvertZone {
  constructor(rect) { this.rect = rect; }
  reset() {}
  update(dt, g) { if (aabb(g.player, this.rect)) g.invertControls = true; }
  solids() { return []; }
  kills() { return []; }
  draw() {
    ctx.fillStyle = "rgba(138,63,252,.07)";
    ctx.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    ctx.fillStyle = "rgba(138,63,252,.4)";
    ctx.font = "900 30px Segoe UI";
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(this.rect.x + this.rect.w / 2, this.rect.y + 60);
    ctx.rotate(Math.PI);
    ctx.fillText("?", 0, 0);
    ctx.restore();
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
    ctx.fillStyle = INK;
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

// ---------------------------------------------------------------- door
function drawDoorShape(x, y, w, h, color = "#241a33") {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + 14);
  ctx.quadraticCurveTo(x, y, x + w / 2, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 14);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  // knob
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(x + w - 9, y + h / 2 + 4, 3.4, 0, Math.PI * 2);
  ctx.fill();
}

class Door {
  // positions: array. door flees to the next position when the player gets close,
  // until the last one (the real spot).
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
    if (this.i !== this.positions.length - 1 && this.positions.length > 1) {
      // can still win on intermediate spot if you're FAST? no. devil says no.
    }
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
    ctx.fillStyle = "rgba(22,22,22,.38)";
    ctx.font = `italic ${this.size}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }
}

// ================================================================ LEVELS
// Helpers
const floorSeg = (x0, x1, y = 480) => R(x0, y, x1 - x0, H - y);
const wallL = () => R(-40, -200, 40, H + 400);
const wallR = () => R(W, -200, 40, H + 400);

const LEVELS = [
  // ---------------------------------------------------- 1
  {
    name: "NOTHING TO SEE HERE",
    build: () => ({
      spawn: { x: 60, y: 440 },
      door: new Door([{ x: 876, y: 416 }]),
      solids: [floorSeg(0, 380), floorSeg(520, 960), wallL(), wallR()],
      traps: [
        new CollapseFloor(R(380, 480, 140, 60), R(310, 280, 30, 200)),
        new PopSpikes(750, 480, 80, R(700, 330, 26, 150), { delay: 0.04 }),
        new Note(220, 430, "just walk to the door :)"),
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
      solids: [floorSeg(0, 960), R(0, 0, 960, 40), wallL(), wallR()],
      traps: [
        new FallBlock(R(200, 40, 64, 42), R(180, 200, 104, 280)),
        new FallBlock(R(360, 40, 64, 42), R(340, 200, 104, 280)),
        new FallBlock(R(520, 40, 64, 42), R(500, 200, 104, 280)),
        new FallBlock(R(680, 40, 64, 42), R(660, 200, 104, 280)),
        // the rude one: drops right in front of the door, triggered early
        new FallBlock(R(820, 40, 76, 42), R(770, 200, 40, 280), { shakeTime: 0.04 }),
        new Note(120, 100, "look up.", { size: 14 }),
      ],
    }),
  },
  // ---------------------------------------------------- 5
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
  // ---------------------------------------------------- 6
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
  // ---------------------------------------------------- 7
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
  // ---------------------------------------------------- 8
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
  // ---------------------------------------------------- 9
  {
    name: "FLAT EARTH SOCIETY",
    build: () => ({
      spawn: { x: 50, y: 440 },
      door: new Door([{ x: 880, y: 416 }]),
      solids: [floorSeg(0, 960), R(0, 0, 960, 36), wallL(), wallR()],
      traps: [
        new Crusher(230, 92, { topY: 36, period: 1.9, phase: 0.0 }),
        new Crusher(450, 92, { topY: 36, period: 1.9, phase: 0.95 }),
        new Crusher(640, 92, { topY: 36, period: 1.9, phase: 0.45 }),
        new Crusher(806, 100, { topY: 36, trigger: R(770, 320, 12, 160), slamSpeed: 2100 }),
        new Note(340, 110, "nice and flat here"),
      ],
    }),
  },
  // ---------------------------------------------------- 10
  {
    name: "THE GAUNTLET",
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
];

const DEATH_LINES = [
  "OUCH.", "LOL.", "SKILL ISSUE.", "SO CLOSE.", "AGAIN?", "PERFECTLY PLANNED.",
  "YOU FELL FOR IT.", "THE DEVIL LAUGHS.", "CLASSIC.", "WHO PUT THAT THERE?",
  "OOPS.", "TRY WALKING SLOWER.", "THAT ONE'S ON YOU.", "HE-HE.", "NICE ONE.",
];
const ROASTS = [
  [0, "wait... actually impressive."],
  [15, "pretty respectable, honestly."],
  [40, "the devil enjoyed every single one."],
  [80, "have you considered walking?"],
  [9999, "the floor knows you personally now."],
];

// ================================================================ GAME
const Game = {
  state: "menu", // menu | play | dead | win | end
  levelIndex: 0,
  level: null,
  player: null,
  deaths: 0,
  invertControls: false,
  deathT: 0,
  deathLine: "",
  winT: 0,
  shakeAmt: 0,
  shakeT: 0,
  wipe: 0,       // 0..1 circle wipe (1 = fully black)
  wipeDir: 0,    // -1 opening, +1 closing
  wipeNext: null,
  time: 0,

  shake(amt, t) { this.shakeAmt = Math.max(this.shakeAmt, amt); this.shakeT = Math.max(this.shakeT, t); },

  loadLevel(i) {
    this.levelIndex = i;
    const def = LEVELS[i];
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
      squash: 0, // landing squash timer
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
    localStorage.setItem("ld_done", JSON.stringify(done));
  },

  startWipe(cb) { this.wipeDir = 1; this.wipeNext = cb; },

  update(dt) {
    this.time += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakeAmt = 0;
    updateParticles(dt);

    // wipe transition
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
      // keep traps animating for comedic effect
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

    // traps first (they may add/remove solids, kill zones, move the door)
    for (const t of this.level.traps) t.update(dt, this);
    this.level.door.update(dt, this);

    // ---- input
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

    // jump
    jumpBuffered = Math.max(0, jumpBuffered - dt);
    p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
    if (jumpBuffered > 0 && p.coyote > 0) {
      p.vy = -645;
      p.grounded = false;
      p.coyote = 0;
      jumpBuffered = 0;
      AudioFX.jump();
      spawnDust(p.x + p.w / 2, p.y + p.h, 4);
    }
    // variable jump height
    if (!heldJump() && p.vy < -220) p.vy = -220;

    p.vy = Math.min(p.vy + 2150 * dt, 980);

    const solids = this.collectSolids();
    const wasGrounded = p.grounded;

    // ---- move X
    p.x += p.vx * dt;
    for (const s of solids) {
      if (aabb(p, s)) {
        if (p.vx > 0) p.x = s.x - p.w;
        else if (p.vx < 0) p.x = s.x + s.w;
        else p.x = p.x + p.w / 2 < s.x + s.w / 2 ? s.x - p.w : s.x + s.w;
        p.vx = 0;
      }
    }

    // ---- move Y
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

    // crushed check: overlapping a solid even after resolution = squeezed
    for (const s of solids) {
      if (aabb(R(p.x + 4, p.y + 4, p.w - 8, p.h - 8), s)) {
        this.die(p.x + p.w / 2, p.y + p.h / 2);
        return;
      }
    }

    // ---- kill zones
    for (const t of this.level.traps) {
      for (const k of t.kills()) {
        if (aabb(p, k)) { this.die(p.x + p.w / 2, p.y + p.h / 2); return; }
      }
    }

    // fell into a pit
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

    // ---- door
    if (this.level.door.playerWins(p)) this.winLevel();
  },

  // ============================================================== draw
  draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    if (this.shakeAmt > 0) {
      ctx.translate(rand(-this.shakeAmt, this.shakeAmt), rand(-this.shakeAmt, this.shakeAmt));
    }

    if (this.level) {
      // faint grid texture
      ctx.strokeStyle = "rgba(22,22,22,.035)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();

      // blood stains
      ctx.fillStyle = "rgba(224,49,49,.55)";
      for (const s of stains) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // door behind player
      this.level.door.draw();

      // static solids
      ctx.fillStyle = INK;
      for (const s of this.level.solids) {
        if (s.x < -20 || s.x > W) continue; // walls invisible
        ctx.fillRect(s.x, s.y, s.w, s.h);
      }

      // traps
      for (const t of this.level.traps) t.draw();

      // player
      if (this.state === "play" || this.state === "win" || this.state === "betweenLevels") this.drawPlayer();

      drawParticles();

      // death text
      if (this.state === "dead" || this.state === "respawning") {
        const a = clamp(this.deathT * 4, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = RED;
        ctx.font = "900 58px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        const wob = Math.sin(this.time * 30) * 2 * (1 - this.deathT);
        ctx.fillText(this.deathLine, W / 2 + wob, H / 2 - 30);
        ctx.globalAlpha = 1;
      }

      // win text
      if (this.state === "win" || this.state === "betweenLevels") {
        const a = clamp(this.winT * 5, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = PURPLE;
        ctx.font = "900 52px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(this.levelIndex + 1 >= LEVELS.length ? "WHAT?!" : "FINE. NEXT.", W / 2, H / 2 - 40);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    // circle wipe (drawn unshaken)
    if (this.wipe > 0.001) {
      const maxR = Math.hypot(W, H) / 2 + 40;
      const r = (1 - this.wipe) * maxR;
      ctx.fillStyle = "#150d24";
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

    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(sx, stretchY);

    // body
    ctx.fillStyle = INK;
    roundRect(-p.w / 2, -p.h, p.w, p.h, 7);
    ctx.fill();

    // eyes
    const lookX = p.face * 3;
    const lookY = clamp(p.vy / 700, -2.5, 2.5);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-5 + lookX, -p.h + 11, 4.6, 5.6, 0, 0, Math.PI * 2);
    ctx.ellipse(6 + lookX, -p.h + 11, 4.6, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-5 + lookX + p.face * 1.4, -p.h + 11 + lookY, 2, 0, Math.PI * 2);
    ctx.arc(6 + lookX + p.face * 1.4, -p.h + 11 + lookY, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // run dust
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
  try { return JSON.parse(localStorage.getItem("ld_done")) || {}; } catch { return {}; }
}
function saveProgress() { localStorage.setItem("ld_deaths", Game.deaths); }
function loadProgress() { Game.deaths = parseInt(localStorage.getItem("ld_deaths")) || 0; }
function updateDeathHud() {
  document.getElementById("hud-deaths").textContent = Game.deaths;
  document.getElementById("menu-deaths").textContent = Game.deaths;
}

const menuEl = document.getElementById("menu");
const hudEl = document.getElementById("hud");
const endEl = document.getElementById("end-screen");
const touchEl = document.getElementById("touch-controls");

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
  // reserve space at the bottom for touch controls on mobile
  const reserve = IS_TOUCH ? Math.min(130, innerHeight * 0.22) : 0;
  const pad = IS_TOUCH ? 12 : 40;
  const scale = Math.min(innerWidth / (W + pad), (innerHeight - reserve) / (H + pad));
  const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
  cv.style.width = cw + "px";
  cv.style.height = ch + "px";
  cv.style.marginBottom = reserve + "px";
  for (const el of [menuEl, hudEl, endEl]) {
    el.style.width = cw + "px";
    el.style.height = el === hudEl ? "auto" : ch + "px";
    el.style.left = `calc(50% - ${cw / 2}px)`;
    el.style.top = `calc(50% - ${ch / 2 + reserve / 2}px)`;
  }
}
addEventListener("resize", fit);
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
loadProgress();
updateDeathHud();
buildLevelGrid();
requestAnimationFrame(frame);
