/**
 * combo-system.js
 *
 * Generalized combo sequence engine.
 * Tracks a rolling buffer of recent gesture activations and fires a callback
 * when a defined sequence is completed within its timeout window.
 *
 * Each combo definition:
 *   { id, sequence: string[], timeoutMs: number, effect: string, label: string }
 *
 * A "gesture activation" is the name of the gesture that just fired, from
 * either hand. The combo system is hand-agnostic by default, but you can
 * prefix with 'L:' or 'R:' to make it hand-specific.
 */
export class ComboSystem {
  constructor() {
    /**
     * @type {Array<{id:string, sequence:string[], timeoutMs:number, effect:string, label:string}>}
     */
    this.combos = [
      // ── Combo 1: Fist → Peace → Open Palm = Massive Fireball ──────────────
      {
        id:        'mega_fireball',
        sequence:  ['fist', 'peace', 'open_palm'],
        timeoutMs: 3000,
        effect:    'mega_fireball',
        label:     '🔥 Fire Style: Great Fireball Jutsu!',
      },
      // ── Combo 2: Point → Point → Fist = Rasengan Barrage ─────────────────
      {
        id:        'rasengan_barrage',
        sequence:  ['point', 'point', 'fist'],
        timeoutMs: 2500,
        effect:    'rasengan_barrage',
        label:     '🌀 Rasengan Barrage!',
      },
      // ── Combo 3: Rock → Fist → Open Palm = Susano'o Aura ─────────────────
      {
        id:        'susanoo',
        sequence:  ['rock', 'fist', 'open_palm'],
        timeoutMs: 3000,
        effect:    'susanoo',
        label:     '⚡ Susano\'o!',
      },
      // ── Combo 4: Peace → Rock → Peace = Shadow Clone ─────────────────────
      // (alt trigger for shadow clone separate from TF.js model)
      {
        id:        'shadow_clone_combo',
        sequence:  ['peace', 'rock', 'peace'],
        timeoutMs: 3500,
        effect:    'shadow_clone',
        label:     '👥 Shadow Clone Jutsu!',
      },
      // ── Silhouette-driven combos ──────────────────────────────────────
      {
        id:        'chakra_cloak',
        sequence:  ['fist', 'fist', 'fist'],
        timeoutMs: 3000,
        silhouette: 'triggerChakraCloak',
        label:     '🦊 Nine-Tails Chakra Mode!',
      },
      {
        id:        'kawarimi',
        sequence:  ['peace', 'peace'],
        timeoutMs: 3000,
        silhouette: 'triggerKawarimi',
        label:     '🪵 Substitution Jutsu!',
      },
      {
        id:        'clone_swarm',
        sequence:  ['rock', 'rock', 'fist'],
        timeoutMs: 3000,
        silhouette: 'triggerCloneSwarm',
        label:     '👥 Shadow Clone Barrage!',
      },
    ];

    /**
     * Rolling buffer: [ { gesture, timestamp }, … ]
     */
    this._buffer = [];

    /**
     * Called when a combo completes.
     * @type {(combo: object) => void}
     */
    this.onCombo = () => {};

    /**
     * Called whenever the buffer changes (for HUD progress display).
     * @type {(buffer: Array, partialCombo: object|null) => void}
     */
    this.onProgress = () => {};
  }

  /**
   * Call this whenever a new gesture activates (from either hand).
   * @param {string} gesture - Gesture name (e.g. 'open_palm')
   * @param {number} timestamp - performance.now()
   */
  push(gesture, timestamp) {
    this._buffer.push({ gesture, timestamp });

    // Prune entries older than the longest combo timeout
    const maxTimeout = Math.max(...this.combos.map(c => c.timeoutMs));
    this._buffer = this._buffer.filter(e => timestamp - e.timestamp <= maxTimeout);

    // Check for combo matches
    const matched = this._checkCombos(timestamp);
    if (matched) {
      this._buffer = [];  // clear buffer after combo fires
      this.onCombo(matched);
      this.onProgress([], null);
    } else {
      const partial = this._getBestPartial();
      this.onProgress([...this._buffer], partial);
    }
  }

  /**
   * Check if the buffer tail matches any defined combo sequence.
   */
  _checkCombos(timestamp) {
    for (const combo of this.combos) {
      const seq = combo.sequence;
      const len = seq.length;

      if (this._buffer.length < len) continue;

      // Check last `len` entries
      const tail = this._buffer.slice(-len);

      // Verify time window
      const firstTs = tail[0].timestamp;
      if (timestamp - firstTs > combo.timeoutMs) continue;

      // Verify sequence
      const matches = tail.every((entry, i) => entry.gesture === seq[i]);
      if (matches) return combo;
    }
    return null;
  }

  /**
   * Find which combo we're partially through (for HUD progress).
   * Returns the combo definition + how many steps are matched so far.
   */
  _getBestPartial() {
    let best = null;
    let bestProgress = 0;

    for (const combo of this.combos) {
      const seq = combo.sequence;
      // Walk backward through buffer trying to match prefix of sequence
      let matched = 0;
      for (let i = 0; i < Math.min(this._buffer.length, seq.length); i++) {
        const bufEntry = this._buffer[this._buffer.length - (i + 1)];
        const seqStep  = seq[seq.length - 1 - i];
        if (bufEntry.gesture === seqStep) {
          matched++;
        } else {
          break;
        }
      }
      if (matched > bestProgress) {
        bestProgress = matched;
        best = { combo, progress: matched };
      }
    }
    return best;
  }

  /** Clear the buffer (e.g. on page load or after a long pause). */
  reset() {
    this._buffer = [];
    this.onProgress([], null);
  }
}
