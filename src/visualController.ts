/**
 * Visual Controller
 * Manages all visual reactions to state changes:
 * - Screen texture switching
 * - LED animations and blinking
 * - Button animations
 * - Overlay rendering
 * - Animation playback
 */

import * as THREE from 'three';
import { Interpreter } from 'xstate';
import { KerberTContext, MachineEvent, ScreenAssets, SceneRefs } from './types';
import { TIMING, resolveScreenKey, LED_CONFIG } from './config';

interface ActiveLEDAnimation {
  object: THREE.Object3D | THREE.MeshStandardMaterial | null;
  tweens: Array<{ value: number; target: number; start: number; duration: number; startTime: number }>;
}

interface ActiveButtonFeedback {
  key: string;
  action: THREE.AnimationAction;
  aliases: string[];
  phase: 'down' | 'up';
}

export class VisualController {
  private sceneRefs: SceneRefs;
  private screenAssets: ScreenAssets;
  private machineService: Interpreter<KerberTContext, any, MachineEvent, any>;
  private currentScreenKey: string = 'ScreenOff';
  private currentWorkflowStateForLEDs: string | null = null;
  private currentWorkflowState: string = 'Idle';
  private currentScreenOverlay: string = 'None';
  private screenBaseEmissiveIntensity: number = 0;
  private clock: THREE.Clock;

  private activeLEDs: Map<string, ActiveLEDAnimation> = new Map();
  private animationMixer: THREE.AnimationMixer | null = null;
  private activeAnimations: Map<string, THREE.AnimationAction> = new Map();
  private sourceAnimations: THREE.AnimationClip[] = [];
  private activeButtonFeedback: ActiveButtonFeedback | null = null;
  private latchedButtonFeedback: ActiveButtonFeedback | null = null;
  private pendingButtonReleaseAliases: string[] | null = null;

  private readonly bootLedSequence: string[] = ['alert', 'searchWithStop', 'maintenance', 'continuous'];
  private bootTimerIds: ReturnType<typeof setTimeout>[] = [];
  private ledBlinkSessionIds: Map<string, number> = new Map();
  private ledBlinkTimerIds: Map<string, ReturnType<typeof setTimeout>[]> = new Map();
  private batteryOperationTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    sceneRefs: SceneRefs,
    screenAssets: ScreenAssets,
    machineService: Interpreter<KerberTContext, any, MachineEvent, any>,
    model: THREE.Group,
  ) {
    this.sceneRefs = sceneRefs;
    this.screenAssets = screenAssets;
    this.machineService = machineService;
    this.clock = new THREE.Clock();

    // Setup animation mixer for skeletal animations
    if (model) {
      this.animationMixer = new THREE.AnimationMixer(model);
      this.sourceAnimations = this.animationMixer.getRoot()
        ? ((model as any).animations || [])
        : [];
      this.animationMixer.addEventListener('finished', this.onAnimationFinished as any);
    }

    this.isolateLedMaterials();

    // Initialize from current state and subscribe via XState v4 API
    this.onMachineStateChanged(this.machineService.state as any);
    this.machineService.onTransition((state) => {
      this.onMachineStateChanged(state as any);
    });
  }

  // =========================================================================
  // STATE SUBSCRIPTION
  // =========================================================================

  private onMachineStateChanged(snapshot: any) {
    const context = snapshot.context;
    this.currentWorkflowState = context.deviceWorkflowState;
    this.currentScreenOverlay = context.screenOverlay;

    // Update current screen based on workflow state, power state, presentation mode, and mode latch
    this.updateScreen(context);

    // LED workflow logic should run only on actual workflow changes.
    // Otherwise mechanical/context transitions can restart blink loops and accumulate drift.
    const nextWorkflowState = context.deviceWorkflowState as string;
    if (nextWorkflowState !== this.currentWorkflowStateForLEDs) {
      this.currentWorkflowStateForLEDs = nextWorkflowState;
      this.updateLEDForWorkflow(nextWorkflowState, context);
    }
  }

  // =========================================================================
  // SCREEN MANAGEMENT
  // =========================================================================

  private updateScreen(context: KerberTContext) {
    const resolvedScreenKey = resolveScreenKey(
      context.deviceWorkflowState,
      context.screenPresentationMode,
      context.modeLatch,
      context.powerState,
    ) as any;

    const targetScreenKey = context.screenOverlay === 'ShutdownPrompt'
      ? 'ScreenShutdownPrompt'
      : resolvedScreenKey;

    if (targetScreenKey !== this.currentScreenKey) {
      this.currentScreenKey = targetScreenKey;
      this.applyScreenTexture(targetScreenKey);
    }
  }

  private applyScreenTexture(screenKey: string) {
    if (!this.sceneRefs.screenMaterial) {
      console.warn('[VisualController] Screen material not found');
      return;
    }

    const texture = this.screenAssets[screenKey as any];
    if (texture) {
      this.sceneRefs.screenMaterial.map = texture;
      if (screenKey === 'ScreenOff') {
        this.sceneRefs.screenMaterial.emissiveMap = null;
        this.sceneRefs.screenMaterial.emissive.set(0x000000);
        this.screenBaseEmissiveIntensity = 0;
        this.sceneRefs.screenMaterial.emissiveIntensity = this.screenBaseEmissiveIntensity;
      } else {
        this.sceneRefs.screenMaterial.emissiveMap = texture;
        this.sceneRefs.screenMaterial.emissive.set(0xffffff);
        this.screenBaseEmissiveIntensity = 1.0;
        this.sceneRefs.screenMaterial.emissiveIntensity = this.screenBaseEmissiveIntensity;
      }
      this.sceneRefs.screenMaterial.needsUpdate = true;
    } else {
      console.warn(`[VisualController] Screen texture not found: ${screenKey}`);
    }
  }

  // =========================================================================
  // LED MANAGEMENT
  // =========================================================================

  private updateLEDForWorkflow(workflowState: string, context: KerberTContext) {
    switch (workflowState) {
      case 'Booting':
        // Boot sequence is triggered by action in the machine
        break;

      case 'Warmup':
        // Start maintenance LED blink
        this.startLEDBlink('maintenance');
        break;

      case 'ContinuousSearch':
        // Start continuous LED blink
        this.stopWorkflowLEDs();
        this.startLEDBlink('continuous');
        break;

      case 'SearchWithStop':
        // Start searchWithStop LED blink
        this.stopWorkflowLEDs();
        this.startLEDBlink('searchWithStop');
        break;

      case 'ReadyToBoot':
        // All LEDs off
        this.stopAllLEDs();
        break;
    }
  }

  public startBootSequence() {
    console.log('[VisualController] Starting boot sequence');
    this.stopWorkflowLEDs();
    this.runBootSequenceCycle();
  }

  public stopBootSequence() {
    console.log('[VisualController] Stopping boot sequence');
    this.bootTimerIds.forEach(id => clearTimeout(id));
    this.bootTimerIds = [];
    this.stopWorkflowLEDs();
  }

  public scheduleBatteryOperationLed() {
    if (this.batteryOperationTimerId) {
      clearTimeout(this.batteryOperationTimerId);
      this.batteryOperationTimerId = null;
    }
    this.fadeLED('batteryOperation', LED_CONFIG.maxEmissionIntensity * 0.8, TIMING.ledBatteryOperationFadeIn);
  }

  public pulseLED(ledName: string, fadeInSeconds: number, holdSeconds: number) {
    this.fadeLED(ledName, LED_CONFIG.maxEmissionIntensity, fadeInSeconds);
    setTimeout(() => {
      this.fadeLED(ledName, 0, 0.25);
    }, (fadeInSeconds + holdSeconds) * 1000);
  }

  private runBootSequenceCycle() {
    const seq = this.bootLedSequence;
    const stepDuration = TIMING.bootCycleDuration / TIMING.bootLedCount;

    // Flat sequence: N full cycles + partial + 1 silent step
    const allSteps: (string | null)[] = [
      ...Array.from({ length: TIMING.bootCycleCount }).flatMap(() => seq),
      ...seq.slice(0, TIMING.bootCyclesPartialCount),
      null, // silent step — machine timer fires at its end
    ];

    allSteps.forEach((led, i) => {
      const stepStartMs = i * stepDuration * 1000;
      if (led !== null) {
        this.bootTimerIds.push(
          setTimeout(() => this.fadeLED(led, LED_CONFIG.maxEmissionIntensity, TIMING.bootLedFadeIn), stepStartMs)
        );
        this.bootTimerIds.push(
          setTimeout(() => this.fadeLED(led, 0, TIMING.bootLedFadeOut), stepStartMs + TIMING.bootLedFadeIn * 1000)
        );
      }
    });
  }

  public startLEDBlink(ledName: string) {
    // Get LED ref
    const ledRef = this.sceneRefs.leds[ledName as keyof typeof this.sceneRefs.leds];
    if (!ledRef) {
      console.warn(`[VisualController] LED not found: ${ledName}`);
      return;
    }

    // Cancel existing animation if any
    const existingAnim = this.activeLEDs.get(ledName);
    if (existingAnim) {
      return; // Already blinking
    }

    this.cancelLEDBlinkTimers(ledName);

    // Start infinite blink
    this.blinkLED(ledName, TIMING.blinkInterval);
  }

  public stopAllLEDs() {
    for (const [name, anim] of this.activeLEDs.entries()) {
      const ledRef = this.sceneRefs.leds[name as keyof typeof this.sceneRefs.leds];
      if (ledRef) {
        this.setLEDEmissionIntensity(name, 0);
      }
      this.cancelLEDBlinkTimers(name);
    }
    this.activeLEDs.clear();

    if (this.batteryOperationTimerId) {
      clearTimeout(this.batteryOperationTimerId);
      this.batteryOperationTimerId = null;
    }
  }

  public stopWorkflowLEDs() {
    const workflowLeds = ['alert', 'searchWithStop', 'maintenance', 'continuous'];
    for (const ledName of workflowLeds) {
      this.cancelLEDBlinkTimers(ledName);
      this.setLEDEmissionIntensity(ledName, 0);
      this.activeLEDs.delete(ledName);
    }
  }

  private cancelLEDBlinkTimers(ledName: string) {
    const timers = this.ledBlinkTimerIds.get(ledName);
    if (timers) {
      for (const timerId of timers) {
        clearTimeout(timerId);
      }
      this.ledBlinkTimerIds.delete(ledName);
    }

    const prevSession = this.ledBlinkSessionIds.get(ledName) ?? 0;
    this.ledBlinkSessionIds.set(ledName, prevSession + 1);
  }

  private scheduleLEDBlinkTimer(ledName: string, delayMs: number, callback: () => void) {
    const timerId = setTimeout(() => {
      const timers = this.ledBlinkTimerIds.get(ledName);
      if (timers) {
        const idx = timers.indexOf(timerId);
        if (idx >= 0) {
          timers.splice(idx, 1);
        }
        if (timers.length === 0) {
          this.ledBlinkTimerIds.delete(ledName);
        }
      }
      callback();
    }, delayMs);

    const timers = this.ledBlinkTimerIds.get(ledName) ?? [];
    timers.push(timerId);
    this.ledBlinkTimerIds.set(ledName, timers);
  }

  private fadeLED(ledName: string, targetIntensity: number, durationSeconds: number) {
    const ledRef = this.sceneRefs.leds[ledName as keyof typeof this.sceneRefs.leds];
    if (!ledRef) return;

    // Get current intensity
    let currentIntensity = 0;
    if (this.activeLEDs.has(ledName)) {
      const anim = this.activeLEDs.get(ledName);
      if (anim && anim.tweens.length > 0) {
        currentIntensity = anim.tweens[anim.tweens.length - 1].target;
      }
    }

    // Add fade tween
    const tween = {
      value: currentIntensity,
      target: targetIntensity,
      start: currentIntensity,
      duration: durationSeconds,
      startTime: this.clock.getElapsedTime(),
    };

    if (!this.activeLEDs.has(ledName)) {
      this.activeLEDs.set(ledName, { object: ledRef, tweens: [] });
    }

    const anim = this.activeLEDs.get(ledName);
    if (anim) {
      anim.tweens.push(tween);
    }
  }

  private blinkLED(ledName: string, cycleDuration: number) {
    // Infinite blink: on for half, off for half
    const onDuration = cycleDuration / 2;
    const offDuration = cycleDuration / 2;
    const sessionId = (this.ledBlinkSessionIds.get(ledName) ?? 0) + 1;
    this.ledBlinkSessionIds.set(ledName, sessionId);

    const blink = () => {
      if (this.ledBlinkSessionIds.get(ledName) !== sessionId) return;

      // Fade in
      this.fadeLED(ledName, LED_CONFIG.maxEmissionIntensity, onDuration);

      this.scheduleLEDBlinkTimer(ledName, onDuration * 1000 + 50, () => {
        if (this.ledBlinkSessionIds.get(ledName) === sessionId && this.activeLEDs.has(ledName)) {
          // Fade out
          this.fadeLED(ledName, 0, offDuration);

          this.scheduleLEDBlinkTimer(ledName, offDuration * 1000 + 50, () => {
            // Repeat (only if still in activeLEDs)
            if (this.ledBlinkSessionIds.get(ledName) === sessionId && this.activeLEDs.has(ledName)) {
              blink();
            }
          });
        }
      });
    };

    blink();
  }

  private setLEDEmissionIntensity(ledName: string, intensity: number) {
    const ledRef = this.sceneRefs.leds[ledName as keyof typeof this.sceneRefs.leds];
    if (!ledRef) return;

    const ledColorMap: Record<string, number> = {
      alert: 0xff2200,
      batteryOperation: 0x1eff6b,
      maintenance: 0xffa500,
      searchWithStop: 0x00b7ff,
      continuous: 0x2cff4d,
    };
    const targetColor = new THREE.Color(ledColorMap[ledName] || 0xffffff);

    if (ledRef instanceof THREE.MeshStandardMaterial) {
      // Set emission intensity directly
      ledRef.emissive.copy(targetColor);
      ledRef.emissiveIntensity = intensity;
    } else if (ledRef instanceof THREE.Object3D) {
      // Traverse children and update materials
      ledRef.traverse((child: any) => {
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.copy(targetColor);
          child.material.emissiveIntensity = intensity;
        }
      });
    }
  }

  // =========================================================================
  // ANIMATION PLAYBACK
  // =========================================================================

  public playAnimation(animationClipName: string, speed: number = 1.0) {
    if (!this.animationMixer) {
      console.warn('[VisualController] Animation mixer not available');
      return;
    }

    const animationClip = this.sceneRefs.animations[
      animationClipName as keyof typeof this.sceneRefs.animations
    ] as THREE.AnimationClip | null;
    if (!animationClip) {
      console.warn(`[VisualController] Animation not found: ${animationClipName}`);
      return;
    }

    // Rocker clips are mutually exclusive; stop both before playing target.
    if (animationClipName === 'rockerOn' || animationClipName === 'rockerOff') {
      this.stopAnimationIfActive('rockerOn');
      this.stopAnimationIfActive('rockerOff');
    }

    // Nozzle clips are mutually exclusive and animate the same target tracks.
    // If the opposite clip remains clamped, it will fight current motion and distort trajectory.
    if (animationClipName === 'nozzleRemove' || animationClipName === 'nozzleAttach') {
      this.stopAnimationIfActive('nozzleRemove');
      this.stopAnimationIfActive('nozzleAttach');
    }

    // Mode latch clips are also opposite directions on same transform and must not blend.
    if (animationClipName === 'modeSwitchAir' || animationClipName === 'modeSwitchSwab') {
      this.stopAnimationIfActive('modeSwitchAir');
      this.stopAnimationIfActive('modeSwitchSwab');
    }

    // Battery clip lock/unlock clips are opposite only within the same clip pair.
    if (animationClipName === 'batteryClipLowerLock' || animationClipName === 'batteryClipLowerUnlock') {
      this.stopAnimationIfActive('batteryClipLowerLock');
      this.stopAnimationIfActive('batteryClipLowerUnlock');
    }
    if (animationClipName === 'batteryClipUpperLock' || animationClipName === 'batteryClipUpperUnlock') {
      this.stopAnimationIfActive('batteryClipUpperLock');
      this.stopAnimationIfActive('batteryClipUpperUnlock');
    }

    const action = this.animationMixer.clipAction(animationClip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = speed;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(speed);
    action.enabled = true;
    action.time = 0;
    action.reset();
    action.play();

    // Auto-clean up when animation finishes
    const oldAction = this.activeAnimations.get(animationClipName);
    if (oldAction) {
      oldAction.stop();
    }
    this.activeAnimations.set(animationClipName, action);
  }

  public playRockerToggle(toOn: boolean) {
    if (toOn) {
      this.playAnimation('rockerOn');
    } else {
      this.playAnimation('rockerOff');
    }
  }

  public playButtonFeedback(phase: 'down' | 'up', buttonAliases: string[]) {
    const aliases = this.normalizeButtonAliases(buttonAliases);
    if (aliases.length === 0) {
      return;
    }

    if (phase === 'down') {
      this.pendingButtonReleaseAliases = null;
      this.stopActiveButtonFeedback();
      this.stopLatchedButtonFeedback();
      this.startButtonFeedbackPhase('down', aliases);
      return;
    }

    if (this.activeButtonFeedback && this.activeButtonFeedback.phase === 'down') {
      this.pendingButtonReleaseAliases = aliases;
      return;
    }

    if (this.latchedButtonFeedback && this.buttonAliasesOverlap(this.latchedButtonFeedback.aliases, aliases)) {
      const latched = this.latchedButtonFeedback;
      this.startButtonFeedbackPhase('up', aliases);
      if (latched) {
        this.stopTrackedButtonFeedback(latched);
        if (this.latchedButtonFeedback === latched) {
          this.latchedButtonFeedback = null;
        }
      }
    }
  }

  // =========================================================================
  // UPDATE LOOP (called once per frame)
  // =========================================================================

  public update(deltaTime: number) {
    // Update animation mixer
    if (this.animationMixer) {
      this.animationMixer.update(deltaTime);
    }

    if (this.sceneRefs.screenMaterial) {
      if (this.currentWorkflowState === 'Booting' && this.currentScreenOverlay !== 'ShutdownPrompt') {
        const breathFrequencyHz = 1 / 3;
        const phase = this.clock.getElapsedTime() * Math.PI * 2 * breathFrequencyHz;
        this.sceneRefs.screenMaterial.emissiveIntensity = 0.75 + 0.25 * Math.cos(phase);
      } else {
        this.sceneRefs.screenMaterial.emissiveIntensity = this.screenBaseEmissiveIntensity;
      }
    }

    // Update LED tweens
    const currentTime = this.clock.getElapsedTime();
    for (const [name, anim] of this.activeLEDs.entries()) {
      if (!anim.tweens || anim.tweens.length === 0) continue;

      // Process the first (current) tween
      const tween = anim.tweens[0];
      const elapsed = currentTime - tween.startTime;
      const progress = Math.min(elapsed / tween.duration, 1.0);

      const newValue = tween.start + (tween.target - tween.start) * progress;
      this.setLEDEmissionIntensity(name, newValue);

      // Remove completed tween
      if (progress >= 1.0) {
        anim.tweens.shift();
      }
    }
  }

  public dispose() {
    this.stopAllLEDs();
    this.stopBootSequence();
    this.stopButtonFeedbackAnimations();
    this.activeAnimations.clear();

    if (this.animationMixer) {
      this.animationMixer.removeEventListener('finished', this.onAnimationFinished as any);
    }

    if (this.batteryOperationTimerId) {
      clearTimeout(this.batteryOperationTimerId);
      this.batteryOperationTimerId = null;
    }
  }

  private isolateLedMaterials() {
    const ledRefs = Object.values(this.sceneRefs.leds);
    for (const ledRef of ledRefs) {
      if (!ledRef || ledRef instanceof THREE.MeshStandardMaterial) continue;

      ledRef.traverse((child: any) => {
        if (!child.material) return;
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m: any) =>
            m instanceof THREE.MeshStandardMaterial ? m.clone() : m,
          );
        } else if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material = child.material.clone();
        }
      });
    }
  }

  private stopAnimationIfActive(animationKey: string) {
    const active = this.activeAnimations.get(animationKey);
    if (active) {
      active.stop();
      this.activeAnimations.delete(animationKey);
    }
  }

  private stopButtonFeedbackAnimations() {
    this.stopAnimationIfActive('btnPress');
    this.stopAnimationIfActive('btnRelease');
    this.stopAnimationIfActive('btnStartPress');
    this.stopAnimationIfActive('btnModePress');
    this.stopActiveButtonFeedback();
    this.stopLatchedButtonFeedback();
    this.pendingButtonReleaseAliases = null;
  }

  private startButtonFeedbackPhase(phase: 'down' | 'up', aliases: string[]) {
    const baseClip = phase === 'down' ? this.sceneRefs.animations.btnPress : this.sceneRefs.animations.btnRelease;
    if (!baseClip) {
      console.warn(`[VisualController] Missing shared button clip for phase=${phase}`);
      this.activeButtonFeedback = null;
      return;
    }

    const filtered = this.createButtonFilteredClip(baseClip, aliases);
    if (!filtered) {
      console.warn(`[VisualController] No button feedback clip resolved for aliases=${aliases.join(', ')} (${phase})`);
      this.activeButtonFeedback = null;
      return;
    }

    const key = `btn:${aliases[0] || 'unknown'}:${phase}`;
    const action = this.playClipDirect(filtered, key);
    if (!action) {
      this.activeButtonFeedback = null;
      return;
    }

    this.activeButtonFeedback = { key, action, aliases, phase };
  }

  private onAnimationFinished = (event: { action?: THREE.AnimationAction }) => {
    if (!event.action || !this.activeButtonFeedback) return;
    if (event.action !== this.activeButtonFeedback.action) return;

    const finished = this.activeButtonFeedback;
    this.activeButtonFeedback = null;

    if (finished.phase === 'down') {
      if (this.pendingButtonReleaseAliases) {
        const releaseAliases = this.pendingButtonReleaseAliases;
        this.pendingButtonReleaseAliases = null;
        this.startButtonFeedbackPhase('up', releaseAliases);
        this.stopTrackedButtonFeedback(finished);
        return;
      }

      this.latchedButtonFeedback = finished;
      return;
    }

    this.stopTrackedButtonFeedback(finished);
  };

  private stopActiveButtonFeedback() {
    if (!this.activeButtonFeedback) return;
    this.stopTrackedButtonFeedback(this.activeButtonFeedback);
    this.activeButtonFeedback = null;
  }

  private stopLatchedButtonFeedback() {
    if (!this.latchedButtonFeedback) return;
    this.stopTrackedButtonFeedback(this.latchedButtonFeedback);
    this.latchedButtonFeedback = null;
  }

  private stopTrackedButtonFeedback(feedback: ActiveButtonFeedback) {
    const mapped = this.activeAnimations.get(feedback.key);
    if (mapped === feedback.action) {
      this.activeAnimations.delete(feedback.key);
    }

    feedback.action.stop();

    if (this.animationMixer) {
      this.animationMixer.uncacheAction(feedback.action.getClip());
      this.animationMixer.uncacheClip(feedback.action.getClip());
    }
  }

  private buttonAliasesOverlap(left: string[], right: string[]) {
    return left.some((alias) => right.includes(alias));
  }

  private normalizeButtonAliases(buttonAliases: string[]): string[] {
    const normalized = new Set<string>();
    for (const raw of buttonAliases) {
      const n = (raw || '').toLowerCase();
      if (!n) continue;
      const base = n.replace(/_empty$/i, '');
      normalized.add(n);
      normalized.add(base);
      normalized.add(`${base}_empty`);
    }
    return Array.from(normalized).filter(Boolean);
  }

  private createButtonFilteredClip(
    source: THREE.AnimationClip,
    aliases: string[],
  ): THREE.AnimationClip | null {
    const tracks = source.tracks.filter((track) => {
      const tn = track.name.toLowerCase();
      return aliases.some((a) => tn.startsWith(`${a}.`) || tn.includes(`.${a}.`) || tn.includes(a));
    });

    if (tracks.length === 0) return null;

    const clonedTracks = tracks.map((t) => t.clone());
    return new THREE.AnimationClip(`${source.name}__${aliases[0]}`, source.duration, clonedTracks);
  }

  private collectAllClips(): THREE.AnimationClip[] {
    const known = Object.values(this.sceneRefs.animations).filter(Boolean) as THREE.AnimationClip[];
    const merged = [...this.sourceAnimations, ...known];
    const unique = new Map<string, THREE.AnimationClip>();
    for (const clip of merged) {
      unique.set(clip.uuid, clip);
    }
    return Array.from(unique.values());
  }

  private playClipDirect(clip: THREE.AnimationClip, key: string, speed: number = 1.0): THREE.AnimationAction | null {
    if (!this.animationMixer) return null;

    const action = this.animationMixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = speed;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(speed);
    action.enabled = true;
    action.time = 0;
    action.reset();
    action.play();

    const oldAction = this.activeAnimations.get(key);
    if (oldAction) {
      oldAction.stop();
    }
    this.activeAnimations.set(key, action);
    return action;
  }
}
