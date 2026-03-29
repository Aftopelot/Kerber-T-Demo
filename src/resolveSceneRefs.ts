/**
 * Scene References Resolution
 * Centralizes lookup and validation of 3D objects, materials, animations
 */

import * as THREE from 'three';
import { SCENE_NODE_NAMES, ANIMATION_CLIP_NAMES } from './config';
import { SceneRefs } from './types';

function findClip(
  clips: THREE.AnimationClip[],
  exactName: string,
  fallbackPatterns: RegExp[] = [],
): THREE.AnimationClip | null {
  const exact = clips.find((c) => c.name === exactName);
  if (exact) return exact;

  const fallback = clips.find((c) => fallbackPatterns.some((p) => p.test(c.name)));
  return fallback || null;
}

function hasTrackTarget(clip: THREE.AnimationClip, targetPattern: RegExp): boolean {
  return clip.tracks.some((track) => {
    const target = track.name.split('.')[0] || '';
    return targetPattern.test(target);
  });
}

function findClipForTarget(
  clips: THREE.AnimationClip[],
  exactName: string,
  fallbackPatterns: RegExp[],
  targetPattern: RegExp,
): THREE.AnimationClip | null {
  const exact = clips.find((c) => c.name === exactName && hasTrackTarget(c, targetPattern));
  if (exact) return exact;

  const fallback = clips.find(
    (c) => fallbackPatterns.some((p) => p.test(c.name)) && hasTrackTarget(c, targetPattern),
  );
  return fallback || null;
}

export function resolveSceneRefs(
  model: THREE.Group,
  animations: THREE.AnimationClip[],
): SceneRefs {
  const refs: SceneRefs = {
    // Mechanical controls
    nozzleCover: model.getObjectByName(SCENE_NODE_NAMES.nozzleCover) || null,
    modeLatch: model.getObjectByName(SCENE_NODE_NAMES.modeLatch) || null,
    batteryClipLower: model.getObjectByName(SCENE_NODE_NAMES.batteryClipLower) || null,
    batteryClipUpper: model.getObjectByName(SCENE_NODE_NAMES.batteryClipUpper) || null,

    // Electronic controls
    rocker: model.getObjectByName(SCENE_NODE_NAMES.rocker) || null,
    btnStart: model.getObjectByName(SCENE_NODE_NAMES.btnStart) || null,
    btnMode: model.getObjectByName(SCENE_NODE_NAMES.btnMode) || null,

    // Display
    screenDisplay: model.getObjectByName(SCENE_NODE_NAMES.screenDisplay) || null,
    screenMaterial: null, // Will be extracted from screenDisplay mesh

    // LED references
    leds: {
      alert: model.getObjectByName(SCENE_NODE_NAMES.leds.alert) || null,
      batteryOperation: model.getObjectByName(SCENE_NODE_NAMES.leds.batteryOperation) || null,
      searchWithStop: model.getObjectByName(SCENE_NODE_NAMES.leds.searchWithStop) || null,
      maintenance: model.getObjectByName(SCENE_NODE_NAMES.leds.maintenance) || null,
      continuous: model.getObjectByName(SCENE_NODE_NAMES.leds.continuous) || null,
    },

    // Animation clips
    animations: {
      btnPress: findClip(animations, ANIMATION_CLIP_NAMES.btnPress, [/btn.*press/i]),
      btnRelease: findClip(animations, ANIMATION_CLIP_NAMES.btnRelease, [/btn.*relese|btn.*release|btn.*rele/i]),
      nozzleRemove: findClip(animations, ANIMATION_CLIP_NAMES.nozzleRemove, [/noz+le.*detach/i]),
      nozzleAttach: findClip(animations, ANIMATION_CLIP_NAMES.nozzleAttach, [/noz+le.*attach/i]),
      btnStartPress: findClip(animations, ANIMATION_CLIP_NAMES.btnStartPress, [/btn.*press/i]),
      btnModePress: findClip(animations, ANIMATION_CLIP_NAMES.btnModePress, [/btn.*press/i]),
      modeSwitchAir: findClip(animations, ANIMATION_CLIP_NAMES.modeSwitchAir, [/mode.*air/i]),
      modeSwitchSwab: findClip(animations, ANIMATION_CLIP_NAMES.modeSwitchSwab, [/mode.*swab/i]),
      batteryClipLowerLock: findClipForTarget(
        animations,
        ANIMATION_CLIP_NAMES.batteryClipLowerLock,
        [/battery.*clip.*lock/i, /battery.*lock/i, /^lock$/i],
        /batterycliplower/i,
      ),
      batteryClipLowerUnlock: findClipForTarget(
        animations,
        ANIMATION_CLIP_NAMES.batteryClipLowerUnlock,
        [/battery.*clip.*unlock/i, /battery.*unlock/i, /^unlock$/i],
        /batterycliplower/i,
      ),
      batteryClipUpperLock: findClipForTarget(
        animations,
        ANIMATION_CLIP_NAMES.batteryClipUpperLock,
        [/^lock$/i, /battery.*upper.*lock/i, /battery.*lock/i],
        /batteryclipupper/i,
      ),
      batteryClipUpperUnlock: findClipForTarget(
        animations,
        ANIMATION_CLIP_NAMES.batteryClipUpperUnlock,
        [/^unlock$/i, /battery.*upper.*unlock/i, /battery.*unlock/i],
        /batteryclipupper/i,
      ),
      rockerOn: findClip(animations, ANIMATION_CLIP_NAMES.rockerOn, [/^on$/i]),
      rockerOff: findClip(animations, ANIMATION_CLIP_NAMES.rockerOff, [/^off$/i]),
    },
  };

  // Extract screen material from display mesh
  if (refs.screenDisplay) {
    let foundMaterial: THREE.MeshStandardMaterial | null = null;
    refs.screenDisplay.traverse((child) => {
      if (foundMaterial) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;

      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        foundMaterial = material;
      }
    });
    refs.screenMaterial = foundMaterial;
  }

  // Validate all critical refs (warn on missing, don't crash)
  validateSceneRefs(refs);

  return refs;
}

function validateSceneRefs(refs: SceneRefs) {
  const checks = [
    ['nozzleCover', refs.nozzleCover],
    ['modeLatch', refs.modeLatch],
    ['batteryClipLower', refs.batteryClipLower],
    ['batteryClipUpper', refs.batteryClipUpper],
    ['rocker', refs.rocker],
    ['btnStart', refs.btnStart],
    ['btnMode', refs.btnMode],
    ['screenDisplay', refs.screenDisplay],
    ['screenMaterial', refs.screenMaterial],
    ['led_alert', refs.leds.alert],
    ['led_batteryOperation', refs.leds.batteryOperation],
    ['led_searchWithStop', refs.leds.searchWithStop],
    ['led_maintenance', refs.leds.maintenance],
    ['led_continuous', refs.leds.continuous],
  ] as const;

  for (const [name, obj] of checks) {
    if (!obj) {
      console.warn(`[SceneRefs] Missing: ${name}`);
    }
  }

  const animChecks = [
    ['btnPress', refs.animations.btnPress],
    ['btnRelease', refs.animations.btnRelease],
    ['nozzleRemove', refs.animations.nozzleRemove],
    ['nozzleAttach', refs.animations.nozzleAttach],
    ['btnStartPress', refs.animations.btnStartPress],
    ['btnModePress', refs.animations.btnModePress],
  ] as const;

  for (const [name, clip] of animChecks) {
    if (!clip) {
      console.warn(`[SceneRefs] Missing animation: ${name}`);
    }
  }
}
