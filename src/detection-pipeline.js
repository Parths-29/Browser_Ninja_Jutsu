/**
 * detection-pipeline.js
 *
 * Orchestrates the full detection → smoothing → classify → gate → effect dispatch loop.
 *
 * Architecture:
 *   Camera frame
 *     └─► MediaPipe Holistic (always-on, rate-limited to ~30fps)
 *            ├─► LandmarkSmoother (One Euro Filter)
 *            ├─► classifyPose (geometric finger-pose) + TF.js model (shadow clone check)
 *            ├─► GestureGate (hold 200ms, cooldown 300ms)
 *            ├─► ComboSystem (rolling gesture buffer)
 *            ├─► ParticleEngine effects (dispatched per gesture)
 *            └─► HUD.tick() / HUD updates
 *
 * SelfieSegmentation:
 *   Spun up ONLY when a shadow_clone effect is triggered.
 *   Torn down 5 seconds after the effect ends.
 */

import { LandmarkSmoother }        from './landmark-filter.js';
import { GestureGate }             from './gesture-gate.js';
import { classifyPose, GESTURE_EFFECT_MAP } from './finger-pose.js';
import { ComboSystem }             from './combo-system.js';

export class DetectionPipeline {
  /**
   * @param {object} opts
   * @param {HTMLVideoElement}   opts.video
   * @param {HTMLCanvasElement}  opts.overlayCanvas  — for 2d skeleton
   * @param {object}             opts.effectsMap     — { effectName: EffectInstance }
   * @param {object}             opts.particleEngine — ParticleEngine instance
   * @param {object}             opts.hud            — HUD instance
   * @param {Function}           opts.onCloneTrigger — called to start shadow clone sequence
   */
  constructor(opts) {
    this.video          = opts.video;
    this.overlayCanvas  = opts.overlayCanvas;
    this.overlayCtx     = opts.overlayCanvas.getContext('2d');
    this.effectsMap     = opts.effectsMap;
    this.particleEngine = opts.particleEngine;
    this.hud            = opts.hud;
    this.onCloneTrigger = opts.onCloneTrigger ?? (() => {});
    this.silhouetteEngine = opts.silhouetteEngine ?? null;

    this.smoother = new LandmarkSmoother({ freq: 30, minCutoff: 1.0, beta: 0.007 });
    this.gate     = new GestureGate({ holdMs: 200, cooldownMs: 300 });
    this.combo    = new ComboSystem();

    // TF.js model for shadow clone (loaded externally, injected here)
    this.gestureModel = null;

    // Active effects tracking for chakra drain
    this._activeEffects = new Set();

    // Target inference cadence
    this._targetInterval = 1000 / 30;  // 30fps cap
    this._lastInferenceTime = 0;

    // MediaPipe setup
    this._holistic = null;
    this._camera   = null;

    // Combo → effect dispatch
    this.combo.onCombo    = (c) => this._onCombo(c);
    this.combo.onProgress = (buf, partial) => this.hud.updateComboProgress(buf, partial);

    // Gesture gate → effect dispatch
    this.gate.onActivate   = (g) => this._onGestureActivate(g);
    this.gate.onDeactivate = (g) => this._onGestureDeactivate(g);

    // rAF render loop (runs at full display Hz)
    this._rafId = null;
    this._lastRafTime = 0;

    // Track most-recently detected hand landmarks per side (smoothed)
    this._landmarks = { Left: null, Right: null };

    this._gestureLabel = { Left: 'unknown', Right: 'unknown' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  async init() {
    // Load TF.js gesture model (shadow clone)
    if (typeof tf !== 'undefined') {
      try {
        this.gestureModel = await tf.loadLayersModel('gesture-model.json');
        console.log('[Pipeline] TF.js gesture model loaded');
      } catch (e) {
        console.warn('[Pipeline] Could not load TF.js model:', e.message);
      }
    }

    // MediaPipe Holistic
    this._holistic = new Holistic({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}`,
    });
    this._holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: false, // we handle smoothing ourselves
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.65,
    });
    this._holistic.onResults(this._onHolisticResults.bind(this));

    // Camera
    this._camera = new Camera(this.video, {
      width: 1280, height: 720,
      onFrame: async () => {
        const now = performance.now();
        if (now - this._lastInferenceTime >= this._targetInterval) {
          const t0 = performance.now();
          await this._holistic.send({ image: this.video });
          this.hud.setInferenceMs(performance.now() - t0);
          this._lastInferenceTime = now;
        }
      },
    });
    await this._camera.start();

    // Start render loop
    this._rafLoop(0);
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._camera?.stop?.();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render loop (rAF — runs at display Hz, decoupled from inference)
  // ─────────────────────────────────────────────────────────────────────────

  _rafLoop(timestamp) {
    this._rafId = requestAnimationFrame(this._rafLoop.bind(this));
    const dt = Math.min((timestamp - this._lastRafTime) / 1000, 0.1);
    this._lastRafTime = timestamp;

    // Sync effect positions to latest smoothed landmarks
    this._updateEffectPositions();

    // HUD tick (FPS counter, combo progress)
    this.hud.tick(dt);

    // Silhouette engine tick (shadow clone, chakra cloak, etc.)
    if (this.silhouetteEngine) this.silhouetteEngine.tick();

    // Three.js particle render
    this.particleEngine.render();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MediaPipe results handler
  // ─────────────────────────────────────────────────────────────────────────

  _onHolisticResults(res) {
    const ts = performance.now() / 1000;

    // Mirror overlay canvas size
    this.overlayCanvas.width  = this.video.videoWidth  || 1280;
    this.overlayCanvas.height = this.video.videoHeight || 720;
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    const hands = [
      { lm: res.leftHandLandmarks,  label: 'Left'  },
      { lm: res.rightHandLandmarks, label: 'Right' },
    ];

    for (const { lm, label } of hands) {
      if (!lm) {
        // Hand lost → reset smoother for that hand
        if (this._landmarks[label]) {
          this.smoother.reset(label);
          this._landmarks[label] = null;
        }
        // Deactivate via gate (will flip to idle → effects fade)
        const prev = this._gestureLabel[label];
        if (prev !== 'unknown') {
          this.gate.update(`${label}:${prev}`, false, performance.now());
        }
        this._gestureLabel[label] = 'unknown';
        continue;
      }

      // ── Smooth landmarks ───────────────────────────────────────
      const smoothed = this.smoother.filter(lm, label, ts);
      this._landmarks[label] = smoothed;

      // ── Draw skeleton ──────────────────────────────────────────
      this._drawSkeleton(smoothed);

      // ── Classify pose ──────────────────────────────────────────
      const { gesture, confidence } = classifyPose(smoothed);
      this._gestureLabel[label] = gesture;
      this.hud.setActiveGesture(`${label[0]}:${gesture}`);

      const isDetected = gesture !== 'unknown' && confidence >= 0.7;
      const gateKey = `${label}:${gesture}`;

      const isActive = this.gate.update(gateKey, isDetected, performance.now());

      // Push to combo system only on fresh activation (leading edge)
      // We do this inside onActivate callback.
    }

    // ── TF.js shadow clone check (both hands required) ─────────────────────
    if (this.gestureModel && res.rightHandLandmarks && res.leftHandLandmarks) {
      const prob = this._predictShadowClone(
        res.rightHandLandmarks,
        res.leftHandLandmarks
      );
      const isCloneSign = prob > 0.999;
      const wasActive = this.gate.update('clone_sign', isCloneSign, performance.now());

      const confEl = document.getElementById('clone-confidence');
      if (confEl) confEl.textContent = `Shadow Clone: ${(prob * 100).toFixed(1)}%`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TF.js shadow clone predictor
  // ─────────────────────────────────────────────────────────────────────────

  _predictShadowClone(right, left) {
    try {
      const input = tf.tensor2d([[
        ...this._normalizeLandmarks(right),
        ...this._normalizeLandmarks(left),
      ]]);
      const prob = this.gestureModel.predict(input).dataSync()[0];
      input.dispose();
      return prob;
    } catch {
      return 0;
    }
  }

  _normalizeLandmarks(lm) {
    const w = lm[0], mcp = lm[9];
    const scale = Math.sqrt(
      (mcp.x - w.x) ** 2 + (mcp.y - w.y) ** 2 + (mcp.z - w.z) ** 2
    ) || 1;
    const out = [];
    for (let i = 0; i < 21; i++) {
      out.push((lm[i].x - w.x) / scale, (lm[i].y - w.y) / scale, (lm[i].z - w.z) / scale);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gesture gate callbacks → effect dispatch
  // ─────────────────────────────────────────────────────────────────────────

  _onGestureActivate(gateKey) {
    // Parse key
    if (gateKey === 'clone_sign') {
      this.hud.showJutsuName('👥 Shadow Clone Jutsu!');
      this.onCloneTrigger();
      return;
    }

    const [hand, gesture] = gateKey.split(':');
    const effectName = GESTURE_EFFECT_MAP[hand]?.[gesture];
    if (!effectName) return;

    // Push to combo system
    this.combo.push(gesture, performance.now());

    this._activateEffect(effectName, hand);
    this.hud.showJutsuName(effectLabelFor(effectName));
  }

  _onGestureDeactivate(gateKey) {
    if (gateKey === 'clone_sign') return;
    const [hand, gesture] = gateKey.split(':');
    const effectName = GESTURE_EFFECT_MAP[hand]?.[gesture];
    if (effectName) this._deactivateEffect(effectName, performance.now());
  }

  _activateEffect(name, hand) {
    const fx = this.effectsMap[name];
    if (!fx) return;
    fx.activate(0, 0);  // position set in _updateEffectPositions
    this._activeEffects.add(`${hand}:${name}`);
  }

  _deactivateEffect(name, _timestamp) {
    const fx = this.effectsMap[name];
    if (!fx) return;
    fx.deactivate();
    // Remove from active set (both hands)
    for (const key of [...this._activeEffects]) {
      if (key.endsWith(`:${name}`)) this._activeEffects.delete(key);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Combo handler
  // ─────────────────────────────────────────────────────────────────────────

  _onCombo(combo) {
    // Silhouette-driven combos are routed to the silhouette engine
    if (combo.silhouette && this.silhouetteEngine) {
      const method = this.silhouetteEngine[combo.silhouette];
      if (method) method.call(this.silhouetteEngine);
      this.hud.showJutsuName(combo.label);
      console.log('[Combo]', combo.label);
      return;
    }

    const fx = this.effectsMap[combo.effect];
    if (fx) {
      fx.activate(window.innerWidth / 2, window.innerHeight / 2);
      fx.setPower?.(1.0);
      this._activeEffects.add(`combo:${combo.effect}`);
      // Auto-deactivate combo after 4 seconds
      setTimeout(() => {
        fx.deactivate();
        this._activeEffects.delete(`combo:${combo.effect}`);
      }, 4000);
    }
    this.hud.showJutsuName(combo.label);
    console.log('[Combo]', combo.label);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect position sync (called every rAF)
  // ─────────────────────────────────────────────────────────────────────────

  _updateEffectPositions() {
    const W = window.innerWidth, H = window.innerHeight;

    for (const [handLabel, lm] of Object.entries(this._landmarks)) {
      if (!lm) continue;

      // Palm center: midpoint of wrist (0) and middle MCP (9)
      const palmX = ((lm[0].x + lm[9].x) / 2);
      const palmY = ((lm[0].y + lm[9].y) / 2);

      // Map normalised (0-1) → screen pixels. Feed is mirrored.
      const screenX = (1 - palmX) * W;
      const screenY = palmY * H;

      const gesture = this._gestureLabel[handLabel];
      const effectName = GESTURE_EFFECT_MAP[handLabel]?.[gesture];
      if (effectName && this.effectsMap[effectName]) {
        const fx = this.effectsMap[effectName];
        if (fx.isActive) fx.setPosition(screenX, screenY);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Skeleton drawing
  // ─────────────────────────────────────────────────────────────────────────

  _drawSkeleton(lm) {
    const ctx = this.overlayCtx;
    const W   = this.overlayCanvas.width;
    const H   = this.overlayCanvas.height;

    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],       // thumb
      [0,5],[5,6],[6,7],[7,8],       // index
      [0,9],[9,10],[10,11],[11,12],  // middle
      [0,13],[13,14],[14,15],[15,16],// ring
      [0,17],[17,18],[18,19],[19,20],// pinky
      [5,9],[9,13],[13,17],          // palm
    ];

    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f0ff';
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;

    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo((1 - lm[a].x) * W, lm[a].y * H);
      ctx.lineTo((1 - lm[b].x) * W, lm[b].y * H);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    for (const pt of lm) {
      ctx.beginPath();
      ctx.arc((1 - pt.x) * W, pt.y * H, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
function effectLabelFor(name) {
  const labels = {
    rasengan:    '🌀 Rasengan!',
    chidori:     '⚡ Chidori!',
    fireball:    '🔥 Fire Release!',
    shield:      '🛡 Chakra Shield!',
    chakra_beam: '✨ Chakra Beam!',
    susanoo:     '⚡ Susano\'o!',
    mega_fireball:    '🔥🔥 Great Fireball Jutsu!',
    rasengan_barrage: '🌀🌀 Rasengan Barrage!',
    shadow_clone:     '👥 Shadow Clone Jutsu!',
  };
  return labels[name] ?? name;
}
