/**
 * app.js — entry point for app.html
 *
 * Boot sequence:
 *  1. Build Three.js particle engine on the WebGL overlay canvas
 *  2. Instantiate all effects, add to engine
 *  3. Build HUD
 *  4. Init detection pipeline (loads MediaPipe + TF.js model)
 *  5. Wire shadow-clone lazy segmentation
 */

import { ParticleEngine }   from './effects/particle-engine.js';
import { RasenganEffect }   from './effects/rasengan.js';
import { ChidoriEffect }    from './effects/chidori.js';
import { FireballEffect }   from './effects/fireball.js';
import { ShieldEffect }     from './effects/shield.js';
import { ChakraBeamEffect } from './effects/combo-effects.js';
import { SusanooEffect }    from './effects/combo-effects.js';
import { HUD }              from './hud.js';
import { DetectionPipeline } from './detection-pipeline.js';

// ──────────────────────────────────────────────────────────────────────────
// DOM references
// ──────────────────────────────────────────────────────────────────────────
const videoEl      = document.getElementById('video');
const skeletonCanvas = document.getElementById('skeleton-canvas');
const glCanvas     = document.getElementById('gl-canvas');
const hudContainer = document.getElementById('hud');
const cloneCanvas  = document.getElementById('clone-canvas');
const cloneCtx     = cloneCanvas.getContext('2d');

// ──────────────────────────────────────────────────────────────────────────
// 1. Three.js Particle Engine
// ──────────────────────────────────────────────────────────────────────────
const engine = new ParticleEngine(glCanvas);

// ──────────────────────────────────────────────────────────────────────────
// 2. Effects
// ──────────────────────────────────────────────────────────────────────────
const rasengan    = new RasenganEffect();
const chidori     = new ChidoriEffect();
const fireball    = new FireballEffect();
const shield      = new ShieldEffect();
const chakraBeam  = new ChakraBeamEffect();
const susanoo     = new SusanooEffect();
// Mega fireball reuses the fireball effect at full power
const megaFireball = new FireballEffect();
// Rasengan barrage reuses rasengan
const rasenganBarrage = new RasenganEffect();

const effectsMap = {
  rasengan,
  chidori,
  fireball,
  shield,
  chakra_beam:       chakraBeam,
  susanoo,
  mega_fireball:     megaFireball,
  rasengan_barrage:  rasenganBarrage,
};

for (const fx of Object.values(effectsMap)) {
  engine.addEffect(fx);
  // Wire setPower so power tracks with rAF loop
  // Effects expose setPower(0-1); we'll call with 1.0 on activate
  if (!fx.setPower) fx.setPower = () => {};
  fx.setPower(1.0);
}

// ──────────────────────────────────────────────────────────────────────────
// 3. HUD
// ──────────────────────────────────────────────────────────────────────────
const hud = new HUD(hudContainer);

// ──────────────────────────────────────────────────────────────────────────
// 4. Shadow Clone — lazy SelfieSegmentation
// ──────────────────────────────────────────────────────────────────────────
let selfie = null;
let selfieActive = false;
let cloneMask = null;
let cloneStartTime = null;
let clonesTeardownTimer = null;

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

const SMOKE_FOLDERS = ['smoke_1', 'smoke_2', 'smoke_3'];
const SMOKE_FRAME_COUNT = 5;
const SMOKE_DURATION = 600;
const activeSmokes = [];

function spawnSmoke(x, y, scale) {
  const folder = SMOKE_FOLDERS[Math.floor(Math.random() * SMOKE_FOLDERS.length)];
  const frames = [];
  for (let i = 1; i <= SMOKE_FRAME_COUNT; i++) {
    const img = new Image();
    img.src = `assets/${folder}/${i}.png`;
    frames.push(img);
  }
  activeSmokes.push({ x, y, scale: scale * 1.2, start: performance.now(), frames });
}

function spinUpSelfieSegmentation() {
  if (selfieActive) return;
  selfieActive = true;
  selfie = new SelfieSegmentation({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
  });
  selfie.setOptions({ modelSelection: 1 });
  selfie.onResults((r) => { cloneMask = r.segmentationMask; });
  console.log('[SelfieSegmentation] spun up for shadow clone');
}

function tearDownSelfieSegmentation() {
  selfieActive = false;
  selfie = null;
  cloneMask = null;
  console.log('[SelfieSegmentation] torn down');
}

function grabPerson(srcCanvas) {
  if (!cloneMask) return null;
  const off = document.createElement('canvas');
  off.width = srcCanvas.width;
  off.height = srcCanvas.height;
  const c = off.getContext('2d');
  c.drawImage(cloneMask, 0, 0, off.width, off.height);
  c.globalCompositeOperation = 'source-in';
  c.drawImage(videoEl, 0, 0, off.width, off.height);
  c.globalCompositeOperation = 'source-over';
  return off;
}

let cloneDefs = [];

function triggerShadowClones() {
  spinUpSelfieSegmentation();
  cloneStartTime = performance.now();
  cloneDefs = CLONE_DEFS.map(d => ({ ...d, smokeSpawned: false }));
  hud.showJutsuName('👥 Shadow Clone Jutsu!');

  // Schedule teardown 8 seconds after trigger
  clearTimeout(clonesTeardownTimer);
  clonesTeardownTimer = setTimeout(() => {
    tearDownSelfieSegmentation();
    cloneStartTime = null;
    cloneDefs = [];
  }, 8000);
}

// Shadow-clone render loop (separate 2D canvas on top of video)
function drawClonesFrame() {
  requestAnimationFrame(drawClonesFrame);
  if (!cloneStartTime || !selfieActive) {
    cloneCanvas.width = cloneCanvas.width; // clear
    return;
  }

  // Send video frame to selfie segmentation
  if (selfie && selfieActive) {
    selfie.send({ image: videoEl }).catch(() => {});
  }

  cloneCanvas.width  = videoEl.videoWidth  || 1280;
  cloneCanvas.height = videoEl.videoHeight || 720;
  cloneCtx.clearRect(0, 0, cloneCanvas.width, cloneCanvas.height);

  const person = grabPerson(cloneCanvas);
  if (!person) return;

  const now = performance.now();

  // Draw background video (mirrored)
  cloneCtx.save();
  cloneCtx.scale(-1, 1);
  cloneCtx.drawImage(videoEl, -cloneCanvas.width, 0, cloneCanvas.width, cloneCanvas.height);
  cloneCtx.restore();

  // Draw clones (sorted deepest first)
  const sorted = [...cloneDefs].sort((a, b) => b.delay - a.delay);
  for (const cl of sorted) {
    if (now - cloneStartTime < cl.delay) continue;
    if (!cl.smokeSpawned) {
      cl.smokeSpawned = true;
      const cx = cl.x + cloneCanvas.width / 2;
      const cy = cl.y + cloneCanvas.height / 2 - 40;
      spawnSmoke(cx - 15, cy, cl.scale);
      spawnSmoke(cx + 15, cy, cl.scale);
    }
    cloneCtx.save();
    cloneCtx.translate(cl.x + cloneCanvas.width * (1 - cl.scale) / 2, cl.y);
    cloneCtx.scale(cl.scale, cl.scale);
    cloneCtx.drawImage(person, 0, 0);
    cloneCtx.restore();
  }

  // Main person
  cloneCtx.drawImage(person, 0, 0);

  // Draw smoke
  for (let i = activeSmokes.length - 1; i >= 0; i--) {
    const s = activeSmokes[i];
    const elapsed = now - s.start;
    const fd = SMOKE_DURATION / SMOKE_FRAME_COUNT;
    const fi = Math.floor(elapsed / fd);
    if (fi >= s.frames.length) { activeSmokes.splice(i, 1); continue; }
    const img = s.frames[fi];
    cloneCtx.save();
    cloneCtx.translate(s.x, s.y);
    cloneCtx.scale(s.scale, s.scale);
    cloneCtx.drawImage(img, -img.width / 2, -img.height / 2);
    cloneCtx.restore();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Detection pipeline
// ──────────────────────────────────────────────────────────────────────────
const pipeline = new DetectionPipeline({
  video:          videoEl,
  overlayCanvas:  skeletonCanvas,
  effectsMap,
  particleEngine: engine,
  hud,
  onCloneTrigger: triggerShadowClones,
});

pipeline.init();
drawClonesFrame();

// Expose for debugging
window.njv2 = { pipeline, hud, engine };
