import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { ParticleEffect } from './particle-engine.js';

/**
 * Rasengan — swirling blue-white spiral particle sphere.
 * Left hand open palm → blue vortex orb with outer glow ring.
 */
export class RasenganEffect extends ParticleEffect {
  constructor() {
    super();

    const PARTICLE_COUNT = 700;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors    = new Float32Array(PARTICLE_COUNT * 3);
    const angles    = new Float32Array(PARTICLE_COUNT);  // stored for animation

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Start on a unit sphere, spread randomly
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 25 + Math.random() * 20;

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;

      angles[i] = theta;

      // Gradient: core white → mid cyan → outer deep blue
      const t = Math.random();
      colors[i * 3]     = 0.4 + 0.6 * (1 - t);   // R
      colors[i * 3 + 1] = 0.7 + 0.3 * (1 - t);   // G
      colors[i * 3 + 2] = 1.0;                     // B
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    this._angles = angles;
    this._positions = positions;
    this._posAttr = geometry.attributes.position;

    const material = new THREE.PointsMaterial({
      size: 3.5,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 1.0,
    });

    this._particles = new THREE.Points(geometry, material);
    this.group.add(this._particles);

    // Outer glow disc
    const glowGeo = new THREE.CircleGeometry(55, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x0088ff,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._glow = new THREE.Mesh(glowGeo, glowMat);
    this._glow.position.z = -1;
    this.group.add(this._glow);

    // Core bright sphere
    const coreGeo = new THREE.SphereGeometry(14, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._core = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this._core);

    this._t = 0;
    this._power = 0;
    this.group.visible = false;
  }

  /** @param {number} power 0-1 from the gate */
  setPower(power) {
    this._power = power;
    const mat = this._particles.material;
    mat.opacity = Math.min(1, power * 1.4);
    this._glow.material.opacity  = 0.18 * power;
    this._core.material.opacity  = 0.55 * power;
  }

  update(dt) {
    if (!this.isActive) return;
    this._t += dt;

    const speed = 2.8;
    const pos = this._posAttr.array;
    for (let i = 0; i < this._angles.length; i++) {
      this._angles[i] += speed * dt * (0.5 + Math.random() * 0.4);
      const r = 25 + 20 * Math.sin(this._t * 1.2 + i * 0.1);
      const phi = Math.acos(Math.sin(this._t * 0.4 + i * 0.05));
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(this._angles[i]);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(this._angles[i]);
      pos[i * 3 + 2] = (Math.sin(this._t * 2 + i * 0.1)) * 15;
    }
    this._posAttr.needsUpdate = true;

    // Pulse glow
    this._glow.material.opacity = 0.18 * this._power + 0.06 * Math.sin(this._t * 8);
    this._core.material.opacity = 0.55 * this._power + 0.1  * Math.sin(this._t * 6);
    this._glow.rotation.z += dt * 0.5;
    this._particles.rotation.z += dt * 0.3;
  }
}
