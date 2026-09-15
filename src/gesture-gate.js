/**
 * gesture-gate.js
 * 
 * Provides hold-duration (debounce) and cooldown logic for gesture events.
 * Prevents rapid flickering when the camera/model oscillates between states
 * over a few frames.
 */

export class GestureGate {
  /**
   * @param {Object} options
   * @param {number} options.holdMs - Milliseconds a gesture must be held before activating
   * @param {number} options.cooldownMs - Milliseconds before a gesture can re-activate after deactivating
   */
  constructor(options = {}) {
    this.holdMs = options.holdMs ?? 200;
    this.cooldownMs = options.cooldownMs ?? 300;

    // Track state per gesture: 
    // { state: 'idle'|'holding'|'active'|'cooldown', startTime: number, deactivateTime: number }
    this.gestures = new Map();

    this.onActivate = (gestureName) => {};
    this.onDeactivate = (gestureName) => {};
  }

  /**
   * Update the state of a specific gesture based on the current frame's classification.
   * 
   * @param {string} gestureName - Name of the gesture (e.g. 'open_palm')
   * @param {boolean} isDetected - Whether the classifier detected it this frame
   * @param {number} timestamp - Current timestamp (e.g. performance.now())
   * @returns {boolean} True if the gesture is currently 'active'
   */
  update(gestureName, isDetected, timestamp) {
    if (!this.gestures.has(gestureName)) {
      this.gestures.set(gestureName, {
        state: 'idle',
        startTime: 0,
        deactivateTime: 0
      });
    }

    const entry = this.gestures.get(gestureName);

    switch (entry.state) {
      case 'idle':
        if (isDetected) {
          entry.state = 'holding';
          entry.startTime = timestamp;
        }
        break;

      case 'holding':
        if (isDetected) {
          if (timestamp - entry.startTime >= this.holdMs) {
            entry.state = 'active';
            this.onActivate(gestureName);
          }
        } else {
          entry.state = 'idle';
        }
        break;

      case 'active':
        if (!isDetected) {
          entry.state = 'cooldown';
          entry.deactivateTime = timestamp;
          this.onDeactivate(gestureName);
        }
        break;

      case 'cooldown':
        if (timestamp - entry.deactivateTime >= this.cooldownMs) {
          entry.state = 'idle';
        }
        // If detected during cooldown, we ignore it until cooldown finishes,
        // then it will flip to 'holding' on the next frame.
        break;
    }

    return entry.state === 'active';
  }

  /**
   * Forcibly deactivate a gesture (e.g. when Chakra runs out).
   */
  forceDeactivate(gestureName, timestamp) {
    const entry = this.gestures.get(gestureName);
    if (entry && entry.state === 'active') {
      entry.state = 'cooldown';
      entry.deactivateTime = timestamp;
      this.onDeactivate(gestureName);
    }
  }
}
