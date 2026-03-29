// Re-exports for circular dependency avoidance
export type { ScreenAssetKey } from './config';

import * as THREE from 'three';

// ============================================================================
// POWER STATE
// ============================================================================
export type PowerState = 'PowerOff' | 'PowerOn';

// ============================================================================
// DEVICE WORKFLOW STATE
// ============================================================================
export type DeviceWorkflowState =
  | 'Idle'
  | 'ReadyToBoot'
  | 'Booting'
  | 'Warmup'
  | 'ContinuousSearch'
  | 'SearchWithStop';

// ============================================================================
// SCREEN PRESENTATION MODE
// ============================================================================
export type ScreenPresentationMode = 'Standard' | 'Ionogram';

// ============================================================================
// MECHANICAL STATES
// ============================================================================
export type NozzleCoverState = 'Capped' | 'Uncapped';
export type ModeLatchState = 'Air' | 'Swab';
export type BatteryClipState = 'Locked' | 'Unlocked';

// ============================================================================
// SCREEN OVERLAY
// ============================================================================
export type ScreenOverlay = 'None' | 'ShutdownPrompt';

// ============================================================================
// MACHINE CONTEXT
// ============================================================================
export interface KerberTContext {
  nozzleCover: NozzleCoverState;
  modeLatch: ModeLatchState;
  batteryClipLower: BatteryClipState;
  batteryClipUpper: BatteryClipState;
  screenPresentationMode: ScreenPresentationMode;
  nozzleInteractionLocked: boolean;
  powerState: PowerState;
  deviceWorkflowState: DeviceWorkflowState;
  screenOverlay: ScreenOverlay;
}

// ============================================================================
// SCENE REFERENCES (3D Objects, Animations)
// ============================================================================
export interface SceneRefs {
  // Mechanical controls
  nozzleCover: THREE.Object3D | null;
  modeLatch: THREE.Object3D | null;
  batteryClipLower: THREE.Object3D | null;
  batteryClipUpper: THREE.Object3D | null;

  // Electronic controls
  rocker: THREE.Object3D | null;
  btnStart: THREE.Object3D | null;
  btnMode: THREE.Object3D | null;

  // Display
  screenDisplay: THREE.Object3D | null;
  screenMaterial: THREE.MeshStandardMaterial | null;

  // LED references (as Object3D or Material)
  leds: {
    alert: THREE.Object3D | THREE.MeshStandardMaterial | null;
    batteryOperation: THREE.Object3D | THREE.MeshStandardMaterial | null;
    searchWithStop: THREE.Object3D | THREE.MeshStandardMaterial | null;
    maintenance: THREE.Object3D | THREE.MeshStandardMaterial | null;
    continuous: THREE.Object3D | THREE.MeshStandardMaterial | null;
  };

  // Animation clips
  animations: {
    btnPress: THREE.AnimationClip | null;
    btnRelease: THREE.AnimationClip | null;
    nozzleRemove: THREE.AnimationClip | null;
    nozzleAttach: THREE.AnimationClip | null;
    btnStartPress: THREE.AnimationClip | null;
    btnModePress: THREE.AnimationClip | null;
    modeSwitchAir: THREE.AnimationClip | null;
    modeSwitchSwab: THREE.AnimationClip | null;
    batteryClipLowerLock: THREE.AnimationClip | null;
    batteryClipLowerUnlock: THREE.AnimationClip | null;
    batteryClipUpperLock: THREE.AnimationClip | null;
    batteryClipUpperUnlock: THREE.AnimationClip | null;
    rockerOn: THREE.AnimationClip | null;
    rockerOff: THREE.AnimationClip | null;
  };
}

// ============================================================================
// SCREEN ASSETS (Loaded Textures)
// ============================================================================
export interface ScreenAssets {
  [key: string]: THREE.Texture | undefined;
}

// ============================================================================
// MACHINE EVENTS
// ============================================================================
export type MachineEvent =
  // Power & Kill Switch
  | { type: 'ROCKER_ON' }
  | { type: 'ROCKER_OFF' }

  // Mechanical controls
  | { type: 'NOZZLE_TOGGLE' }
  | { type: 'NOZZLE_ANIMATION_DONE' }
  | { type: 'MODE_LATCH_TOGGLE' }
  | { type: 'BATTERY_CLIP_LOWER_TOGGLE' }
  | { type: 'BATTERY_CLIP_UPPER_TOGGLE' }

  // Electronic controls (only have effect when PowerOn)
  | { type: 'BTN_START_RELEASE' }
  | { type: 'BTN_MODE_RELEASE' }
  | { type: 'BTN_MODE_LONGPRESS' }

  // Timed transitions
  | { type: 'BOOT_ARMED' }
  | { type: 'BOOT_SEQUENCE_DONE' }
  | { type: 'WARMUP_DONE' }

  // Overlay management
  | { type: 'SHOW_SHUTDOWN_PROMPT' }
  | { type: 'CANCEL_SHUTDOWN_PROMPT' }
  | { type: 'CONFIRM_SHUTDOWN' }

  // Debug helpers
  | { type: 'DEBUG_SET_WORKFLOW'; workflowState: DeviceWorkflowState };

// ============================================================================
// INPUT STATE (For Long Press Detection)
// ============================================================================
export interface InputState {
  isPressed: boolean;
  pressStartTime: number;
  longPressFired: boolean;
}

export interface InputStates {
  btnStart: InputState;
  btnMode: InputState;
}
