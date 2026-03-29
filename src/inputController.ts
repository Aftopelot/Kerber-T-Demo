/**
 * Input Controller
 * Handles raycast, pointerdown/up, short/long press detection, and event dispatch
 */

import * as THREE from 'three';
import { Interpreter } from 'xstate';
import { KerberTContext, MachineEvent, InputStates } from './types';
import { TIMING, SCENE_NODE_NAMES } from './config';
import { SceneRefs } from './types';

export class InputController {
  private static activeInstance: InputController | null = null;

  private raycaster: THREE.Raycaster;
  private pointerPosition: THREE.Vector2;
  private camera: THREE.PerspectiveCamera;
  private rootObject: THREE.Object3D;
  private sceneRefs: SceneRefs;
  private machineService: Interpreter<KerberTContext, any, MachineEvent, any>;
  private onButtonFeedback?: (phase: 'down' | 'up', buttonAliases: string[]) => void;
  private pressedButtonAliases: string[] | null = null;

  private inputStates: InputStates = {
    btnStart: {
      isPressed: false,
      pressStartTime: 0,
      longPressFired: false,
    },
    btnMode: {
      isPressed: false,
      pressStartTime: 0,
      longPressFired: false,
    },
  };

  private longPressTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private currentHovered: THREE.Object3D | null = null;
  private readonly onPointerMoveHandler = (e: PointerEvent) => this.onPointerMove(e);
  private readonly onPointerDownHandler = (e: PointerEvent) => this.onPointerDown(e);
  private readonly onPointerUpHandler = (e: PointerEvent) => this.onPointerUp(e);

  constructor(
    camera: THREE.PerspectiveCamera,
    rootObject: THREE.Object3D,
    sceneRefs: SceneRefs,
    machineService: Interpreter<KerberTContext, any, MachineEvent, any>,
    onButtonFeedback?: (phase: 'down' | 'up', buttonAliases: string[]) => void,
  ) {
    if (InputController.activeInstance) {
      InputController.activeInstance.dispose();
    }

    this.camera = camera;
    this.rootObject = rootObject;
    this.sceneRefs = sceneRefs;
    this.machineService = machineService;
    this.onButtonFeedback = onButtonFeedback;

    this.raycaster = new THREE.Raycaster();
    this.pointerPosition = new THREE.Vector2();

    this.setupEventListeners();
    InputController.activeInstance = this;
  }

  private setupEventListeners() {
    document.addEventListener('pointermove', this.onPointerMoveHandler, false);
    document.addEventListener('pointerdown', this.onPointerDownHandler, false);
    document.addEventListener('pointerup', this.onPointerUpHandler, false);
  }

  private onPointerMove(event: PointerEvent) {
    this.updatePointerPosition(event);
  }

  private onPointerDown(event: PointerEvent) {
    // Skip right clicks and other buttons
    if (event.button !== 0) return;

    this.updatePointerPosition(event);

    this.raycaster.setFromCamera(this.pointerPosition, this.camera);
    const intersects = this.raycaster.intersectObject(this.rootObject, true);

    if (intersects.length === 0) return;

    const hitObject = intersects[0].object;
    const buttonAliases = this.findButtonAliases(hitObject);
    if (buttonAliases.length > 0) {
      this.pressedButtonAliases = buttonAliases;
      this.onButtonFeedback?.('down', buttonAliases);
    }

    const isControl = this.identifyControl(hitObject);

    if (!isControl) return;

    // Dispatch POINTERDOWN event for the control
    this.handleControlPointerDown(isControl, hitObject);
  }

  private onPointerUp(event: PointerEvent) {
    // Skip right clicks
    if (event.button !== 0) return;

    this.updatePointerPosition(event);

    this.raycaster.setFromCamera(this.pointerPosition, this.camera);
    const intersects = this.raycaster.intersectObject(this.rootObject, true);

    const releasedButtonAliases = this.pressedButtonAliases ? [...this.pressedButtonAliases] : [];

    if (releasedButtonAliases.length > 0) {
      this.onButtonFeedback?.('up', releasedButtonAliases);
      this.pressedButtonAliases = null;
    }

    let hitObject: THREE.Object3D | null = null;
    if (intersects.length > 0) {
      hitObject = intersects[0].object;
    }

    // Overlay owns all btn* release semantics: MODE confirms shutdown, other buttons cancel.
    const handledByOverlay = this.handleOverlayButtonRelease(releasedButtonAliases);
    if (handledByOverlay) {
      return;
    }

    // Handle release for active controls
    this.handleControlPointerUp(hitObject);
  }

  private normalizeButtonAlias(alias: string): string {
    return alias
      .toLowerCase()
      .replace(/_empty$/i, '')
      .replace(/\.[0-9]+$/i, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private handleOverlayButtonRelease(buttonAliases: string[]): boolean {
    if (!buttonAliases || buttonAliases.length === 0) return false;

    const overlayActive = this.machineService.state.context.screenOverlay === 'ShutdownPrompt';
    if (!overlayActive) {
      return false;
    }

    const normalizedAliases = buttonAliases.map((a) => this.normalizeButtonAlias(a));
    const isModeButton = normalizedAliases.some(
      (alias) => alias === 'btnmode' || alias === 'buttonmode',
    );

    if (isModeButton) {
      this.machineService.send({ type: 'BTN_MODE_RELEASE' });
      return true;
    }

    if (normalizedAliases.length > 0) {
      this.machineService.send({ type: 'CANCEL_SHUTDOWN_PROMPT' });
      return true;
    }

    return false;
  }

  private updatePointerPosition(event: PointerEvent) {
    // Update pointer position for raycasting
    this.pointerPosition.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointerPosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  private findButtonAliases(hitObject: THREE.Object3D | null): string[] {
    let current: THREE.Object3D | null = hitObject;
    const aliases: string[] = [];
    while (current) {
      const name = current.name || '';
      if (name && (/^btn/i.test(name) || /^button_/i.test(name))) {
        aliases.push(name);
      }
      current = current.parent;
    }

    const unique = new Set<string>();
    for (const a of aliases) {
      unique.add(a);
      unique.add(a.toLowerCase());
      unique.add(a.replace(/_empty$/i, ''));
      unique.add(a.replace(/_empty$/i, '').toLowerCase());
    }
    return Array.from(unique).filter(Boolean);
  }

  private identifyControl(hitObject: THREE.Object3D | null): string | null {
    if (!hitObject) return null;

    // Preferred path: resolve explicit controlId from the hit object or any parent.
    let current: THREE.Object3D | null = hitObject;
    while (current) {
      const controlId = current.userData?.controlId;
      if (
        controlId === 'nozzleCover' ||
        controlId === 'modeLatch' ||
        controlId === 'batteryClipLower' ||
        controlId === 'batteryClipUpper' ||
        controlId === 'rocker' ||
        controlId === 'btnStart' ||
        controlId === 'btnMode'
      ) {
        return controlId;
      }
      current = current.parent;
    }

    // Fallback: walk up the parent chain and match by actual node names
    current = hitObject;
    while (current) {
      const name = current.name || '';
      const lowerName = name.toLowerCase();

      if (name.includes('NozzleCover')) return 'nozzleCover';
      if (name.includes('ModeLatch')) return 'modeLatch';
      if (lowerName.includes('battery') && lowerName.includes('lower')) return 'batteryClipLower';
      if (lowerName.includes('battery') && lowerName.includes('upper')) return 'batteryClipUpper';
      if (name.includes('Rocker') || name === SCENE_NODE_NAMES.rocker) return 'rocker';
      if (name.includes('btnStart') || name === SCENE_NODE_NAMES.btnStart) return 'btnStart';
      if (name.includes('btnMode') || name === SCENE_NODE_NAMES.btnMode) return 'btnMode';

      current = current.parent;
    }

    return null;
  }

  private handleControlPointerDown(controlId: string, hitObject: THREE.Object3D) {
    switch (controlId) {
      case 'btnStart':
        this.onBtnStartDown();
        break;
      case 'btnMode':
        this.onBtnModeDown();
        break;
      // Mechanical controls don't have special down behavior
    }
  }

  private handleControlPointerUp(hitObject: THREE.Object3D | null): boolean {
    if (!hitObject) {
      // Release all active buttons
      let handled = false;
      if (this.inputStates.btnStart.isPressed) {
        this.onBtnStartUp();
        handled = true;
      }
      if (this.inputStates.btnMode.isPressed) {
        this.onBtnModeUp();
        handled = true;
      }
      return handled;
    }

    const controlId = this.identifyControl(hitObject);
    if (!controlId) return false;

    switch (controlId) {
      case 'nozzleCover':
        this.machineService.send({ type: 'NOZZLE_TOGGLE' });
        return true;
      case 'modeLatch':
        this.machineService.send({ type: 'MODE_LATCH_TOGGLE' });
        return true;
      case 'batteryClipLower':
        this.machineService.send({ type: 'BATTERY_CLIP_LOWER_TOGGLE' });
        return true;
      case 'batteryClipUpper':
        this.machineService.send({ type: 'BATTERY_CLIP_UPPER_TOGGLE' });
        return true;
      case 'rocker':
        // Rocker is toggled based on current state
        const state = this.machineService.state;
        if (state.value === 'PowerOff') {
          this.machineService.send({ type: 'ROCKER_ON' });
        } else {
          this.machineService.send({ type: 'ROCKER_OFF' });
        }
        return true;
      case 'btnStart':
        this.onBtnStartUp();
        return true;
      case 'btnMode':
        this.onBtnModeUp();
        return true;
      default:
        return false;
    }
  }

  private onBtnStartDown() {
    const state = this.inputStates.btnStart;
    state.isPressed = true;
    state.pressStartTime = Date.now();
    state.longPressFired = false;

    // Schedule long press detection
    const timer = setTimeout(() => {
      if (state.isPressed) {
        state.longPressFired = true;
        // Long press event not dispatched for btnStart (not defined in spec)
      }
    }, TIMING.longPressDuration * 1000);

    this.longPressTimers.set('btnStart', timer);
  }

  private onBtnStartUp() {
    const state = this.inputStates.btnStart;
    state.isPressed = false;

    // Clear long press timer
    const timer = this.longPressTimers.get('btnStart');
    if (timer) {
      clearTimeout(timer);
      this.longPressTimers.delete('btnStart');
    }

    state.longPressFired = false;

    // Send BTN_START_RELEASE event
    this.machineService.send({ type: 'BTN_START_RELEASE' });
  }

  private onBtnModeDown() {
    const state = this.inputStates.btnMode;
    state.isPressed = true;
    state.pressStartTime = Date.now();
    state.longPressFired = false;

    // Schedule long press detection
    const timer = setTimeout(() => {
      if (state.isPressed) {
        state.longPressFired = true;
        // Dispatch BTN_MODE_LONGPRESS event
        this.machineService.send({ type: 'BTN_MODE_LONGPRESS' });
      }
    }, TIMING.longPressDuration * 1000);

    this.longPressTimers.set('btnMode', timer);
  }

  private onBtnModeUp() {
    const state = this.inputStates.btnMode;
    state.isPressed = false;

    // Clear long press timer
    const timer = this.longPressTimers.get('btnMode');
    if (timer) {
      clearTimeout(timer);
      this.longPressTimers.delete('btnMode');
    }

    // Only dispatch BTN_MODE_RELEASE if long press was NOT fired
    // (If long press fired, short press action is cancelled)
    if (!state.longPressFired) {
      this.machineService.send({ type: 'BTN_MODE_RELEASE' });
    }

    state.longPressFired = false;
  }

  public dispose() {
    document.removeEventListener('pointermove', this.onPointerMoveHandler);
    document.removeEventListener('pointerdown', this.onPointerDownHandler);
    document.removeEventListener('pointerup', this.onPointerUpHandler);

    // Clear all timers
    for (const timer of this.longPressTimers.values()) {
      clearTimeout(timer);
    }
    this.longPressTimers.clear();

    if (InputController.activeInstance === this) {
      InputController.activeInstance = null;
    }
  }
}
