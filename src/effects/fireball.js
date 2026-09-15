import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { ParticleEffect } from './particle-engine.js';

/**
 * Fire Release — expanding fireball + upward drifting embers.
 * Triggered by the Peace / Victory hand pose.
 */
export class FireballEffect extends ParticleEffect {
  constructor() {
    super();

    const PARTICLE_COUNT = 500;
    const geo  = new THREE.BufferGeometry();
    const pos  = new Float32Array(PARTICLE_COUNT * 3);
    const col  = new Float32Array(PARTICLE_COUNT * 3);
    const vel  = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0;
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 90;
      vel.push({
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed * 0.7 + 15, // slight upward bias
        z: (Math.random() - 0.5) * 10,
        life: Math.random(),
        maxLife: 0.4 + Math.random() * 0.8,
      });

      // Fire gradient: yellow core → orange → red tip
      const t = Math.random();
      col[i * 3]     = 1.0;
      col[i * 3 + 1] = 0.35 + 0.55 * (1 - t);
      col[i * 3 + 2] = 0.0 + 0.1 * (1 - t);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 4.5,
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

    // Core fireball disc
    const coreGeo = new THREE.CircleGeometry(28, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.4,
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
    this._particles.material.opacity = Math.min(1, power * 1.5);
    this._core.material.opacity = 0.4 * power;
  }

  update(dt) {
    if (!this.isActive) return;
    this._t += dt;

    for (let i = 0; i < this._vel.length; i++) {
      const v = this._vel[i];
      v.life += dt;

      if (v.life > v.maxLife) {
        v.life = 0;
        v.maxLife = 0.4 + Math.random() * 0.8;
        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 90;
        v.x = Math.cos(angle) * speed;
        v.y = Math.sin(angle) * speed * 0.7 + 15;
        this._pos[i * 3] = this._pos[i * 3 + 1] = this._pos[i * 3 + 2] = 0;
      } else {
        const alpha = 1 - v.life / v.maxLife;
        // Gravity pull-back on old particles
        v.y -= 60 * dt * (1 - alpha);
        this._pos[i * 3]     += v.x * dt * alpha;
        this._pos[i * 3 + 1] += v.y * dt * alpha;
        this._pos[i * 3 + 2] += v.z * dt;
      }
    }
    this._posAttr.needsUpdate = true;

    this._core.material.opacity = 0.4 * this._power + 0.1 * Math.sin(this._t * 10);
    this._core.rotation.z += dt * 1.2;
  }
}
