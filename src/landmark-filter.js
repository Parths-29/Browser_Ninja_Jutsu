/**
 * landmark-filter.js
 * 
 * One Euro Filter for MediaPipe hand landmarks.
 * Reduces jitter on static/slow hand poses while preserving responsiveness
 * during fast motion. Each landmark axis (x, y, z) gets its own filter.
 *
 * Reference: Casiez et al., "1€ Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Interactive Systems", CHI 2012.
 */

class LowPassFilter {
  constructor(alpha) {
    this._alpha = alpha;
    this._prev = null;
    this._initialized = false;
  }

  filter(value, alpha) {
    if (alpha !== undefined) this._alpha = alpha;

    if (!this._initialized) {
      this._prev = value;
      this._initialized = true;
      return value;
    }

    const result = this._alpha * value + (1 - this._alpha) * this._prev;
    this._prev = result;
    return result;
  }

  reset() {
    this._initialized = false;
    this._prev = null;
  }

  get lastValue() {
    return this._prev;
  }
}

class OneEuroFilter {
  /**
   * @param {number} freq      - Expected update frequency (Hz)
   * @param {number} minCutoff - Minimum cutoff frequency (lower = more smoothing)
   * @param {number} beta      - Speed coefficient (higher = less lag during fast motion)
   * @param {number} dCutoff   - Cutoff for derivative filter
   */
  constructor(freq = 30, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this._freq = freq;
    this._minCutoff = minCutoff;
    this._beta = beta;
    this._dCutoff = dCutoff;

    this._xFilter = new LowPassFilter(this._alpha(this._minCutoff));
    this._dxFilter = new LowPassFilter(this._alpha(this._dCutoff));

    this._lastTime = null;
  }

  _alpha(cutoff) {
    const te = 1.0 / this._freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  /**
   * @param {number} value     - Raw input value
   * @param {number} timestamp - Time in seconds (monotonic)
   * @returns {number} Filtered value
   */
  filter(value, timestamp) {
    if (this._lastTime !== null && timestamp > this._lastTime) {
      this._freq = 1.0 / (timestamp - this._lastTime);
    }
    this._lastTime = timestamp;

    // Estimate derivative
    const prevValue = this._xFilter.lastValue !== null ? this._xFilter.lastValue : value;
    const dx = (value - prevValue) * this._freq;
    const edx = this._dxFilter.filter(dx, this._alpha(this._dCutoff));

    // Adaptive cutoff based on speed
    const cutoff = this._minCutoff + this._beta * Math.abs(edx);

    return this._xFilter.filter(value, this._alpha(cutoff));
  }

  reset() {
    this._xFilter.reset();
    this._dxFilter.reset();
    this._lastTime = null;
  }
}

// ---------------------------------------------------------------------------
// LandmarkSmoother — wraps 21 landmarks × 3 axes per hand
// ---------------------------------------------------------------------------

const LANDMARK_COUNT = 21;
const AXES = ['x', 'y', 'z'];

export class LandmarkSmoother {
  /**
   * @param {object} opts
   * @param {number} opts.freq       - Expected Hz (default 30)
   * @param {number} opts.minCutoff  - Min cutoff (default 1.0)
   * @param {number} opts.beta       - Speed coefficient (default 0.007)
   * @param {number} opts.dCutoff    - Derivative cutoff (default 1.0)
   */
  constructor(opts = {}) {
    this._opts = {
      freq: opts.freq ?? 30,
      minCutoff: opts.minCutoff ?? 1.0,
      beta: opts.beta ?? 0.007,
      dCutoff: opts.dCutoff ?? 1.0,
    };

    // Per-hand filter banks keyed by hand label ('Left' / 'Right')
    this._banks = {};
  }

  _getBank(handLabel) {
    if (!this._banks[handLabel]) {
      const bank = [];
      for (let i = 0; i < LANDMARK_COUNT; i++) {
        const axisFilters = {};
        for (const axis of AXES) {
          axisFilters[axis] = new OneEuroFilter(
            this._opts.freq,
            this._opts.minCutoff,
            this._opts.beta,
            this._opts.dCutoff
          );
        }
        bank.push(axisFilters);
      }
      this._banks[handLabel] = bank;
    }
    return this._banks[handLabel];
  }

  /**
   * Filter a single hand's landmarks.
   *
   * @param {Array<{x:number, y:number, z:number}>} landmarks - Raw 21-point array
   * @param {string} handLabel - 'Left' or 'Right'
   * @param {number} timestamp - performance.now() / 1000 (seconds)
   * @returns {Array<{x:number, y:number, z:number}>} Smoothed landmarks (new array)
   */
  filter(landmarks, handLabel, timestamp) {
    if (!landmarks || landmarks.length < LANDMARK_COUNT) return landmarks;

    const bank = this._getBank(handLabel);
    const smoothed = [];

    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const pt = landmarks[i];
      smoothed.push({
        x: bank[i].x.filter(pt.x, timestamp),
        y: bank[i].y.filter(pt.y, timestamp),
        z: bank[i].z.filter(pt.z, timestamp),
      });
    }

    return smoothed;
  }

  /**
   * Reset filters for a hand (call when hand tracking is lost).
   * @param {string} handLabel - 'Left' or 'Right'
   */
  reset(handLabel) {
    if (this._banks[handLabel]) {
      for (const axisFilters of this._banks[handLabel]) {
        for (const axis of AXES) {
          axisFilters[axis].reset();
        }
      }
    }
  }

  /** Reset all filter banks. */
  resetAll() {
    for (const label of Object.keys(this._banks)) {
      this.reset(label);
    }
  }
}

export default LandmarkSmoother;
