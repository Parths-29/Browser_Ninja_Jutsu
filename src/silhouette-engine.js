/**
 * silhouette-engine.js
 *
 * Unified rendering engine for all body-silhouette-driven effects.
 * Uses the SelfieSegmentation mask (shared with Shadow Clone) to drive:
 *
 *   1. SHADOW CLONE   — offset copies of your silhouette
 *   2. CHAKRA CLOAK   — fiery boiling aura hugging your body outline
 *   3. KAWARIMI       — body swaps with a log, then reappears
 *   4. CLONE SWARM    — afterimage trail from rolling buffer of past frames
 *
 * SelfieSegmentation is lazily spun up when ANY silhouette effect triggers
 * and torn down when ALL silhouette effects have ended.
 */

// ── Constants ────────────────────────────────────────────────────────────

const SMOKE_FOLDERS     = ['smoke_1', 'smoke_2', 'smoke_3'];
const SMOKE_FRAME_COUNT = 5;
const SMOKE_DURATION    = 600;

const CLONE_DEFS = [
  { x: -100, y: 100, scale: 0.90, delay: 1000 },
  { x:  120, y: 100, scale: 0.85, delay: 1150 },
  { x: -180, y: 140, scale: 0.80, delay: 1300 },
  { x:  180, y: 160, scale: 0.70, delay: 1450 },
  { x: -250, y: 140, scale: 0.70, delay: 1600 },
  { x:  260, y: 160, scale: 0.65, delay: 1750 },
  { x: -100, y: 150, scale: 0.60, delay: 2500 },
  { x:  100, y: 150, scale: 0.60, delay: 2650 },
];

// Clone Swarm: how many past frames to keep
const SWARM_BUFFER_SIZE = 18;
const SWARM_FRAME_SKIP  = 2;  // only capture every Nth frame for perf

// Kawarimi timing
const KAWARIMI_LOG_DURATION_MS  = 1200;  // log visible for this long
const KAWARIMI_TOTAL_DURATION_MS = 2800; // total effect duration

export class SilhouetteEngine {
  /**
   * @param {HTMLCanvasElement} canvas  — the 2D overlay canvas (#clone-canvas)
   * @param {HTMLVideoElement}  video   — live webcam feed
   * @param {object}            hud     — HUD instance for jutsu flash
   */
  constructor(canvas, video, hud) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.video  = video;
    this.hud    = hud;

    // ── SelfieSegmentation (lazy) ─────────────────────────────────────
    this._selfie       = null;
    this._selfieActive = false;
    this._mask         = null;   // latest segmentation mask (ImageBitmap / canvas)

    // ── Active effect states ──────────────────────────────────────────
    this._activeEffects = new Set();  // 'shadow_clone' | 'chakra_cloak' | 'kawarimi' | 'clone_swarm'
    this._teardownTimer = null;

    // ── Shadow Clone state ────────────────────────────────────────────
    this._cloneStartTime = null;
    this._cloneDefs      = [];

    // ── Chakra Cloak state ────────────────────────────────────────────
    this._cloakStartTime = null;
    this._cloakPhase     = 0;  // animates over time for the boiling effect

    // ── Kawarimi state ────────────────────────────────────────────────
    this._kawarimiStartTime = null;
    this._logImg = null;
    this._preloadLog();

    // ── Clone Swarm state ─────────────────────────────────────────────
    this._swarmBuffer     = [];   // Array of { canvas, timestamp }
    this._swarmStartTime  = null;
    this._swarmFrameCount = 0;

    // ── Shared: smoke particles ───────────────────────────────────────
    this._smokes = [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PUBLIC API — trigger / stop effects
  // ═══════════════════════════════════════════════════════════════════════

  triggerShadowClone() {
    this._ensureSegmentation();
    this._activeEffects.add('shadow_clone');
    this._cloneStartTime = performance.now();
    this._cloneDefs = CLONE_DEFS.map(d => ({ ...d, smokeSpawned: false }));
    this.hud.showJutsuName('👥 Shadow Clone Jutsu!');
    this._scheduleAutoEnd('shadow_clone', 8000);
  }

  triggerChakraCloak() {
    this._ensureSegmentation();
    this._activeEffects.add('chakra_cloak');
    this._cloakStartTime = performance.now();
    this._cloakPhase = 0;
    this.hud.showJutsuName('🦊 Nine-Tails Chakra Mode!');
    this._scheduleAutoEnd('chakra_cloak', 10000);
  }

  triggerKawarimi() {
    this._ensureSegmentation();
    this._activeEffects.add('kawarimi');
    this._kawarimiStartTime = performance.now();
    this.hud.showJutsuName('🪵 Substitution Jutsu!');

    // Spawn smoke at center
    const cx = (this.video.videoWidth || 1280) / 2;
    const cy = (this.video.videoHeight || 720) / 2;
    this._spawnSmoke(cx - 30, cy - 40, 1.4);
    this._spawnSmoke(cx + 30, cy - 40, 1.4);
    this._spawnSmoke(cx, cy + 20, 1.2);

    this._scheduleAutoEnd('kawarimi', KAWARIMI_TOTAL_DURATION_MS);
  }

  triggerCloneSwarm() {
    this._ensureSegmentation();
    this._activeEffects.add('clone_swarm');
    this._swarmStartTime = performance.now();
    this._swarmBuffer = [];
    this._swarmFrameCount = 0;
    this.hud.showJutsuName('👥 Shadow Clone Barrage!');
    this._scheduleAutoEnd('clone_swarm', 6000);
  }

  /** Call once per rAF from the main loop. */
  tick() {
    const W = this.video.videoWidth  || 1280;
    const H = this.video.videoHeight || 720;
    this.canvas.width  = W;
    this.canvas.height = H;

    const hasAny = this._activeEffects.size > 0;
    if (!hasAny && !this._smokes.length) {
      // Nothing active — fast bail
      return;
    }

    // Send frame to segmentation if active
    if (this._selfie && this._selfieActive) {
      this._selfie.send({ image: this.video }).catch(() => {});
    }

    this.ctx.clearRect(0, 0, W, H);
    const now = performance.now();

    // Extract person silhouette (shared by all effects)
    const person = this._grabPerson(W, H);

    // ── Render each active effect ─────────────────────────────────────
    if (this._activeEffects.has('kawarimi'))    this._renderKawarimi(now, W, H, person);
    if (this._activeEffects.has('clone_swarm')) this._renderCloneSwarm(now, W, H, person);
    if (this._activeEffects.has('shadow_clone')) this._renderShadowClone(now, W, H, person);
    if (this._activeEffects.has('chakra_cloak')) this._renderChakraCloak(now, W, H, person);

    // ── Smoke particles (shared) ──────────────────────────────────────
    this._renderSmokes(now);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SELFIE SEGMENTATION — lazy lifecycle
  // ═══════════════════════════════════════════════════════════════════════

  _ensureSegmentation() {
    if (this._selfieActive) return;
    this._selfieActive = true;
    this._selfie = new SelfieSegmentation({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
    });
    this._selfie.setOptions({ modelSelection: 1 });
    this._selfie.onResults((r) => { this._mask = r.segmentationMask; });
    console.log('[SilhouetteEngine] SelfieSegmentation spun up');
  }

  _teardownSegmentation() {
    if (!this._selfieActive) return;
    // Only tear down if NO effects are still active
    if (this._activeEffects.size > 0) return;
    this._selfieActive = false;
    this._selfie = null;
    this._mask = null;
    this._swarmBuffer = [];
    console.log('[SilhouetteEngine] SelfieSegmentation torn down');
  }

  _scheduleAutoEnd(effectName, durationMs) {
    setTimeout(() => {
      this._activeEffects.delete(effectName);
      this._teardownSegmentation();
    }, durationMs);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHARED HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /** Extract person pixels using segmentation mask (alpha cutout). */
  _grabPerson(w, h) {
    if (!this._mask) return null;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const c = off.getContext('2d');
    c.drawImage(this._mask, 0, 0, w, h);
    c.globalCompositeOperation = 'source-in';
    c.drawImage(this.video, 0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    return off;
  }

  /**
   * Extract JUST the mask as a standalone alpha canvas.
   * White = person, transparent = background.
   */
  _grabMaskAlpha(w, h) {
    if (!this._mask) return null;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const c = off.getContext('2d');
    c.drawImage(this._mask, 0, 0, w, h);
    return off;
  }

  _spawnSmoke(x, y, scale) {
    const folder = SMOKE_FOLDERS[Math.floor(Math.random() * SMOKE_FOLDERS.length)];
    const frames = [];
    for (let i = 1; i <= SMOKE_FRAME_COUNT; i++) {
      const img = new Image();
      img.src = `assets/${folder}/${i}.png`;
      frames.push(img);
    }
    this._smokes.push({ x, y, scale: scale * 1.2, start: performance.now(), frames });
  }

  _preloadLog() {
    this._logImg = new Image();
    this._logImg.src = 'assets/log.png';
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EFFECT RENDERERS
  // ═══════════════════════════════════════════════════════════════════════

  // ── 1. SHADOW CLONE ─────────────────────────────────────────────────

  _renderShadowClone(now, W, H, person) {
    if (!this._cloneStartTime || !person) return;

    // Draw clones (sorted deepest first for Z-order)
    const sorted = [...this._cloneDefs].sort((a, b) => b.delay - a.delay);
    for (const cl of sorted) {
      if (now - this._cloneStartTime < cl.delay) continue;
      if (!cl.smokeSpawned) {
        cl.smokeSpawned = true;
        const cx = cl.x + W / 2;
        const cy = cl.y + H / 2 - 40;
        this._spawnSmoke(cx - 15, cy, cl.scale);
        this._spawnSmoke(cx + 15, cy, cl.scale);
      }
      this.ctx.save();
      this.ctx.globalAlpha = 0.85;
      this.ctx.translate(cl.x + W * (1 - cl.scale) / 2, cl.y);
      this.ctx.scale(cl.scale, cl.scale);
      this.ctx.drawImage(person, 0, 0);
      this.ctx.restore();
    }

    // Main person on top
    this.ctx.drawImage(person, 0, 0);
  }

  // ── 2. CHAKRA CLOAK ─────────────────────────────────────────────────

  _renderChakraCloak(now, W, H, person) {
    if (!this._cloakStartTime) return;

    const elapsed = now - this._cloakStartTime;
    this._cloakPhase = elapsed * 0.003;  // animation speed

    // We need the mask to create the aura outline
    const maskCanvas = this._grabMaskAlpha(W, H);
    if (!maskCanvas) return;

    // ── Pass 1: Draw the person normally ──────────────────────────────
    if (person) {
      this.ctx.drawImage(person, 0, 0);
    }

    // ── Pass 2: Create the fiery aura outline ────────────────────────
    // Strategy: blur + expand the mask, then subtract the original mask
    // to get just the OUTLINE, then tint it with a fiery gradient.

    const auraCanvas = document.createElement('canvas');
    auraCanvas.width = W; auraCanvas.height = H;
    const ac = auraCanvas.getContext('2d');

    // Draw expanded/blurred mask (the "glow" region)
    // We'll draw the mask multiple times at slight offsets for a cheap expand
    const spread = 12 + Math.sin(this._cloakPhase * 2) * 4; // pulsing spread
    ac.filter = `blur(${spread}px)`;
    ac.drawImage(maskCanvas, 0, 0, W, H);
    ac.filter = 'none';

    // Now subtract the original (un-blurred) mask to get only the outline
    ac.globalCompositeOperation = 'destination-out';
    // Shrink slightly so the aura visibly wraps around the body
    const inset = 4;
    ac.drawImage(maskCanvas, inset, inset, W - inset * 2, H - inset * 2);
    ac.globalCompositeOperation = 'source-over';

    // ── Pass 3: Color the outline with a fiery gradient ──────────────
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = W; colorCanvas.height = H;
    const cc = colorCanvas.getContext('2d');

    // Animated fiery gradient — shifts over time
    const grd = cc.createLinearGradient(0, H, 0, 0);
    const hueShift = (Math.sin(this._cloakPhase * 1.5) * 0.5 + 0.5); // 0-1
    // Bottom: deep red → middle: orange → top: yellow, shifting
    grd.addColorStop(0,   `hsl(${0 + hueShift * 15}, 100%, 45%)`);    // red
    grd.addColorStop(0.3, `hsl(${20 + hueShift * 15}, 100%, 55%)`);   // deep orange
    grd.addColorStop(0.6, `hsl(${35 + hueShift * 10}, 100%, 60%)`);   // orange
    grd.addColorStop(1.0, `hsl(${50 + hueShift * 10}, 100%, 70%)`);   // yellow
    cc.fillStyle = grd;
    cc.fillRect(0, 0, W, H);

    // Use aura outline as mask for the gradient
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(auraCanvas, 0, 0);

    // ── Pass 4: Composite the colored aura onto main canvas ──────────
    // Use 'screen' blending for a hot, glowing look
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    const pulseAlpha = 0.6 + Math.sin(this._cloakPhase * 3) * 0.15;
    this.ctx.globalAlpha = pulseAlpha;
    this.ctx.drawImage(colorCanvas, 0, 0);
    this.ctx.restore();

    // ── Pass 5: Inner glow layer (softer, closer to body) ────────────
    const innerCanvas = document.createElement('canvas');
    innerCanvas.width = W; innerCanvas.height = H;
    const ic = innerCanvas.getContext('2d');

    ic.filter = `blur(${6 + Math.sin(this._cloakPhase * 4) * 2}px)`;
    ic.drawImage(maskCanvas, 0, 0, W, H);
    ic.filter = 'none';
    ic.globalCompositeOperation = 'destination-out';
    ic.drawImage(maskCanvas, 2, 2, W - 4, H - 4);
    ic.globalCompositeOperation = 'source-over';

    // Tint inner glow orange
    const innerColor = document.createElement('canvas');
    innerColor.width = W; innerColor.height = H;
    const icc = innerColor.getContext('2d');
    icc.fillStyle = `hsl(${30 + hueShift * 10}, 100%, 60%)`;
    icc.fillRect(0, 0, W, H);
    icc.globalCompositeOperation = 'destination-in';
    icc.drawImage(innerCanvas, 0, 0);

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.globalAlpha = 0.45 + Math.sin(this._cloakPhase * 5) * 0.1;
    this.ctx.drawImage(innerColor, 0, 0);
    this.ctx.restore();

    // ── Pass 6: Flickering "flame tips" at random points ─────────────
    // Draw small bright dots along the top of the aura for flame illusion
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    const tipCount = 20 + Math.floor(Math.sin(this._cloakPhase * 7) * 5);
    for (let i = 0; i < tipCount; i++) {
      const angle = (i / tipCount) * Math.PI * 2 + this._cloakPhase * 2;
      const radius = spread + 8 + Math.random() * 10;
      // Place tips around the body center
      const tipX = W / 2 + Math.cos(angle) * (W * 0.25 + Math.random() * 40);
      const tipY = H / 2 + Math.sin(angle) * (H * 0.3 + Math.random() * 30) - 30;

      const tipSize = 3 + Math.random() * 6;
      const grad = this.ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, tipSize);
      grad.addColorStop(0, `hsla(${40 + Math.random() * 20}, 100%, 80%, 0.8)`);
      grad.addColorStop(1, `hsla(${20 + Math.random() * 20}, 100%, 50%, 0)`);
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(tipX - tipSize, tipY - tipSize, tipSize * 2, tipSize * 2);
    }
    this.ctx.restore();
  }

  // ── 3. KAWARIMI (Substitution) ──────────────────────────────────────

  _renderKawarimi(now, W, H, person) {
    if (!this._kawarimiStartTime) return;
    const elapsed = now - this._kawarimiStartTime;

    if (elapsed < KAWARIMI_LOG_DURATION_MS) {
      // Phase 1: Show the log where the person was
      if (this._logImg && this._logImg.complete) {
        const logW = W * 0.25;
        const logH = logW * (this._logImg.naturalHeight / this._logImg.naturalWidth || 1);
        const lx = (W - logW) / 2;
        const ly = (H - logH) / 2 + 30;

        // Slight wobble
        const wobble = Math.sin(elapsed * 0.015) * 3;
        this.ctx.save();
        this.ctx.translate(lx + logW / 2 + wobble, ly + logH / 2);
        this.ctx.rotate(Math.sin(elapsed * 0.01) * 0.05);
        this.ctx.drawImage(this._logImg, -logW / 2, -logH / 2, logW, logH);
        this.ctx.restore();
      }
    } else {
      // Phase 2: Person reappears with smoke
      if (person) {
        // Fade in
        const fadeProgress = Math.min((elapsed - KAWARIMI_LOG_DURATION_MS) / 600, 1);
        this.ctx.save();
        this.ctx.globalAlpha = fadeProgress;
        this.ctx.drawImage(person, 0, 0);
        this.ctx.restore();
      }

      // Spawn reappear smoke (once)
      if (elapsed - KAWARIMI_LOG_DURATION_MS < 50 && elapsed - KAWARIMI_LOG_DURATION_MS >= 0) {
        const cx = W / 2, cy = H / 2;
        this._spawnSmoke(cx - 40, cy - 50, 1.3);
        this._spawnSmoke(cx + 40, cy - 50, 1.3);
        this._spawnSmoke(cx, cy + 30, 1.1);
      }
    }
  }

  // ── 4. CLONE SWARM (Afterimage Trail) ───────────────────────────────

  _renderCloneSwarm(now, W, H, person) {
    if (!this._swarmStartTime) return;

    // Capture current frame into rolling buffer (every Nth frame)
    this._swarmFrameCount++;
    if (person && this._swarmFrameCount % SWARM_FRAME_SKIP === 0) {
      const snap = document.createElement('canvas');
      snap.width = W; snap.height = H;
      snap.getContext('2d').drawImage(person, 0, 0);
      this._swarmBuffer.push({ canvas: snap, timestamp: now });
      // Prune old frames
      while (this._swarmBuffer.length > SWARM_BUFFER_SIZE) {
        this._swarmBuffer.shift();
      }
    }

    // Render afterimages from oldest to newest (oldest = most transparent)
    const len = this._swarmBuffer.length;
    for (let i = 0; i < len; i++) {
      const entry = this._swarmBuffer[i];
      const age = (len - i) / len;  // 1 = oldest, 0 = newest
      const alpha = (1 - age) * 0.35;
      const offsetX = (Math.sin(i * 0.7 + now * 0.002) * 15) * age;
      const offsetY = (Math.cos(i * 0.5 + now * 0.003) * 8) * age;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      // Tint afterimages with a cyan/purple hue
      this.ctx.filter = `hue-rotate(${180 + i * 8}deg) brightness(1.3)`;
      this.ctx.drawImage(entry.canvas, offsetX, offsetY);
      this.ctx.restore();
    }

    // Draw current person on top
    if (person) {
      this.ctx.drawImage(person, 0, 0);
    }
  }

  // ── SHARED: Smoke Renderer ──────────────────────────────────────────

  _renderSmokes(now) {
    for (let i = this._smokes.length - 1; i >= 0; i--) {
      const s = this._smokes[i];
      const elapsed = now - s.start;
      const fd = SMOKE_DURATION / SMOKE_FRAME_COUNT;
      const fi = Math.floor(elapsed / fd);
      if (fi >= s.frames.length) { this._smokes.splice(i, 1); continue; }
      const img = s.frames[fi];
      if (!img.complete) continue;
      this.ctx.save();
      this.ctx.translate(s.x, s.y);
      this.ctx.scale(s.scale, s.scale);
      this.ctx.drawImage(img, -img.width / 2, -img.height / 2);
      this.ctx.restore();
    }
  }
}
