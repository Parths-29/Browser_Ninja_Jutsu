/**
 * app.js — entry point for app.html
 *
 * Boot sequence:
 *  1. Build Three.js particle engine on the WebGL overlay canvas
 *  2. Instantiate all effects, add to engine
 *  3. Build HUD
 *  4. Build SilhouetteEngine (handles all body-mask effects)
 *  5. Init detection pipeline (loads MediaPipe + TF.js model)
 */

import { ParticleEngine }     from './effects/particle-engine.js';
import { RasenganEffect }     from './effects/rasengan.js';
import { ChidoriEffect }      from './effects/chidori.js';
import { FireballEffect }     from './effects/fireball.js';
import { ShieldEffect }       from './effects/shield.js';
import { ChakraBeamEffect }   from './effects/combo-effects.js';
import { SusanooEffect }      from './effects/combo-effects.js';
import { HUD }                from './hud.js';
import { SilhouetteEngine }   from './silhouette-engine.js';
import { DetectionPipeline }  from './detection-pipeline.js';

// ──────────────────────────────────────────────────────────────────────────
// DOM references
// ──────────────────────────────────────────────────────────────────────────
const videoEl        = document.getElementById('video');
const skeletonCanvas = document.getElementById('skeleton-canvas');
const glCanvas       = document.getElementById('gl-canvas');
const hudContainer   = document.getElementById('hud');
const silCanvas      = document.getElementById('clone-canvas');  // reused for all silhouette effects

// ──────────────────────────────────────────────────────────────────────────
// 1. Three.js Particle Engine
// ──────────────────────────────────────────────────────────────────────────
const engine = new ParticleEngine(glCanvas);

// ──────────────────────────────────────────────────────────────────────────
// 2. Effects
// ──────────────────────────────────────────────────────────────────────────
const rasengan         = new RasenganEffect();
const chidori          = new ChidoriEffect();
const fireball         = new FireballEffect();
const shield           = new ShieldEffect();
const chakraBeam       = new ChakraBeamEffect();
const susanoo          = new SusanooEffect();
const megaFireball     = new FireballEffect();
const rasenganBarrage  = new RasenganEffect();

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
  if (!fx.setPower) fx.setPower = () => {};
  fx.setPower(1.0);
}

// ──────────────────────────────────────────────────────────────────────────
// 3. HUD
// ──────────────────────────────────────────────────────────────────────────
const hud = new HUD(hudContainer);

// ──────────────────────────────────────────────────────────────────────────
// 4. Silhouette Engine (Shadow Clone, Chakra Cloak, Kawarimi, Clone Swarm)
// ──────────────────────────────────────────────────────────────────────────
const silhouetteEngine = new SilhouetteEngine(silCanvas, videoEl, hud);

// ──────────────────────────────────────────────────────────────────────────
// 5. Detection pipeline
// ──────────────────────────────────────────────────────────────────────────
const pipeline = new DetectionPipeline({
  video:            videoEl,
  overlayCanvas:    skeletonCanvas,
  effectsMap,
  particleEngine:   engine,
  hud,
  silhouetteEngine,
  onCloneTrigger:   () => silhouetteEngine.triggerShadowClone(),
});

pipeline.init();

// Expose for debugging
window.njv2 = { pipeline, hud, engine, silhouetteEngine };
