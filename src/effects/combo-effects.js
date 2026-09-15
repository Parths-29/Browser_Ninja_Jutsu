import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { ParticleEffect } from './particle-engine.js';

/**
 * Chakra Beam — a tight forward-facing beam for the Point gesture.
 * Shown as a glowing directional cone of particles shooting from the hand.
 */
export class ChakraBeamEffect extends ParticleEffect {
  constructor() {
    super();

    const PARTICLE_COUNT = 350;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const vel = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0;
      // Beam shoots upward (toward the top of the screen)
      const spread = (Math.random() - 0.5) * 18;
      vel.push({
        x: spread,
        y: 80 + Math.random() * 120,
        z: (Math.random() - 0.5) * 8,
        life: Math.random(),
        maxLife: 0.4 + Math.random() * 0.6,
      });

      // Teal/gold chakra color
      const t = Math.random();
      col[i * 3]     = 0.9 + 0.1 * t;
      col[i * 3 + 1] = 0.8 + 0.2 * (1 - t);
      col[i * 3 + 2] = 0.2 + 0.3 * (1 - t);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 3,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 1.0,
    });

    this._particles = new THREE.Points(geo, mat);
    this._pos    = pos;
    this._vel    = vel;
    this._posAttr = geo.attributes.position;
    this.group.add(this._particles);

    // Gold inner glow disc
    const coreGeo = new THREE.CircleGeometry(16, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._core = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this._core);

    this._t = 0;
    this._power = 0;
    this.group.visible = false;
  }

  setPower(power) {
    this._power = power;
    this._particles.material.opacity = Math.min(1, power * 1.4);
    this._core.material.opacity = 0.45 * power;
  }

  update(dt) {
    if (!this.isActive) return;
    this._t += dt;

    for (let i = 0; i < this._vel.length; i++) {
      const v = this._vel[i];
      v.life += dt;
      if (v.life > v.maxLife) {
        v.life = 0;
        v.maxLife = 0.4 + Math.random() * 0.6;
        this._pos[i * 3] = this._pos[i * 3 + 1] = this._pos[i * 3 + 2] = 0;
      } else {
        const alpha = 1 - v.life / v.maxLife;
        this._pos[i * 3]     += v.x * dt;
        this._pos[i * 3 + 1] += v.y * dt * (0.5 + 0.5 * alpha);
        this._pos[i * 3 + 2] += v.z * dt;
      }
    }
    this._posAttr.needsUpdate = true;
    this._core.material.opacity = 0.45 * this._power + 0.12 * Math.sin(this._t * 12);
  }
}

/**
 * Susano'o Aura — massive purple full-body energy burst.
 * Triggered by the Rock/Horns combo.
 */
export class SusanooEffect extends ParticleEffect {
  constructor() {
    super();

    const PARTICLE_COUNT = 900;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const vel = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 160;
      const r = 30 + Math.random() * 80;
      pos[i * 3]     = Math.cos(angle) * r;
      pos[i * 3 + 1] = Math.sin(angle) * r * 2.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      vel.push({
        x: Math.cos(angle) * speed * 0.4,
        y: Math.sin(angle) * speed + 20,
        z: (Math.random() - 0.5) * 20,
        life: Math.random(),
        maxLife: 0.8 + Math.random() * 1.2,
      });

      // Deep purple/blue
      const t = Math.random();
      col[i * 3]     = 0.5 + 0.4 * t;
      col[i * 3 + 1] = 0.1 + 0.2 * t;
      col[i * 3 + 2] = 0.9 + 0.1 * t;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 4,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 1.0,
    });

    this._particles = new THREE.Points(geo, mat);
    this._pos    = pos;
    this._vel    = vel;
    this._posAttr = geo.attributes.position;
    this.group.add(this._particles);

    this._t = 0;
    this._power = 0;
    this.group.visible = false;
  }

  setPower(power) {
    this._power = power;
    this._particles.material.opacity = Math.min(1, power * 1.4);
  }

  update(dt) {
    if (!this.isActive) return;
    this._t += dt;
    for (let i = 0; i < this._vel.length; i++) {
      const v = this._vel[i];
      v.life += dt;
      if (v.life > v.maxLife) {
        v.life = 0;
        const angle = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 80;
        this._pos[i * 3]     = Math.cos(angle) * r;
        this._pos[i * 3 + 1] = Math.sin(angle) * r * 2.5;
        this._pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      } else {
        const alpha = 1 - v.life / v.maxLife;
        this._pos[i * 3]     += v.x * dt;
        this._pos[i * 3 + 1] += v.y * dt * (0.3 + 0.7 * alpha);
        this._pos[i * 3 + 2] += v.z * dt;
      }
    }
    this._posAttr.needsUpdate = true;
  }
}
