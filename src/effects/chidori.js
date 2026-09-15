import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { ParticleEffect } from './particle-engine.js';

/**
 * Chidori — crackling lightning bolts + electric spark particles.
 * Right hand open palm → purple-white electric storm centered on palm.
 */
export class ChidoriEffect extends ParticleEffect {
  constructor() {
    super();

    // ── Spark particles ──────────────────────────────────────────
    const SPARK_COUNT = 400;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos  = new Float32Array(SPARK_COUNT * 3);
    const sparkVel  = [];   // velocity vectors, kept in JS
    const sparkCol  = new Float32Array(SPARK_COUNT * 3);

    for (let i = 0; i < SPARK_COUNT; i++) {
      sparkPos[i * 3] = sparkPos[i * 3 + 1] = sparkPos[i * 3 + 2] = 0;
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 80;
      sparkVel.push({
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
        z: (Math.random() - 0.5) * 20,
        life: Math.random(),
        maxLife: 0.3 + Math.random() * 0.5,
      });
      const t = Math.random();
      sparkCol[i * 3]     = 0.6 + 0.4 * t;  // R
      sparkCol[i * 3 + 1] = 0.7 + 0.3 * t;  // G
      sparkCol[i * 3 + 2] = 1.0;              // B
    }

    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute('color',    new THREE.BufferAttribute(sparkCol, 3));

    const sparkMat = new THREE.PointsMaterial({
      size: 2.5,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 1,
    });

    this._sparks    = new THREE.Points(sparkGeo, sparkMat);
    this._sparkPos  = sparkPos;
    this._sparkVel  = sparkVel;
    this._sparkPosAttr = sparkGeo.attributes.position;
    this.group.add(this._sparks);

    // ── Lightning bolt line segments ─────────────────────────────
    const BOLT_SEGMENTS = 8;   // segments per bolt
    const BOLT_COUNT    = 6;   // number of bolts
    const totalPts = BOLT_COUNT * (BOLT_SEGMENTS + 1);
    const boltGeo  = new THREE.BufferGeometry();
    const boltPos  = new Float32Array(totalPts * 3);
    boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));

    // Build draw range using LineSegments (pairs of points)
    const indices = [];
    for (let b = 0; b < BOLT_COUNT; b++) {
      const base = b * (BOLT_SEGMENTS + 1);
      for (let s = 0; s < BOLT_SEGMENTS; s++) {
        indices.push(base + s, base + s + 1);
      }
    }
    boltGeo.setIndex(indices);

    const boltMat = new THREE.LineBasicMaterial({
      color: 0xaabbff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });

    this._bolts    = new THREE.LineSegments(boltGeo, boltMat);
    this._boltPos  = boltPos;
    this._boltPosAttr = boltGeo.attributes.position;
    this._boltParams = {
      count: BOLT_COUNT,
      segments: BOLT_SEGMENTS,
    };
    this.group.add(this._bolts);

    // ── Core glow disc ────────────────────────────────────────────
    const glowGeo = new THREE.CircleGeometry(40, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x6699ff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._glow = new THREE.Mesh(glowGeo, glowMat);
    this.group.add(this._glow);

    this._t     = 0;
    this._power = 0;
    this.group.visible = false;
  }

  setPower(power) {
    this._power = power;
    this._sparks.material.opacity = Math.min(1, power * 1.3);
    this._bolts.material.opacity  = 0.9 * power;
    this._glow.material.opacity   = 0.22 * power;
  }

  _rebuildBolts() {
    const { count, segments } = this._boltParams;
    const maxR = 55;

    for (let b = 0; b < count; b++) {
      const base  = b * (segments + 1);
      const angle = (b / count) * Math.PI * 2 + Math.random() * 0.5;

      let px = 0, py = 0;
      this._boltPos[base * 3]     = px;
      this._boltPos[base * 3 + 1] = py;
      this._boltPos[base * 3 + 2] = 0;

      const endX = Math.cos(angle) * maxR;
      const endY = Math.sin(angle) * maxR;

      for (let s = 1; s <= segments; s++) {
        const t = s / segments;
        const jitter = (1 - t) * 14;
        px = endX * t + (Math.random() - 0.5) * jitter;
        py = endY * t + (Math.random() - 0.5) * jitter;
        const idx = (base + s) * 3;
        this._boltPos[idx]     = px;
        this._boltPos[idx + 1] = py;
        this._boltPos[idx + 2] = (Math.random() - 0.5) * 5;
      }
    }
    this._boltPosAttr.needsUpdate = true;
  }

  update(dt) {
    if (!this.isActive) return;
    this._t += dt;

    // Rebuild bolts every ~3 frames for crackle effect
    if (Math.floor(this._t * 60) % 3 === 0) {
      this._rebuildBolts();
    }

    // Update spark particles (simple particle lifecycle)
    for (let i = 0; i < this._sparkVel.length; i++) {
      const v = this._sparkVel[i];
      v.life += dt;
      if (v.life > v.maxLife) {
        // Respawn from center
        v.life = 0;
        v.maxLife = 0.3 + Math.random() * 0.5;
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 80;
        v.x = Math.cos(angle) * speed;
        v.y = Math.sin(angle) * speed;
        this._sparkPos[i * 3]     = 0;
        this._sparkPos[i * 3 + 1] = 0;
        this._sparkPos[i * 3 + 2] = 0;
      } else {
        const alpha = 1 - v.life / v.maxLife;
        this._sparkPos[i * 3]     += v.x * dt * alpha;
        this._sparkPos[i * 3 + 1] += v.y * dt * alpha;
        this._sparkPos[i * 3 + 2] += v.z * dt * alpha;
      }
    }
    this._sparkPosAttr.needsUpdate = true;

    // Pulse glow
    this._glow.material.opacity = 0.22 * this._power + 0.08 * Math.sin(this._t * 15);
    this._glow.rotation.z += dt * 2;
  }
}
