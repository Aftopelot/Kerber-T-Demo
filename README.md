# Kerber-T Demo — Three.js Interactive Device

An interactive web demo of the Kerber-T detection device built with **Three.js**, **XState**, **Vite**, and **TypeScript**.

## Architecture

The application follows a strict **State → Scenario → Visual** architecture:

- **State (XState FSM)**: Single source of truth, manages all device states and transitions
- **Scenario Engine**: Controls logical flow, guards, and actions
- **Input Layer**: Translates user interactions into events (never modifies state directly)
- **Visual Layer**: Reacts to state changes only, manages animations, LED effects, screens

## Project Structure

```
src/
├── main.ts                 # Entry point, orchestration
├── types.ts                # All TypeScript definitions
├── config.ts               # Timing, node names, screen asset map, LED config
├── sceneSetup.ts           # THREE.Scene, Camera, Lights, OrbitControls
├── loadAssets.ts           # GLB model + Draco + screen texture loading
├── resolveSceneRefs.ts     # Centralized 3D object reference lookup
├── machine.ts              # XState FSM definition (state, guards, actions)
├── inputController.ts      # Input detection, raycast, click handling, long press
├── visualController.ts     # Animation, LED effects, screen switching, state sync
├── gui.ts                  # lil-gui debug interface
└── styles.css              # Global styles
```

## Quick Start

### Prerequisites

- Node.js 16+
- npm

### Installation & Running

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm preview
```

## GitHub Pages

The project is prepared for GitHub Pages deployment via GitHub Actions.

Deployment flow:

```bash
# 1. Create a GitHub repository and push this project
# 2. Use the main branch as the source branch
# 3. In GitHub: Settings -> Pages -> Build and deployment -> Source = GitHub Actions
```

Notes:

- The workflow automatically sets the correct Vite `base` path for a project page.
- If you publish from a repository named `kerber-t-demo`, the site URL will be:
  `https://<user-or-org>.github.io/kerber-t-demo/`
- Local development is unchanged; `npm run dev` still uses `/` as the base path.

## Key Features

### FSM States

- **PowerOff**: Initial state, mechanical controls only
- **PowerOn** (parallel):
  - `workflow`: ReadyToBoot → Booting → Warmup → ContinuousSearch ↔ SearchWithStop
  - `overlay`: None | ShutdownPrompt

### Mechanical Controls (Always Available)

- **NozzleCover**: Capped ↔ Uncapped (long animation, locks clicks during playback)
- **ModeLatch**: Air ↔ Swab (only when NozzleCover = Uncapped)
- **BatteryClipLower**: Locked ↔ Unlocked
- **BatteryClipUpper**: Locked ↔ Unlocked

### Electronic Controls (PowerOn Required)

- **Rocker**: On/Off switch (Kill Switch: stops power, scenarios, LED, screen)
- **btnStart**: Triggers boot sequence, short press only
- **btnMode**: 
  - Short press: toggles ContinuousSearch ↔ SearchWithStop
  - Long press (2s): toggles Standard ↔ Ionogram screen mode
  - Long press cancels short press on release

### Boot Sequence

```
Boot LED Cycle (3x):
  Alert → SearchWithStop → Maintenance → Continuous
  (fade in 0.2s, fade out 0.8s, total 7s per cycle)
  ↓
Warmup (15s, Maintenance LED blinks 1Hz)
  ↓
ContinuousSearch (Continuous LED blinks 1Hz)
```

### Screen System

Screens are loaded from `/public/screens/` and selected based on:
- Power state (Off/On)
- Workflow state (Boot/Warmup/ContinuousSearch/SearchWithStop)
- Mode latch (Air/Swab)
- Presentation mode (Standard/Ionogram)

**Current format**: PNG (ready to replace with WebP)  
**Screen asset map**: `config.ts` - no hardcoding across codebase

### LED System

- **LED emission intensity**: 0-5 (via material.emissiveIntensity)
- **Fade in/out**: Smooth interpolation via clock-based tweening
- **Blink effects**: 1Hz (0.5s on, 0.5s off) for search modes

### Shutdown Prompt

Temporary overlay state shown when pressing btnStart in Warmup/Search modes:
- **btnMode** releases: Confirms shutdown → ReadyToBoot
- **Any other button**: Cancels overlay, returns to previous screen
- **Rocker (Kill Switch)**: Bypasses overlay, immediate PowerOff

## Debug GUI

**lil-gui** is enabled by default for testing:

- Power on/off
- Mechanical control toggles
- Button release simulation
- Manual workflow state navigation
- Overlay overlay management
- Real-time context display

## Configuration

All static parameters live in `config.ts`:

```typescript
TIMING          // Boot cycles, warmup duration, blink intervals, long press threshold
SCENE_NODE_NAMES    // Expected 3D object names in GLB model
ANIMATION_CLIP_NAMES    // Expected animation clip names
LED_CONFIG      // LED emission, fade timings
SCREEN_ASSET_MAP    // Screen texture paths (PRE-CONFIGURED, ready for .webp swap)
INITIAL_STATE   // Nozzle, ModeLatch, battery clips, screen mode start values
SCENE_CONFIG    // Camera, lights, material defaults
```

## 3D Model Requirements

The included `kerber-t-demo.glb` must contain:

**Geometry nodes** (names configurable in `SCENE_NODE_NAMES`):
- NozzleCover, ModeLatch, BatteryClipLower, BatteryClipUpper
- Rocker, btnStart, btnMode
- ScreenDisplay (mesh with material for texture switching)
- led_Alert, led_SearchWithStop, led_Maintenance, led_Continuous

**Animation clips** (names match `ANIMATION_CLIP_NAMES`):
- NozzleCover_remove, NozzleCover_attach
- btnStart_press, btnMode_press
- BatteryClipLower_lock, BatteryClipLower_unlock
- BatteryClipUpper_lock, BatteryClipUpper_unlock
- Rocker_on, Rocker_off

## Known Limitations

1. **No animation callbacks yet**: NozzleCover interaction lock is duration-based; ideally should trigger `NOZZLE_ANIMATION_DONE` on actual animation completion
2. **Screen overlay textures**: Shutdown prompt displays ScreenShutdownPrompt texture; smooth transitions recommended
3. **LED references**: Assumed to be MeshStandardMaterial with emissive property; custom shader support not yet implemented
4. **No mobile touch support yet**: Raycasting works on desktop; touch pointer events ready to add

## Future Enhancements

- [ ] Animation callback system (emit ANIMATION_DONE when clip finishes)
- [ ] Screen transition crossfade
- [ ] Mobile touch gesture support
- [ ] WebP screen format conversion
- [ ] Exposure/scene lighting presets
- [ ] Draco compression for production builds
- [ ] Error boundary UI for missing assets
- [ ] Performance profiling overlay

## Technology Stack

- **Framework**: Three.js (3D rendering)
- **State Management**: XState (FSM)
- **Build Tool**: Vite
- **Language**: TypeScript
- **Debug UI**: lil-gui
- **Model Format**: glTF 2.0 (GLB + Draco)

## License

Internal demo project. All rights reserved.

---

**Last Updated**: March 29, 2026
