import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { ParticleEffect } from './particle-engine.js';

/**
 * Shield Aura — rotating hexagonal ring barrier.
 * Triggered by the Fist hand pose.
 */
export class ShieldEffect extends ParticleEffect {
  constructor() {
    super();

    // Ring of particles
    const PARTICLE_COUNT = 300;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const radii = new Float32Array(PARTICLE_COUNT);
    const anglesBase = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const r = 48 + (Math.random() - 0.5) * 22;
      radii[i] = r;
      anglesBase[i] = angle;
      pos[i * 3]     = Math.cos(angle) * r;
      pos[i * 3 + 1] = Math.sin(angle) * r;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;

      // Purple-green energy palette
      const t = Math.random();
      col[i * 3]     = 0.2 + 0.3 * t;   // R
      col[i * 3 + 1] = 0.8 + 0.2 * t;   // G (greenish)
      col[i * 3 + 2] = 0.5 + 0.4 * t;   // B
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

    this._particles  = new THREE.Points(geo, mat);
    this._pos        = pos;
    this._posAttr    = geo.attributes.position;
    this._radii      = radii;
    this._anglesBase = anglesBase;
    this.group.add(this._particles);

    // Hexagonal outline ring using EdgesGeometry
    const hexGeo = new THREE.CylinderGeometry(55, 55, 2, 6);
    const edgesGeo = new THREE.EdgesGeometry(hexGeo);
    const edgeMat  = new THREE.LineBasicMaterial({
      color: 0x44ffaa,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.6,
    });
    this._hexRing = new THREE.LineSegments(edgesGeo, edgeMat);
    this._hexRing.rotation.x = Math.PI / 2;
    this.group.add(this._hexRing);

    this._t = 0;
    this._power = 0;
    this.group.visible = false;
  }

  setPower(power) {
    this._power = power;
    this._particles.material.opacity = Math.min(1, power * 1.2);
    this._hexRing.material.opacity   = 0.6 * power;
  }

  update(dt) {
    if (!this.isActive) return;
    this._t += dt;

    const speed = 1.5;
    for (let i = 0; i < this._anglesBase.length; i++) {
      const angle = this._anglesBase[i] + this._t * speed;
      const r     = this._radii[i] + 6 * Math.sin(this._t * 3 + i * 0.08);
      this._pos[i * 3]     = Math.cos(angle) * r;
      this._pos[i * 3 + 1] = Math.sin(angle) * r;
      this._pos[i * 3 + 2] = 8 * Math.sin(this._t * 4 + i * 0.12);
    }
    this._posAttr.needsUpdate = true;

    this._hexRing.rotation.z = this._t * 0.8;
    this._hexRing.material.opacity = 0.6 * this._power + 0.1 * Math.sin(this._t * 5);
  }
}
