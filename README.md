# 🍥 Browser Ninja Jutsu

Real-time ninja powers in your browser — powered by hand tracking, Three.js particle effects, and gesture recognition.

> Built by **Parth** · [github.com/Parths-29/Browser_Ninja_Jutsu](https://github.com/Parths-29/Browser_Ninja_Jutsu)

---

## ✨ Features

### 🔮 Ninja Jutsu v2 *(main app — start here)*

Five distinct hand poses mapped to live particle effects:

| Pose | Gesture | Effect |
|------|---------|--------|
| 🖐 Open Palm | ≥4 fingers extended | **Rasengan** (left) / **Chidori** (right) |
| ✊ Fist | All fingers curled | **Chakra Shield** aura |
| ✌ Peace / Victory | Index + Middle up | **Fire Release** |
| ☝ Point | Index only | **Chakra Beam** |
| 🤘 Rock / Horns | Index + Pinky up | Combo input |

**Combo sequences** — perform gestures in order to trigger rarer effects:

| Sequence | Combo |
|----------|-------|
| Fist → Peace → Open Palm | 🔥 Fire Style: Great Fireball Jutsu |
| Point → Point → Fist | 🌀 Rasengan Barrage |
| Rock → Fist → Open Palm | ⚡ Susano'o |
| Peace → Rock → Peace | 👥 Shadow Clone Jutsu (alt trigger) |

---

## 🛠 Technical Architecture

```
src/
├── landmark-filter.js      One Euro Filter — removes MediaPipe jitter
├── gesture-gate.js         Hold-duration gating (200ms hold, 300ms cooldown)
├── finger-pose.js          Geometric 5-pose classifier (no ML, pure geometry)
├── combo-system.js         Rolling gesture buffer + combo matching engine
├── hud.js                  Chakra meter, jutsu flash, FPS overlay (F key)
├── detection-pipeline.js   Core orchestrator (MediaPipe → smooth → classify → effect)
├── app.js                  Entry point — bootstraps all subsystems
└── effects/
    ├── particle-engine.js  Three.js WebGL overlay renderer
    ├── rasengan.js         700-particle blue spiral orb
    ├── chidori.js          Crackling lightning bolts + 400 sparks
    ├── fireball.js         500-particle fire burst with ember drift
    ├── shield.js           Rotating hexagonal barrier ring
    └── combo-effects.js    ChakraBeam + Susano'o aura
```

### Stack
- **MediaPipe Holistic** — hand + pose landmark detection
- **Three.js** (via CDN) — WebGL particle effects with additive blending
- **TensorFlow.js** — binary classifier for the Shadow Clone hand sign
- **Zero build step** — pure CDN ES modules, serve with any HTTP server

### Performance design
- MediaPipe inference rate-limited to ~30 fps; rAF renders particles at display Hz
- `SelfieSegmentation` is lazy — only spun up when Shadow Clone combo fires, torn down 8 s after
- One Euro Filter on all 63 landmark coordinates per hand (adaptive: low jitter at rest, responsive during fast motion)
- FPS + inference latency readout: press **F** to toggle

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/Parths-29/Browser_Ninja_Jutsu.git
cd Browser_Ninja_Jutsu

# Serve (any static server works)
python3 -m http.server 8080
# or: npx serve -p 8080
```

Open **http://localhost:8080** → click **"Ninja Jutsu v2"**

> **Requirements:** Chrome (recommended) · Webcam · Good lighting

---

## 🎮 Controls

| Action | Result |
|--------|--------|
| Open left hand | Rasengan |
| Open right hand | Chidori |
| Fist (either hand) | Chakra Shield |
| Peace sign | Fire Release |
| Point (one finger) | Chakra Beam |
| Combo sequences | Mega effects (see table above) |
| **F key** | Toggle FPS / latency overlay |
| Trained hand sign (both hands) | Shadow Clone Jutsu |

---

## 🎓 Training Your Own Shadow Clone Sign

The repo ships with a pre-trained binary classifier. To train your own:

1. Open `http://localhost:8080/trainer.html`
2. Press **1** to record your hand sign (both hands visible)
3. Press **2** to record negative poses
4. Click **Train Model** → **Save Model**
5. Replace `gesture-model.json` + `gesture-model.weights.bin`

---

## 📁 Structure

```
Browser_Ninja_Jutsu/
├── index.html                  Landing page
├── app.html                    Ninja Jutsu v2 (main unified app)
├── app.css                     App styles + HUD
├── src/                        All v2 modules (see above)
├── ninja-powers.html           Original Rasengan + Chidori (kept)
├── shadow-clone.html           Original Shadow Clone (kept)
├── naruto-combined.html        Original combined view (kept)
├── trainer.html / trainer.js   Gesture model trainer
├── gesture-model.json          Pre-trained shadow clone model
└── assets/                     Video effects + smoke sprites
```

---

*Believe it! 🍜*
