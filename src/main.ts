/**
 * Main Entry Point
 * Orchestrates loading, scene setup, FSM creation, input/visual binding
 */

import './styles.css';

import * as THREE from 'three';
import { interpret } from 'xstate';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

import { setupScene, animateScene } from './sceneSetup';
import { loadAssets } from './loadAssets';
import { resolveSceneRefs } from './resolveSceneRefs';
import { kerberTMachine } from './machine';
import { InputController } from './inputController';
import { VisualController } from './visualController';
import { setupDebugGUI } from './gui';

let hdriStrength = 1.0;
let activeInputController: InputController | null = null;

function tagControlSubtree(root: THREE.Object3D | null, controlId: string) {
  if (!root) return;
  root.traverse((obj) => {
    obj.userData = obj.userData || {};
    obj.userData.controlId = controlId;
  });
}

async function main() {
  try {
    console.log('[Main] Starting Kerber-T Demo...');

    // ======================================================================
    // SETUP SCENE
    // ======================================================================
    const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
    if (!canvas) {
      throw new Error('Canvas element not found');
    }

    const { scene, camera, renderer, orbitControls } = setupScene(canvas);
    scene.background = new THREE.Color(0x222222);

    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const hdriPath = `${baseUrl}models/neutral.hdr`;
      const hdri = await new RGBELoader().loadAsync(hdriPath);
      hdri.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = hdri;
      console.log('[Main] HDR environment loaded');
    } catch (e) {
      console.warn('[Main] Failed to load HDRI /models/neutral.hdr', e);
      scene.background = new THREE.Color(0x222222);
    }

    console.log('[Main] Scene setup complete');

    // ======================================================================
    // LOAD ASSETS
    // ======================================================================
    console.log('[Main] Loading assets...');
    const { model, animations, screenAssets } = await loadAssets();

    scene.add(model);
    frameModelInView(camera, orbitControls, model);
    placeShadowCatcherUnderModel(scene, model);
    applyEnvironmentStrength(scene, hdriStrength);
    console.log('[Main] Assets loaded');

    // ======================================================================
    // RESOLVE SCENE REFERENCES
    // ======================================================================
    console.log('[Main] Resolving scene references...');
    const sceneRefs = resolveSceneRefs(model, animations);
    console.log('[Main] Scene references resolved');

    // Tag complete control subtrees so raycast hits on child meshes still resolve to the control.
    tagControlSubtree(sceneRefs.nozzleCover, 'nozzleCover');
    tagControlSubtree(sceneRefs.modeLatch, 'modeLatch');
    tagControlSubtree(sceneRefs.batteryClipLower, 'batteryClipLower');
    tagControlSubtree(sceneRefs.batteryClipUpper, 'batteryClipUpper');
    tagControlSubtree(sceneRefs.rocker, 'rocker');
    tagControlSubtree(sceneRefs.btnStart, 'btnStart');
    tagControlSubtree(sceneRefs.btnMode, 'btnMode');

    // ======================================================================
    // CREATE FSM SERVICE
    // ======================================================================
    console.log('[Main] Creating FSM service...');
    const machineService = interpret(kerberTMachine).start() as any;
    console.log('[Main] FSM service created and started');

    // ======================================================================
    // CREATE CONTROLLERS
    // ======================================================================
    console.log('[Main] Creating controllers...');
    if (activeInputController) {
      activeInputController.dispose();
      activeInputController = null;
    }

    const visualController = new VisualController(sceneRefs, screenAssets, machineService, model, animations);
    const inputController = new InputController(
      camera,
      model,
      sceneRefs,
      machineService,
      (phase, buttonAliases) => {
        visualController.playButtonFeedback(phase, buttonAliases);
      },
    );
    activeInputController = inputController;
    console.log('[Main] Controllers created');

    // ======================================================================
    // SETUP DEBUG GUI
    // ======================================================================
    console.log('[Main] Setting up debug GUI...');
    const gui = setupDebugGUI(machineService);
    setupRenderDebugControls(gui, renderer, scene);
    console.log('[Main] Debug GUI ready');

    // ======================================================================
    // SUBSCRIBE TO ACTION EVENTS (Visual side effects)
    // ======================================================================
    let prevWorkflowState = (machineService.state.context as any).deviceWorkflowState;
    let nozzleAnimationDoneTimer: ReturnType<typeof setTimeout> | null = null;

    const playNozzleAnimationAndUnlock = (animationKey: 'nozzleRemove' | 'nozzleAttach') => {
      visualController.playAnimation(animationKey);

      const clip = sceneRefs.animations[animationKey] as THREE.AnimationClip | null;
      if (nozzleAnimationDoneTimer) {
        clearTimeout(nozzleAnimationDoneTimer);
      }

      const durationMs = Math.max(1, Math.round((clip?.duration ?? 0.4) * 1000));
      nozzleAnimationDoneTimer = setTimeout(() => {
        machineService.send({ type: 'NOZZLE_ANIMATION_DONE' });
        nozzleAnimationDoneTimer = null;
      }, durationMs);
    };

    machineService.onTransition((snapshot: any) => {
      console.log('[FSM] Transition', {
        event: snapshot.event?.type,
        value: snapshot.value,
        workflow: snapshot.context.deviceWorkflowState,
        power: snapshot.context.powerState,
      });

      if (snapshot.event?.type === 'ROCKER_ON') {
        visualController.playRockerToggle(true);
      }
      if (snapshot.event?.type === 'ROCKER_OFF') {
        visualController.playRockerToggle(false);
      }

      if (!snapshot.changed) return;

      // Detect when specific actions should trigger visual effects
      // This is a simple event-based approach to trigger visual systems

      // Boot sequence
      const nextWorkflowState = snapshot.context.deviceWorkflowState;
      if (nextWorkflowState === 'Booting' && prevWorkflowState !== 'Booting') {
        visualController.startBootSequence();
      }
      prevWorkflowState = nextWorkflowState;

      if (snapshot.event?.type === 'MODE_LATCH_TOGGLE') {
        if (snapshot.context.modeLatch === 'Air') {
          visualController.playAnimation('modeSwitchAir');
        } else {
          visualController.playAnimation('modeSwitchSwab');
        }
      }

      if (snapshot.event?.type === 'BATTERY_CLIP_LOWER_TOGGLE') {
        if (snapshot.context.batteryClipLower === 'Locked') {
          visualController.playAnimation('batteryClipLowerLock');
        } else {
          visualController.playAnimation('batteryClipLowerUnlock');
        }
      }

      if (snapshot.event?.type === 'BATTERY_CLIP_UPPER_TOGGLE') {
        if (snapshot.context.batteryClipUpper === 'Locked') {
          visualController.playAnimation('batteryClipUpperLock');
        } else {
          visualController.playAnimation('batteryClipUpperUnlock');
        }
      }

      const actions = snapshot.actions || [];
      for (const action of actions) {
        const actionType = typeof action === 'string' ? action : action?.type;
        switch (actionType) {
          case 'playNozzleRemoveAnimation':
            playNozzleAnimationAndUnlock('nozzleRemove');
            break;
          case 'playNozzleAttachAnimation':
            playNozzleAnimationAndUnlock('nozzleAttach');
            break;
          // Button tactile animation is handled by pointerdown/pointerup feedback.
          case 'playBtnStartReleaseVisual':
          case 'playBtnModeReleaseVisual':
          case 'playBtnModeLongPressVisual':
            break;
          case 'startWarmupSequence':
            visualController.startLEDBlink('maintenance');
            break;
          case 'startContinuousSearchLed':
            visualController.startLEDBlink('continuous');
            break;
          case 'startSearchWithStopLed':
            visualController.startLEDBlink('searchWithStop');
            break;
          case 'scheduleBatteryOperationLedOn':
            visualController.scheduleBatteryOperationLed();
            break;
          case 'stopBootSequence':
            visualController.stopBootSequence();
            break;
          case 'stopWarmupSequence':
          case 'stopContinuousSearchLed':
          case 'stopSearchWithStopLed':
            visualController.stopWorkflowLEDs();
            break;
          case 'clearAllLeds':
            visualController.stopAllLEDs();
            break;
        }
      }

      // Nozzle animation done
      // (This would be triggered by animation completion callbacks)
    });

    // ======================================================================
    // RENDER LOOP
    // ======================================================================
    console.log('[Main] Starting render loop...');

    let lastFrameTime = Date.now();
    animateScene(renderer, scene, camera, orbitControls, () => {
      const now = Date.now();
      const deltaTime = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      // Update visual effects
      visualController.update(deltaTime);
    });

    console.log('[Main] Kerber-T Demo initialized successfully');
  } catch (error) {
    console.error('[Main] Initialization failed:', error);
    alert(`Failed to initialize Kerber-T Demo: ${error}`);
  }
}

// Auto-start on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

function frameModelInView(
  camera: THREE.PerspectiveCamera,
  orbitControls: any,
  object: THREE.Object3D,
) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const verticalFov = (camera.fov * Math.PI) / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const fitDepthDistance = (size.z / 2) / Math.tan(verticalFov / 2);
  const fitWidthDistance = (size.x / 2) / Math.tan(horizontalFov / 2);
  const distance = Math.max(fitDepthDistance, fitWidthDistance) * 0.85;

  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(100, distance * 100);
  camera.updateProjectionMatrix();

  // Keep default world-up for OrbitControls stability.
  // A tiny lateral offset avoids the exact top-down lookAt singularity.
  const epsilon = Math.max(0.001, distance * 0.001);
  camera.up.set(0, 1, 0);
  camera.position.set(center.x - epsilon, box.max.y + distance, center.z);
  camera.lookAt(center);
  orbitControls.target.copy(center);
  orbitControls.update();
}

function placeShadowCatcherUnderModel(scene: THREE.Scene, object: THREE.Object3D) {
  const floor = scene.getObjectByName('ShadowCatcherFloor') as THREE.Mesh | null;
  if (!floor) return;

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  floor.position.set(center.x, box.min.y - 0.002, center.z);
  floor.scale.set(Math.max(2, size.x * 2.2), Math.max(2, size.z * 2.2), 1);
}

function applyEnvironmentStrength(scene: THREE.Scene, intensity: number) {
  scene.traverse((obj: any) => {
    if (!obj.isMesh) return;
    if (Array.isArray(obj.material)) {
      for (const material of obj.material) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.envMapIntensity = intensity;
          material.needsUpdate = true;
        }
      }
    } else if (obj.material instanceof THREE.MeshStandardMaterial) {
      obj.material.envMapIntensity = intensity;
      obj.material.needsUpdate = true;
    }
  });
}

function setupRenderDebugControls(
  gui: any,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
) {
  const folder = gui.addFolder('Render');
  const controls = {
    exposure: renderer.toneMappingExposure,
    hdriStrength,
  };

  folder.add(controls, 'exposure', 0.2, 2.5, 0.01).name('Exposure').onChange((v: number) => {
    renderer.toneMappingExposure = v;
  });

  folder
    .add(controls, 'hdriStrength', 0.0, 3.0, 0.01)
    .name('HDRI Strength')
    .onChange((v: number) => {
      hdriStrength = v;
      applyEnvironmentStrength(scene, v);
    });

  folder.open();
}
