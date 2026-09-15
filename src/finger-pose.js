/**
 * finger-pose.js
 *
 * Lightweight geometric finger-pose classifier from raw MediaPipe hand landmarks.
 * No external library required — uses angle/extension heuristics.
 *
 * Recognised gestures:
 *  'open_palm'   — ≥4 fingers extended (Rasengan / Chidori)
 *  'fist'        — 0-1 fingers extended (Shield aura)
 *  'peace'       — Index + Middle extended, Ring + Pinky curled (Fire Release)
 *  'point'       — Only Index extended (Chakra Beam)
 *  'rock'        — Index + Pinky extended, Middle + Ring curled (Summoning combo)
 */

// Landmark indices
const TIP  = [4, 8, 12, 16, 20];
const PIP  = [3, 6, 10, 14, 18];  // DIP for thumb, PIP for fingers
const MCP  = [2, 5, 9, 13, 17];

/**
 * Returns true if finger `i` is extended.
 * For fingers 1-4 (index→pinky): tip must be further from wrist than PIP.
 * For thumb (0): tip-x vs MCP-x heuristic (works for mirrored feed).
 */
function isExtended(lm, i) {
  const wrist = lm[0];
  if (i === 0) {
    // Thumb: rough heuristic — x distance tip vs MCP
    return Math.abs(lm[TIP[0]].x - wrist.x) > Math.abs(lm[MCP[0]].x - wrist.x);
  }
  const tipDist = dist(lm[TIP[i]], wrist);
  const pipDist = dist(lm[PIP[i]], wrist);
  return tipDist > pipDist * 1.05;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Classify a single hand's landmarks.
 *
 * @param {Array<{x,y,z}>} lm - 21 MediaPipe landmarks (already smoothed)
 * @returns {{ gesture: string, confidence: number }}
 */
export function classifyPose(lm) {
  if (!lm || lm.length < 21) return { gesture: 'unknown', confidence: 0 };

  const ext = [0, 1, 2, 3, 4].map(i => isExtended(lm, i));
  // ext[0]=thumb, ext[1]=index, ext[2]=middle, ext[3]=ring, ext[4]=pinky
  const count = ext.slice(1).filter(Boolean).length; // fingers only, not thumb

  // ── open_palm ─────────────────────────────────────────────────
  if (count >= 4) {
    return { gesture: 'open_palm', confidence: count === 4 ? 0.85 : 0.95 };
  }

  // ── fist ──────────────────────────────────────────────────────
  if (count === 0) {
    return { gesture: 'fist', confidence: 0.90 };
  }

  // ── peace (index + middle extended, ring + pinky curled) ──────
  if (ext[1] && ext[2] && !ext[3] && !ext[4]) {
    return { gesture: 'peace', confidence: 0.88 };
  }

  // ── point (only index extended) ───────────────────────────────
  if (ext[1] && !ext[2] && !ext[3] && !ext[4]) {
    return { gesture: 'point', confidence: 0.88 };
  }

  // ── rock / horns (index + pinky, middle + ring curled) ────────
  if (ext[1] && !ext[2] && !ext[3] && ext[4]) {
    return { gesture: 'rock', confidence: 0.87 };
  }

  return { gesture: 'unknown', confidence: 0 };
}

/**
 * Map gesture name → which effect key to activate, per hand side.
 * 'Left'/'Right' refers to the label MediaPipe gives (from the camera's POV,
 * so mirrored: user's right hand appears as 'Left' in the API).
 */
export const GESTURE_EFFECT_MAP = {
  Left: {
    open_palm: 'rasengan',
    fist:      'shield',
    peace:     'fireball',
    point:     'chakra_beam',
    rock:      null,  // used only in combos
  },
  Right: {
    open_palm: 'chidori',
    fist:      'shield',
    peace:     'fireball',
    point:     'chakra_beam',
    rock:      null,
  },
};
