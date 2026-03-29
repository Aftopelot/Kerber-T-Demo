/**
 * FSM Machine (XState)
 * Contains all state logic, guards, actions, timed transitions, and overlay management
 *
 * Architecture:
 * - State tree: PowerOff | PowerOn (with nested workflow + overlay)
 * - Context: All mechanical/electrical states maintained in one place
 * - Events: Input-agnostic, dispatched from inputController
 * - Actions: Immutable state updates only, no side effects
 * - Visual updates: Subscribed from visualController
 */

import { createMachine, assign, sendTo, actions } from 'xstate';
import { KerberTContext, MachineEvent, DeviceWorkflowState, PowerState } from './types';
import { INITIAL_STATE, TIMING, BOOT_TOTAL_DURATION } from './config';

const { log } = actions;

// ============================================================================
// GUARDS
// ============================================================================

const guards = {
  canToggleNozzleFromCapped: (context: KerberTContext) =>
    context.nozzleCover === 'Capped' && !context.nozzleInteractionLocked,
  canToggleNozzleFromUncapped: (context: KerberTContext) =>
    context.nozzleCover === 'Uncapped' && !context.nozzleInteractionLocked,
  isNozzleUncapped: (context: KerberTContext) => context.nozzleCover === 'Uncapped',
  canStartBoot: (context: KerberTContext) =>
    context.powerState === 'PowerOn' && context.deviceWorkflowState === 'ReadyToBoot',
  isOverlayInactive: (context: KerberTContext) => context.screenOverlay === 'None',
  isOverlayActive: (context: KerberTContext) => context.screenOverlay !== 'None',
  isDebugGotoReadyToBoot: (_context: KerberTContext, event: any) =>
    event.type === 'DEBUG_SET_WORKFLOW' && event.workflowState === 'ReadyToBoot',
  isDebugGotoBooting: (_context: KerberTContext, event: any) =>
    event.type === 'DEBUG_SET_WORKFLOW' && event.workflowState === 'Booting',
  isDebugGotoWarmup: (_context: KerberTContext, event: any) =>
    event.type === 'DEBUG_SET_WORKFLOW' && event.workflowState === 'Warmup',
  isDebugGotoContinuousSearch: (_context: KerberTContext, event: any) =>
    event.type === 'DEBUG_SET_WORKFLOW' && event.workflowState === 'ContinuousSearch',
  isDebugGotoSearchWithStop: (_context: KerberTContext, event: any) =>
    event.type === 'DEBUG_SET_WORKFLOW' && event.workflowState === 'SearchWithStop',
};

// ============================================================================
// ACTIONS
// ============================================================================

const machineActions = {
  // Power
  setPowerOn: assign({ powerState: 'PowerOn' as PowerState }),
  setPowerOff: assign({
    powerState: 'PowerOff' as PowerState,
    deviceWorkflowState: 'Idle' as DeviceWorkflowState,
  }),
  setPowerOffState: assign({
    powerState: 'PowerOff' as PowerState,
    deviceWorkflowState: 'Idle' as DeviceWorkflowState,
  }),

  // Kill Switch side effects
  cancelAllTimers: () => {
    // Reset any pending timers (handled by xstate's state machine naturally)
  },
  clearAllLeds: () => {
    // LED visual update will be triggered by state subscription
  },
  clearOverlay: assign({ screenOverlay: 'None' }),
  setScreenOff: () => {
    // Visual controller will update screen to ScreenOff
  },

  // Workflow states
  setWorkflowReadyToBoot: assign({ deviceWorkflowState: 'ReadyToBoot' as DeviceWorkflowState }),
  setWorkflowBooting: assign({ deviceWorkflowState: 'Booting' as DeviceWorkflowState }),
  setWorkflowWarmup: assign({ deviceWorkflowState: 'Warmup' as DeviceWorkflowState }),
  setWorkflowContinuousSearch: assign({
    deviceWorkflowState: 'ContinuousSearch' as DeviceWorkflowState,
  }),
  setWorkflowSearchWithStop: assign({
    deviceWorkflowState: 'SearchWithStop' as DeviceWorkflowState,
  }),

  // Nozzle control
  setNozzleUncapped: assign({ nozzleCover: 'Uncapped' }),
  setNozzleCapped: assign({ nozzleCover: 'Capped' }),
  lockNozzleInteraction: assign({ nozzleInteractionLocked: true }),
  unlockNozzleInteraction: assign({ nozzleInteractionLocked: false }),
  playNozzleRemoveAnimation: () => {
    // Visual controller will play animation
  },
  playNozzleAttachAnimation: () => {
    // Visual controller will play animation
  },

  // Mode latch
  toggleModeLatch: assign({
    modeLatch: (context) => (context.modeLatch === 'Air' ? 'Swab' : 'Air'),
  }),

  // Battery clips
  toggleBatteryClipLower: assign({
    batteryClipLower: (context) => (context.batteryClipLower === 'Locked' ? 'Unlocked' : 'Locked'),
  }),
  toggleBatteryClipUpper: assign({
    batteryClipUpper: (context) => (context.batteryClipUpper === 'Locked' ? 'Unlocked' : 'Locked'),
  }),

  // Button visuals
  playBtnStartReleaseVisual: () => {
    // Visual controller will play button animation
  },
  playBtnStartReleaseVisualNoOp: () => {
    // No visual feedback (restricted action)
  },
  playBtnModeReleaseVisual: () => {
    // Visual controller will play button animation
  },
  playBtnModeReleaseVisualNoOp: () => {
    // No visual feedback
  },
  playBtnModeLongPressVisual: () => {
    // Visual controller will play button animation
  },
  playBtnModeLongPressVisualNoOp: () => {
    // No visual feedback
  },

  // Boot sequence
  startBootSequence: () => {
    // Visual controller will manage LED cycle
  },
  stopBootSequence: () => {
    // Visual controller will stop LED animations
  },
  applyBootScreen: () => {
    // Visual controller will switch to ScreenBoot
  },

  // Warmup sequence
  startWarmupSequence: () => {
    // Visual controller will manage LED blink
  },
  stopWarmupSequence: () => {
    // Visual controller will stop LED animations
  },
  scheduleBatteryOperationLedOn: () => {
    // Visual controller will schedule LED fade-in after delay
  },
  scheduleBootArming: actions.send({ type: 'BOOT_ARMED' }, { delay: TIMING.ledBatteryOperationDelay * 1000 }),

  // Search sequences
  startContinuousSearchLed: () => {
    // Visual controller will start LED blink
  },
  stopContinuousSearchLed: () => {
    // Visual controller will stop LED animation
  },
  startSearchWithStopLed: () => {
    // Visual controller will start LED blink
  },
  stopSearchWithStopLed: () => {
    // Visual controller will stop LED animation
  },

  // Screen management
  applyResolvedScreen: () => {
    // Visual controller will compute and apply correct screen based on context
  },
  applyReadyToBootScreen: () => {
    // Screen off for ReadyToBoot
  },

  // Screen presentation mode
  toggleScreenPresentationMode: assign({
    screenPresentationMode: (context) => (context.screenPresentationMode === 'Standard' ? 'Ionogram' : 'Standard'),
  }),

  // Overlay
  showShutdownPromptOverlay: assign({ screenOverlay: 'ShutdownPrompt' }),
  raiseShowShutdownPrompt: actions.send({ type: 'SHOW_SHUTDOWN_PROMPT' }),
  hideShutdownPromptOverlay: assign({ screenOverlay: 'None' }),
  restoreResolvedScreen: () => {
    // Visual controller will restore the workflow screen
  },
  cancelShutdownPrompt: () => {
    // Nothing to do in context, just visual cleanup
  },
  confirmShutdown: () => {
    // Transition to ReadyToBoot is handled in the state transition
  },

  // Silent ignore (for restricted actions)
  ignoreBtnStartDuringBooting: () => {
    // Event simply ignored
  },
  ignoreBtnModeShortPressDuringBooting: () => {
    // Event simply ignored
  },
  ignoreBtnModeLongPressDuringBooting: () => {
    // Event simply ignored
  },
};

// ============================================================================
// STATE MACHINE DEFINITION
// ============================================================================

export const kerberTMachine = createMachine(
  {
    id: 'kerberT-demo',
    initial: 'PowerOff',
    context: INITIAL_STATE,
    predictableActionArguments: true,
    states: {
      // ========================================================================
      // POWER OFF
      // ========================================================================
      PowerOff: {
        id: 'powerOff',
        entry: [
          'setPowerOffState',
          'cancelAllTimers',
          'clearAllLeds',
          'clearOverlay',
          'setScreenOff',
        ],
        on: {
          // Power on (mechanical rocker switch, always available)
          ROCKER_ON: {
            target: 'PowerOn',
            actions: ['setPowerOn'],
          },

          // Mechanical controls always available
          NOZZLE_TOGGLE: [
            {
              cond: 'canToggleNozzleFromCapped',
              actions: [
                'setNozzleUncapped',
                'lockNozzleInteraction',
                'playNozzleRemoveAnimation',
              ],
            },
            {
              cond: 'canToggleNozzleFromUncapped',
              actions: [
                'setNozzleCapped',
                'lockNozzleInteraction',
                'playNozzleAttachAnimation',
              ],
            },
          ],
          NOZZLE_ANIMATION_DONE: {
            actions: ['unlockNozzleInteraction'],
          },
          MODE_LATCH_TOGGLE: {
            cond: 'isNozzleUncapped',
            actions: ['toggleModeLatch'],
          },
          BATTERY_CLIP_LOWER_TOGGLE: {
            actions: ['toggleBatteryClipLower'],
          },
          BATTERY_CLIP_UPPER_TOGGLE: {
            actions: ['toggleBatteryClipUpper'],
          },
        },
      },

      // ========================================================================
      // POWER ON (Parallel: workflow + overlay)
      // ========================================================================
      PowerOn: {
        id: 'powerOn',
        type: 'parallel',
        on: {
          // Kill switch (overrides everything)
          ROCKER_OFF: {
            target: 'PowerOff',
          },

          // Mechanical controls always available in PowerOn too
          NOZZLE_TOGGLE: [
            {
              cond: 'canToggleNozzleFromCapped',
              actions: [
                'setNozzleUncapped',
                'lockNozzleInteraction',
                'playNozzleRemoveAnimation',
              ],
            },
            {
              cond: 'canToggleNozzleFromUncapped',
              actions: [
                'setNozzleCapped',
                'lockNozzleInteraction',
                'playNozzleAttachAnimation',
              ],
            },
          ],
          NOZZLE_ANIMATION_DONE: {
            actions: ['unlockNozzleInteraction'],
          },
          MODE_LATCH_TOGGLE: {
            cond: 'isNozzleUncapped',
            actions: ['toggleModeLatch', 'applyResolvedScreen'],
          },
          BATTERY_CLIP_LOWER_TOGGLE: {
            actions: ['toggleBatteryClipLower'],
          },
          BATTERY_CLIP_UPPER_TOGGLE: {
            actions: ['toggleBatteryClipUpper'],
          },
        },
        states: {
          // ====================================================================
          // WORKFLOW (Nested state machine)
          // ====================================================================
          workflow: {
            id: 'workflow',
            initial: 'ReadyToBoot',
            on: {
              DEBUG_SET_WORKFLOW: [
                {
                  cond: 'isDebugGotoReadyToBoot',
                  target: '.ReadyToBoot',
                },
                {
                  cond: 'isDebugGotoBooting',
                  target: '.Booting',
                },
                {
                  cond: 'isDebugGotoWarmup',
                  target: '.Warmup',
                },
                {
                  cond: 'isDebugGotoContinuousSearch',
                  target: '.ContinuousSearch',
                },
                {
                  cond: 'isDebugGotoSearchWithStop',
                  target: '.SearchWithStop',
                },
              ],
            },
            states: {
              ReadyToBoot: {
                id: 'readyToBoot',
                entry: [
                  'setWorkflowReadyToBoot',
                  'stopBootSequence',
                  'stopWarmupSequence',
                  'stopContinuousSearchLed',
                  'stopSearchWithStopLed',
                  'applyReadyToBootScreen',
                ],
                on: {
                  BTN_START_RELEASE: [
                    {
                      cond: 'canStartBoot',
                      actions: ['playBtnStartReleaseVisual', 'scheduleBootArming'],
                    },
                    {
                      actions: ['playBtnStartReleaseVisualNoOp'],
                    },
                  ],
                  BOOT_ARMED: {
                    target: 'Booting',
                    actions: ['scheduleBatteryOperationLedOn'],
                  },
                  BTN_MODE_RELEASE: {
                    actions: ['playBtnModeReleaseVisualNoOp'],
                  },
                  BTN_MODE_LONGPRESS: {
                    actions: ['playBtnModeLongPressVisualNoOp'],
                  },
                },
              },

              Booting: {
                id: 'booting',
                entry: ['setWorkflowBooting', 'startBootSequence', 'applyBootScreen'],
                exit: ['stopBootSequence'],
                after: {
                  [BOOT_TOTAL_DURATION * 1000]: 'Warmup',
                },
                on: {
                  // Ignore button presses during booting
                  BTN_START_RELEASE: {
                    actions: ['ignoreBtnStartDuringBooting'],
                  },
                  BTN_MODE_RELEASE: {
                    actions: ['ignoreBtnModeShortPressDuringBooting'],
                  },
                  BTN_MODE_LONGPRESS: {
                    actions: ['ignoreBtnModeLongPressDuringBooting'],
                  },

                  // Explicit event (optional, can use 'after' above)
                  BOOT_SEQUENCE_DONE: {
                    target: 'Warmup',
                  },
                },
              },

              Warmup: {
                id: 'warmup',
                entry: ['setWorkflowWarmup', 'startWarmupSequence', 'applyResolvedScreen'],
                exit: ['stopWarmupSequence'],
                after: {
                  [TIMING.warmupDuration * 1000]: 'ContinuousSearch',
                },
                on: {
                  BTN_START_RELEASE: [
                    {
                      cond: 'isOverlayInactive',
                      actions: [
                        'playBtnStartReleaseVisual',
                        'raiseShowShutdownPrompt',
                      ],
                      // Stay in Warmup, just trigger overlay in overlay state
                    },
                    {
                      actions: ['playBtnStartReleaseVisualNoOp'],
                    },
                  ],
                  BTN_MODE_RELEASE: [
                    {
                      cond: 'isOverlayActive',
                      target: 'ReadyToBoot',
                      actions: ['playBtnModeReleaseVisual', 'confirmShutdown'],
                      // This triggers a transition to ReadyToBoot via overlay state
                    },
                    {
                      actions: ['playBtnModeReleaseVisualNoOp'],
                    },
                  ],
                  BTN_MODE_LONGPRESS: {
                    cond: 'isOverlayInactive',
                    actions: [
                      'toggleScreenPresentationMode',
                      'playBtnModeLongPressVisual',
                      'applyResolvedScreen',
                    ],
                  },
                  WARMUP_DONE: {
                    target: 'ContinuousSearch',
                  },
                },
              },

              ContinuousSearch: {
                id: 'continuousSearch',
                entry: ['setWorkflowContinuousSearch', 'startContinuousSearchLed', 'applyResolvedScreen'],
                exit: ['stopContinuousSearchLed'],
                on: {
                  BTN_START_RELEASE: [
                    {
                      cond: 'isOverlayInactive',
                      actions: [
                        'playBtnStartReleaseVisual',
                        'raiseShowShutdownPrompt',
                      ],
                    },
                    {
                      actions: ['playBtnStartReleaseVisualNoOp'],
                    },
                  ],
                  BTN_MODE_RELEASE: [
                    {
                      cond: 'isOverlayActive',
                      target: 'ReadyToBoot',
                      actions: ['playBtnModeReleaseVisual', 'confirmShutdown'],
                    },
                    {
                      target: 'SearchWithStop',
                      actions: ['playBtnModeReleaseVisual', 'applyResolvedScreen'],
                    },
                  ],
                  BTN_MODE_LONGPRESS: {
                    cond: 'isOverlayInactive',
                    actions: [
                      'toggleScreenPresentationMode',
                      'playBtnModeLongPressVisual',
                      'applyResolvedScreen',
                    ],
                  },
                },
              },

              SearchWithStop: {
                id: 'searchWithStop',
                entry: ['setWorkflowSearchWithStop', 'startSearchWithStopLed', 'applyResolvedScreen'],
                exit: ['stopSearchWithStopLed'],
                on: {
                  BTN_START_RELEASE: [
                    {
                      cond: 'isOverlayInactive',
                      actions: [
                        'playBtnStartReleaseVisual',
                        'raiseShowShutdownPrompt',
                      ],
                    },
                    {
                      actions: ['playBtnStartReleaseVisualNoOp'],
                    },
                  ],
                  BTN_MODE_RELEASE: [
                    {
                      cond: 'isOverlayActive',
                      target: 'ReadyToBoot',
                      actions: ['playBtnModeReleaseVisual', 'confirmShutdown'],
                    },
                    {
                      target: 'ContinuousSearch',
                      actions: ['playBtnModeReleaseVisual', 'applyResolvedScreen'],
                    },
                  ],
                  BTN_MODE_LONGPRESS: {
                    cond: 'isOverlayInactive',
                    actions: [
                      'toggleScreenPresentationMode',
                      'playBtnModeLongPressVisual',
                      'applyResolvedScreen',
                    ],
                  },
                },
              },
            },
          },

          // ====================================================================
          // OVERLAY (Independent parallel state)
          // ====================================================================
          overlay: {
            id: 'overlay',
            initial: 'None',
            states: {
              None: {
                id: 'overlayNone',
              },
              ShutdownPrompt: {
                id: 'shutdownPrompt',
                entry: ['showShutdownPromptOverlay'],
                exit: ['hideShutdownPromptOverlay'],
                on: {
                  // Any button except MODE during overlay cancels it
                  BTN_START_RELEASE: {
                    target: 'None',
                    actions: ['cancelShutdownPrompt', 'restoreResolvedScreen'],
                  },
                  // MODE confirms shutdown
                  BTN_MODE_RELEASE: {
                    target: 'None',
                    internal: false,
                    // Internal transition to workflow.ReadyToBoot is handled by workflow state
                  },
                  CANCEL_SHUTDOWN_PROMPT: {
                    target: 'None',
                    actions: ['cancelShutdownPrompt', 'restoreResolvedScreen'],
                  },
                },
              },
            },
            on: {
              // From anywhere in overlay state, show overlay
              SHOW_SHUTDOWN_PROMPT: {
                target: '.ShutdownPrompt',
              },
            },
          },
        },
        // When BTN_MODE_RELEASE happens in overlay.ShutdownPrompt with guard isOverlayActive,
        // we need to transition workflow to ReadyToBoot.
        // This requires special handling via exit actions or separate event.
      },
    },
  },
  {
    actions: machineActions as any,
    guards: guards as any,
  },
) as any;

// Helper: Create initial state with proper action execution
export function getInitialMachineState() {
  return kerberTMachine.initialState;
}

