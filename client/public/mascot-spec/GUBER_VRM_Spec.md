# GUBER Mascot — VRM Production Specification
**Version 1.0 | For 3D Artist Handoff**

---

## 1. Character Identity

| Property | Value |
|---|---|
| Species | Anthropomorphic badger (Honey Badger silhouette) |
| Style | 3D cartoon / toy-grade soft surface |
| Height | ~1.4 m (short & stocky, head ≈ 45% of total height) |
| Primary colors | Black `#1A1A1A`, White `#FFFFFF`, Purple `#6A00FF` / `#A020F0`, Neon green `#39FF14` |
| Accessories | GUBER shield badge (chest), purple cape, smartphone prop |

---

## 2. Topology Requirements

| Area | Target Tri Count |
|---|---|
| Full body (LOD 0) | 25 000 – 35 000 tris |
| Head (isolated) | 8 000 – 12 000 tris |
| Body / limbs | 10 000 – 14 000 tris |
| Accessories (cape, shield, phone) | 3 000 – 5 000 tris |
| Texture resolution | 2048 × 2048 px (separate maps per UV island group) |

Topology rules:
- Clean edge loops around eyes, mouth, nose for deformation
- No poles > 5 edges at expression vertices
- Merge vertices to < 0.001 tolerance before VRM export
- All geometry manifold (no open edges, no duplicate faces)

---

## 3. UV & Texture Maps

| Map | Format | Notes |
|---|---|---|
| Albedo | PNG, sRGB | No baked lighting/shadows |
| Metallic/Roughness | PNG, linear | R=metallic, G=roughness (glTF packed) |
| Normal | PNG, linear, OpenGL Y-up | For fur surface detail |
| Emission | PNG, sRGB | Cape trim neon green glow, shield "G" glow |

Fur: use a tileable fur alpha card overlay on the body mesh (not strand-based — VRM/VSeeFace does not support strand hair).

---

## 4. Skeleton / Bone Hierarchy (VRM 1.0 Required Bones)

```
Root
└── Hips
    ├── Spine
    │   └── Chest
    │       └── UpperChest
    │           ├── Neck
    │           │   └── Head
    │           │       ├── LeftEye          ← VRM required for eye tracking
    │           │       └── RightEye         ← VRM required for eye tracking
    │           ├── LeftShoulder
    │           │   └── LeftUpperArm
    │           │       └── LeftLowerArm
    │           │           └── LeftHand
    │           │               ├── LeftThumbProximal → Intermediate → Distal
    │           │               ├── LeftIndexProximal → Intermediate → Distal
    │           │               ├── LeftMiddleProximal → Intermediate → Distal
    │           │               ├── LeftRingProximal → Intermediate → Distal
    │           │               └── LeftLittleProximal → Intermediate → Distal
    │           └── RightShoulder
    │               └── RightUpperArm
    │                   └── RightLowerArm
    │                       └── RightHand
    │                           └── (mirror of left fingers)
    ├── LeftUpperLeg
    │   └── LeftLowerLeg
    │       └── LeftFoot
    │           └── LeftToes
    └── RightUpperLeg
        └── RightLowerLeg
            └── RightFoot
                └── RightToes

── Additional custom bones (non-VRM, SpringBone targets) ──
Head
├── CapeLeft_01 → CapeLeft_02 → CapeLeft_03
├── CapeRight_01 → CapeRight_02 → CapeRight_03
├── EarLeft_01 → EarLeft_02
├── EarRight_01 → EarRight_02
└── TailRoot_01 → TailRoot_02 → TailTip (if tail is modeled)

Chest (attached to UpperChest)
└── ShieldBadge (non-deforming, parented rigid)

RightHand
└── Phone_Prop (non-deforming, parented rigid — toggle visibility per pose)
```

---

## 5. Blend Shapes (VRM Expression Presets + Custom)

### 5.1 Required VRM Preset Expressions

| VRM Preset Name | Description | Driven Morph Targets |
|---|---|---|
| `happy` | Squinting smile | BrowDown_L/R, CheekSquint_L/R, MouthSmile_L/R, EyeSquintL/R |
| `angry` | Brow furrow, frown | BrowInnerUp, BrowDown_L/R, MouthFrown_L/R |
| `sad` | Drooping brows, downturned mouth | BrowInnerUp, MouthFrown_L/R, EyeWideL/R |
| `relaxed` | Neutral soft | All morph targets at 0 |
| `surprised` | Wide eyes, open mouth, raised brows | EyeWideL/R, BrowInnerUp, BrowOuterUp_L/R, JawOpen |
| `blink` | Both eyes fully closed | EyeBlinkL, EyeBlinkR |
| `blinkLeft` | Left eye only | EyeBlinkL |
| `blinkRight` | Right eye only | EyeBlinkR |
| `lookUp` | Eyes tilt up | EyeLookUpL/R |
| `lookDown` | Eyes tilt down | EyeLookDownL/R |
| `lookLeft` | Eyes shift left | EyeLookOutL, EyeLookInR |
| `lookRight` | Eyes shift right | EyeLookInL, EyeLookOutR |

### 5.2 Custom Expressions (GUBER-specific)

| Custom Name | Description | VSeeFace hotkey |
|---|---|---|
| `talking_A` | Mouth open — "Ah" vowel | Auto-driven by lip sync |
| `talking_I` | Mouth spread — "Ee" vowel | Auto-driven by lip sync |
| `talking_U` | Lips pursed — "Oo" vowel | Auto-driven by lip sync |
| `talking_E` | Mouth half-open — "Eh" vowel | Auto-driven by lip sync |
| `talking_O` | Mouth round — "Oh" vowel | Auto-driven by lip sync |
| `smileWide` | Full beaming smile | Hotkey F5 |
| `excited` | Raised brows + wide smile + slight JawOpen | Hotkey F6 |
| `thinking` | One brow up, mouth slight tilt, eyes cast left | Hotkey F7 |
| `confident` | Neutral brows, closed-mouth half-smile | Hotkey F8 |
| `wink_L` | Left eye wink | Hotkey F9 |
| `wink_R` | Right eye wink | Hotkey F10 |
| `noseWrinkle` | Scrunch nose | Composited in `angry` |

### 5.3 Morph Target Mesh Targets

All blend shapes must be on the **Head mesh** (separate head mesh from body recommended for VRM).

Body-level deformations (cape puff, chest raise for "excited") go on the **Body mesh** under the same expression via multi-mesh expressions.

---

## 6. Spring Bone Configuration (VRM 1.0 SpringBone)

| Chain | Stiffness | Gravity | DragForce | Radius |
|---|---|---|---|---|
| CapeLeft_01–03 | 0.08 | 0.05 downward | 0.55 | 0.04 |
| CapeRight_01–03 | 0.08 | 0.05 downward | 0.55 | 0.04 |
| EarLeft_01–02 | 0.35 | 0.02 | 0.45 | 0.025 |
| EarRight_01–02 | 0.35 | 0.02 | 0.45 | 0.025 |
| TailRoot_01–TailTip | 0.12 | 0.06 | 0.5 | 0.03 |

Colliders: add sphere colliders on Head, Chest, UpperArms to prevent cape clipping.

---

## 7. VSeeFace Webcam Tracking Setup

### 7.1 Recommended VRM Meta (fill in VRM exporter)

```
Title:          GUBER Mascot
Author:         GUBER / guberapp.app
ContactInformation: https://guberapp.app
AllowedUser:    OnlyAuthor
ViolentUsage:   Disallow
SexualUsage:    Disallow
CommercialUsage: Allow
LicenseType:    CC_BY_NC
```

### 7.2 VSeeFace Configuration File Excerpt (`settings.ini` override)

```ini
[BlendshapeMapping]
# Map VSeeFace internal names → VRM custom expression names
AA=talking_A
EE=talking_I
OH=talking_O
IH=talking_E
UU=talking_U
Blink_L=blinkLeft
Blink_R=blinkRight
LookUp=lookUp
LookDown=lookDown
LookLeft=lookLeft
LookRight=lookRight

[HeadTracking]
HeadSmoothing=0.05
EyeSmoothing=0.03
BlinkThreshold=0.35
BlinkSmoothing=3.0

[ExpressionTriggers]
; Webcam-detected expressions mapped to custom presets
SmileDetect=smileWide
MouthOpenDetect=talking_A
BrowRaiseDetect=excited
```

### 7.3 Eye Rig Notes for VSeeFace

- `LeftEye` and `RightEye` bones must be set to **VRM LookAt BoneApply** mode
- Rotation range: ±25° horizontal, ±15° vertical
- Eye mesh should be a separate mesh or isolated island — do NOT deform with blend shapes (use bone rotation only for tracking)
- Eyelid closure: blend shape `EyeBlinkL/R` should close the lid mesh, not rotate the eye bone

---

## 8. Turnaround Sheet Specification

Generate reference renders at these exact camera angles with orthographic projection, neutral lighting (3-point: key at 45° left, fill at 30° right, rim behind):

| View | Euler Y rotation | Notes |
|---|---|---|
| Front | 0° | Arms relaxed at sides, hold phone in right hand optional |
| Front-Left 3/4 | 45° | Show shield badge clearly |
| Left Side | 90° | Show cape length and ear profile |
| Back-Left 3/4 | 135° | Show cape "G" emblem |
| Back | 180° | Full cape back view |
| Back-Right 3/4 | 225° | |
| Right Side | 270° | Mirror of left |
| Top-down | Pitch 90° | Show ear and cape spread layout |

Expression sheet (all at front view, head only, white background):
`neutral` / `happy` / `excited` / `thinking` / `surprised` / `confident` / `talking_A` / `talking_O` / `blink` / `wink_L`

---

## 9. Blender Workflow Checklist

- [ ] Model in Blender 4.x
- [ ] Install VRM Add-on: https://github.com/saturday06/VRM-Addon-for-Blender (v2.x for VRM 1.0)
- [ ] Set up armature using exact VRM bone names above
- [ ] Weight paint — use automatic weights then manually correct face/hands
- [ ] Create all blend shapes on Shape Key panel
- [ ] Configure SpringBone chains via VRM add-on panel
- [ ] Set VRM Expression presets in the add-on's Expression tab
- [ ] Fill VRM Meta fields (section 7.1)
- [ ] Validate with VRM add-on's built-in validator (0 errors required)
- [ ] Export: File → Export → VRM 1.0 (`.vrm`)
- [ ] Test in VSeeFace: drag `.vrm` into avatar loader

---

## 10. Color Reference (exact hex → Blender sRGB)

| Surface | Hex | Blender Linear RGB |
|---|---|---|
| Body fur (black) | `#1A1A1A` | 0.010, 0.010, 0.010 |
| Face/belly fur (white) | `#FFFFFF` | 1.0, 1.0, 1.0 |
| Facial stripe accent | `#C8C8C8` | 0.585, 0.585, 0.585 |
| Cape / shield base | `#6A00FF` | 0.163, 0.0, 1.0 |
| Cape highlight | `#A020F0` | 0.376, 0.016, 0.878 |
| Neon trim / glow | `#39FF14` | 0.048, 1.0, 0.005 |
| Shield "G" text | `#FFFFFF` | 1.0, 1.0, 1.0 |
| Nose | `#1A1A1A` | 0.010, 0.010, 0.010 |
| Eye whites | `#F5F5F5` | 0.956, 0.956, 0.956 |
| Eye pupils | `#0D0D0D` | 0.003, 0.003, 0.003 |
| Eye iris accent | `#6A00FF` | 0.163, 0.0, 1.0 |
| Claw tips | `#2B2B2B` | 0.028, 0.028, 0.028 |

---

## 11. File Deliverable List (from 3D Artist)

```
GUBER_VRM_v1/
├── GUBER_mascot.vrm              ← Final export (VRM 1.0)
├── GUBER_mascot.blend            ← Source file (Blender 4.x)
├── textures/
│   ├── body_albedo.png           (2048×2048)
│   ├── body_metallic_roughness.png
│   ├── body_normal.png
│   ├── head_albedo.png           (2048×2048)
│   ├── head_normal.png
│   ├── cape_albedo.png           (1024×1024)
│   ├── cape_emission.png         (1024×1024)
│   ├── shield_albedo.png         (512×512)
│   └── shield_emission.png       (512×512)
├── turnaround/
│   ├── front.png
│   ├── front_left_45.png
│   ├── left_side.png
│   ├── back_left_45.png
│   ├── back.png
│   ├── right_side.png
│   ├── topdown.png
│   └── expressions_sheet.png     (4×3 grid at 512px per cell)
└── GUBER_VRM_Spec.md             ← This document
```
