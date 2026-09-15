import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class ParticleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    
    // Orthographic camera for 2D overlay mapping
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      -window.innerWidth / 2, window.innerWidth / 2,
      window.innerHeight / 2, -window.innerHeight / 2,
      0.1, 1000
    );
    this.camera.position.z = 100;

    this.effects = [];
    this.clock = new THREE.Clock();

    window.addEventListener('resize', this.onWindowResize.bind(this), false);
  }

  onWindowResize() {
    this.camera.left = -window.innerWidth / 2;
    this.camera.right = window.innerWidth / 2;
    this.camera.top = window.innerHeight / 2;
    this.camera.bottom = -window.innerHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  addEffect(effect) {
    this.scene.add(effect.group);
    this.effects.push(effect);
  }

  removeEffect(effect) {
    this.scene.remove(effect.group);
    this.effects = this.effects.filter(e => e !== effect);
  }

  render() {
    const dt = this.clock.getDelta();
    this.effects.forEach(effect => effect.update(dt));
    this.renderer.render(this.scene, this.camera);
  }
}

export class ParticleEffect {
  constructor() {
    this.group = new THREE.Group();
    this.isActive = false;
  }
  
  // To be overridden
  update(dt) {}
  
  activate(x, y) {
    this.isActive = true;
    this.setPosition(x, y);
    this.group.visible = true;
  }

  deactivate() {
    this.isActive = false;
    this.group.visible = false;
  }

  setPosition(x, y) {
    // Map screen coordinates (x, y) from top-left origin 
    // to Three.js Orthographic center origin
    const mappedX = x - window.innerWidth / 2;
    const mappedY = -(y - window.innerHeight / 2);
    this.group.position.set(mappedX, mappedY, 0);
  }
}
