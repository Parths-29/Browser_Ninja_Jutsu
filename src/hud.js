/**
 * hud.js
 *
 * Manages all on-screen HUD overlays:
 *   - Chakra meter (depletes on use, refills over time)
 *   - Active jutsu flash label
 *   - Combo progress indicator
 *   - FPS / MediaPipe latency readout (toggle F key)
 */
export class HUD {
  constructor(container) {
    this.chakra    = 1.0;   // 0.0 - 1.0
    this.maxChakra = 1.0;
    this._locked   = false;  // true when chakra hits 0

    this._drainRate  = 0.25;  // per second per active effect
    this._refillRate = 0.08;  // per second when idle

    this._fpsVisible   = false;
    this._frameCount   = 0;
    this._lastFpsTime  = performance.now();
    this._currentFps   = 0;
    this._inferenceMs  = 0;

    this._build(container);
    this._bindKeys();
  }

  _build(container) {
    // ── Chakra meter ─────────────────────────────────────────────
    const meter = document.createElement('div');
    meter.id = 'chakra-meter';
    meter.innerHTML = `
      <div class="chakra-label">CHAKRA</div>
      <div class="chakra-track">
        <div id="chakra-fill" class="chakra-fill"></div>
      </div>
    `;
    container.appendChild(meter);
    this._fill = document.getElementById('chakra-fill');

    // ── Jutsu name flash ─────────────────────────────────────────
    const flash = document.createElement('div');
    flash.id = 'jutsu-flash';
    container.appendChild(flash);
    this._flash = flash;
    this._flashTimer = null;

    // ── Combo progress ───────────────────────────────────────────
    const comboProg = document.createElement('div');
    comboProg.id = 'combo-progress';
    container.appendChild(comboProg);
    this._comboProg = comboProg;

    // ── FPS overlay ───────────────────────────────────────────────
    const fps = document.createElement('div');
    fps.id = 'fps-overlay';
    fps.style.display = 'none';
    fps.innerHTML = `
      <span id="fps-val">-- FPS</span>
      <span id="inf-val">-- ms</span>
      <span id="gesture-val">--</span>
    `;
    container.appendChild(fps);
    this._fpsEl     = fps;
    this._fpsVal    = document.getElementById('fps-val');
    this._infVal    = document.getElementById('inf-val');
    this._gestureEl = document.getElementById('gesture-val');
  }

  _bindKeys() {
    window.addEventListener('keydown', e => {
      if (e.key === 'f' || e.key === 'F') this.toggleFPS();
    });
  }

  toggleFPS() {
    this._fpsVisible = !this._fpsVisible;
    this._fpsEl.style.display = this._fpsVisible ? 'flex' : 'none';
  }

  /**
   * Called every render frame.
   * @param {number} dt - Delta time in seconds
   * @param {number} activeEffectCount - How many effects are currently on
   */
  tick(dt, activeEffectCount) {
    const now = performance.now();

    // ── FPS counter ───────────────────────────────────────────────
    this._frameCount++;
    const elapsed = now - this._lastFpsTime;
    if (elapsed >= 500) {
      this._currentFps = Math.round(this._frameCount / (elapsed / 1000));
      this._frameCount = 0;
      this._lastFpsTime = now;
      if (this._fpsVisible) {
        this._fpsVal.textContent = `${this._currentFps} FPS`;
        this._infVal.textContent = `${this._inferenceMs.toFixed(0)} ms`;
      }
    }

    // ── Chakra drain / refill ─────────────────────────────────────
    if (activeEffectCount > 0) {
      this.chakra = Math.max(0, this.chakra - this._drainRate * activeEffectCount * dt);
    } else {
      this.chakra = Math.min(this.maxChakra, this.chakra + this._refillRate * dt);
    }

    // Unlock when chakra recovers to 20%
    if (this._locked && this.chakra >= 0.20) {
      this._locked = false;
    }
    if (!this._locked && this.chakra <= 0) {
      this._locked = true;
    }

    // Update fill bar
    const pct = (this.chakra * 100).toFixed(1);
    this._fill.style.height = `${pct}%`;
    this._fill.style.background = this.chakra > 0.4
      ? `linear-gradient(to top, #00ffe0, #00bfff)`
      : this.chakra > 0.15
        ? `linear-gradient(to top, #ffcc00, #ff8800)`
        : `linear-gradient(to top, #ff2200, #ff6600)`;
  }

  /** Returns true if chakra is depleted (effects should suppress). */
  isDrained() {
    return this._locked;
  }

  /** Flash a jutsu name on screen. */
  showJutsuName(name) {
    this._flash.textContent = name;
    this._flash.classList.remove('fade-in');
    void this._flash.offsetWidth; // reflow
    this._flash.classList.add('fade-in');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this._flash.classList.remove('fade-in');
    }, 2000);
  }

  /**
   * Update combo progress display.
   * @param {Array} buffer - Current gesture buffer
   * @param {{ combo: object, progress: number }|null} partial
   */
  updateComboProgress(buffer, partial) {
    if (!partial || partial.progress < 1) {
      this._comboProg.innerHTML = '';
      return;
    }
    const { combo, progress } = partial;
    const steps = combo.sequence.map((s, i) => {
      const done = i < progress;
      return `<span class="combo-step ${done ? 'done' : ''}">${gestureEmoji(s)}</span>`;
    }).join('<span class="combo-arrow">→</span>');
    this._comboProg.innerHTML = steps;
  }

  /** Update FPS panel with latest active gesture name. */
  setActiveGesture(name) {
    if (this._fpsVisible && this._gestureEl) {
      this._gestureEl.textContent = name || '--';
    }
  }

  /** Report MediaPipe inference time. */
  setInferenceMs(ms) {
    this._inferenceMs = ms;
  }
}

function gestureEmoji(g) {
  const map = {
    open_palm: '🖐', fist: '✊', peace: '✌', point: '☝', rock: '🤘',
  };
  return map[g] || g;
}
