
/**
 * Central configuration for Kerber-T Demo
 * All timing, asset paths, node names, LED parameters, screen mappings in one place
 */

// Import types if needed from this file itself
// We define ScreenAssetKey here to avoid circular dependencies

// ============================================================================
// TIMING CONFIGURATION (seconds)
// ============================================================================
export const TIMING = {
  longPressDuration: 2.0, // seconds before LongPress fires

  // Boot sequence: 3 full cycles + 1 partial (2 LEDs) + 1 silent step
  bootCycleDuration: 7.0,      // seconds per full LED cycle
  bootCycleCount: 2,            // number of full cycles
  bootLedCount: 4,              // LEDs per full cycle
  bootCyclesPartialCount: 2,    // LEDs active in the partial final step
  bootLedFadeIn: 0.2,           // seconds
  bootLedFadeOut: 0.8,          // seconds
  bootLedMaxIntensity: 5,

  // Warmup
  warmupDuration: 15.0, // seconds

  // LED blink (Standard 1Hz)
  blinkInterval: 1.0, // seconds (on + off = 1s total)

  // Special: LED battery operation indicator on btnStart release
  ledBatteryOperationDelay: 1.0, // seconds after btnStart release
  ledBatteryOperationFadeIn: 0.2,

  // Shutdown prompt overlay timing
  shutdownPromptAutoHideDuration: 5.0, // if needed (optional)
};

// Total boot duration: (fullCycles * ledsPerCycle + partialLeds + 1 silent) * stepDuration
export const BOOT_TOTAL_DURATION = (() => {
  const stepDur = TIMING.bootCycleDuration / TIMING.bootLedCount;
  const totalSteps = TIMING.bootCycleCount * TIMING.bootLedCount + TIMING.bootCyclesPartialCount + 1;
  return totalSteps * stepDur;
})();

// ============================================================================
// SCENE NODE NAMES (Expected names in GLB model)
// This must match the actual node names in kerber-t-demo.glb
// ============================================================================
export const SCENE_NODE_NAMES = {
  // Mechanical controls
  nozzleCover: 'NozzleCover',
  modeLatch: 'ModeLatch',
  batteryClipLower: 'BatteryClipLower',
  batteryClipUpper: 'BatteryClipUpper',

  // Electronic controls
  rocker: 'Rocker',
  btnStart: 'btnStart',
  btnMode: 'btnMode',

  // Display
  screenDisplay: 'ScreenDisplay',

  // LED node names (may be actual geometry objects or just targets for material emission)
  leds: {
    alert: 'led_Alert',
    batteryOperation: 'led_BatteryOperation',
    searchWithStop: 'led_search_with_stop',
    maintenance: 'led_maintenance',
    continuous: 'led_continuous_search',
  },
};

// ============================================================================
// ANIMATION CLIP NAMES (Expected animation names in GLB)
// ============================================================================
export const ANIMATION_CLIP_NAMES = {
  // Nozzle animations
  nozzleRemove: 'NozleCover_Detach',
  nozzleAttach: 'NozleCover_Attach',

  // Button animations
  btnPress: 'btn_press',
  btnRelease: 'btn_relese',
  btnStartPress: 'btn_press',
  btnModePress: 'btn_press',
  modeSwitchAir: 'mode_switch_air',
  modeSwitchSwab: 'mode_switch_swab',

  // Battery clip animations
  batteryClipLowerLock: 'Battery Cover Clip Lock',
  batteryClipLowerUnlock: 'Battery Cover Clip Unlock',
  batteryClipUpperLock: 'Lock',
  batteryClipUpperUnlock: 'Unlock',

  // Rocker animations
  rockerOn: 'On',
  rockerOff: 'Off',
};

// ============================================================================
// LED EMISSION CONFIGURATION
// For pulsing/blinking LED effects via material emission strength
// ============================================================================
export const LED_CONFIG = {
  maxEmissionIntensity: 5,
  fadeInDuration: 0.2, // seconds
  fadeOutDuration: 0.8, // seconds
  blinkOnDuration: 0.5, // seconds (for 1Hz blink = 0.5s on, 0.5s off)
  blinkOffDuration: 0.5, // seconds
};

// ============================================================================
// SCREEN ASSETS (Loaded Textures)
// ============================================================================

export type ScreenAssetKey =
  | 'ScreenOff'
  | 'ScreenBoot'
  | 'ScreenShutdownPrompt'
  | 'ScreenWarmupAirStandard'
  | 'ScreenWarmupAirIonogram'
  | 'ScreenWarmupSwabStandard'
  | 'ScreenWarmupSwabIonogram'
  | 'ScreenContinuousAirStandard'
  | 'ScreenContinuousAirIonogram'
  | 'ScreenContinuousSwabStandard'
  | 'ScreenContinuousSwabIonogram'
  | 'ScreenStopAirStandard'
  | 'ScreenStopAirIonogram'
  | 'ScreenStopSwabStandard'
  | 'ScreenStopSwabIonogram';

export const SCREEN_ASSET_MAP: Record<ScreenAssetKey, string> = {
  // System screens
  ScreenOff: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', // 1x1 black pixel (placeholder)
  ScreenBoot: '/screens/screen_boot.png',
  ScreenShutdownPrompt: '/screens/screen_shutdown_prompt.png',

  // Warmup variants (Air & Swab, Standard & Ionogram)
  ScreenWarmupAirStandard: '/screens/screen_warmup_air_standard.png',
  ScreenWarmupAirIonogram: '/screens/screen_warmup_air_ionogram.png',
  ScreenWarmupSwabStandard: '/screens/screen_warmup_swab_standard.png',
  ScreenWarmupSwabIonogram: '/screens/screen_warmup_swab_ionogram.png',

  // Continuous variants
  ScreenContinuousAirStandard: '/screens/screen_continuous_air_standard.png',
  ScreenContinuousAirIonogram: '/screens/screen_continuous_air_ionogram.png',
  ScreenContinuousSwabStandard: '/screens/screen_continuous_swab_standard.png',
  ScreenContinuousSwabIonogram: '/screens/screen_continuous_swab_ionogram.png',

  // SearchWithStop variants
  ScreenStopAirStandard: '/screens/screen_stop_air_standard.png',
  ScreenStopAirIonogram: '/screens/screen_stop_air_ionogram.png',
  ScreenStopSwabStandard: '/screens/screen_stop_swab_standard.png',
  ScreenStopSwabIonogram: '/screens/screen_stop_swab_ionogram.png',
};

// ============================================================================
// SCREEN SELECTION LOGIC
// Given workflow state, presentation mode, and mode latch:
// Return the appropriate ScreenAssetKey
// ============================================================================
export function resolveScreenKey(
  workflowState: string,
  presentationMode: string,
  modeLatch: string,
  powerState: string,
): string {
  // PowerOff → no display
  if (powerState === 'PowerOff') return 'ScreenOff';

  if (workflowState === 'Idle') return 'ScreenOff';

  // Booting → always ScreenBoot (regardless of ModeLatch and presentation mode)
  if (workflowState === 'Booting') return 'ScreenBoot';

  // ReadyToBoot → no display (per spec)
  if (workflowState === 'ReadyToBoot') return 'ScreenOff';

  // Build key from workflow state + modeLatch + presentationMode
  const modePrefix = modeLatch === 'Swab' ? 'Swab' : 'Air';
  const modeMode = presentationMode === 'Ionogram' ? 'Ionogram' : 'Standard';

  if (workflowState === 'Warmup') {
    return `ScreenWarmup${modePrefix}${modeMode}`;
  }
  if (workflowState === 'ContinuousSearch') {
    return `ScreenContinuous${modePrefix}${modeMode}`;
  }
  if (workflowState === 'SearchWithStop') {
    return `ScreenStop${modePrefix}${modeMode}`;
  }

  // Fallback to off
  return 'ScreenOff';
}

// ============================================================================
// INITIAL STATE CONFIGURATION
// Can be randomized or predefined
// ============================================================================
export const INITIAL_STATE = {
  nozzleCover: 'Capped' as const,
  modeLatch: 'Air' as const,
  batteryClipLower: 'Locked' as const,
  batteryClipUpper: 'Locked' as const,
  screenPresentationMode: 'Standard' as const,
  powerState: 'PowerOff' as const,
  deviceWorkflowState: 'Idle' as const,
  screenOverlay: 'None' as const,
  nozzleInteractionLocked: false,
};

// ============================================================================
// SCENE SETUP CONFIGURATION
// ============================================================================
export const SCENE_CONFIG = {
  // Canvas background
  backgroundColor: 0x1a1a1a,

  // Camera
  cameraFov: 50,
  cameraNear: 0.1,
  cameraFar: 1000,
  cameraPosition: { x: 0, y: 0.5, z: 2 },

  // Lights
  ambientLight: { intensity: 0.6, color: 0xffffff },
  directionalLight: {
    intensity: 1.0,
    color: 0xffffff,
    position: { x: 5, y: 8, z: 5 },
    castShadow: true,
    shadowMapSize: 4096,
  },

  // OrbitControls
  orbitControlsEnabled: true,
  orbitControlsAutoRotate: false,
  orbitControlsAutoRotateSpeed: 2,

  // Material defaults for presentation surface / shadows
  presentationSurfaceEnabled: true,
  presentationSurfaceReceivesShadow: true,

  // Models
  modelScale: 1.0,
};
