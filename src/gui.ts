/**
 * Debug GUI (lil-gui)
 * Provides manual state switching, parameter tweaking, and scenario testing
 */

import GUI from 'lil-gui';
import { Interpreter } from 'xstate';
import { KerberTContext, MachineEvent } from './types';

export function setupDebugGUI(machineService: Interpreter<KerberTContext, any, MachineEvent, any>) {
  const gui = new GUI({ title: 'Kerber-T Debug' });
  gui.close();

  // Current state display (read-only)
  const stateDisplay = { current: '' };
  const stateController = gui.add(stateDisplay, 'current').name('Current State').listen();
  stateController.disable();

  // Power state
  const powerFolder = gui.addFolder('Power');
  powerFolder.add({ powerOn: () => machineService.send({ type: 'ROCKER_ON' }) }, 'powerOn').name('Power ON');
  powerFolder.add({ powerOff: () => machineService.send({ type: 'ROCKER_OFF' }) }, 'powerOff').name('Power OFF');

  // Mechanical controls
  const mechanicsFolder = gui.addFolder('Mechanics');
  mechanicsFolder
    .add(
      {
        nozzleToggle: () => machineService.send({ type: 'NOZZLE_TOGGLE' }),
      },
      'nozzleToggle',
    )
    .name('Toggle Nozzle');
  mechanicsFolder
    .add(
      {
        modeLatchToggle: () => machineService.send({ type: 'MODE_LATCH_TOGGLE' }),
      },
      'modeLatchToggle',
    )
    .name('Toggle Mode Latch');
  mechanicsFolder
    .add(
      {
        batteryLowerToggle: () => machineService.send({ type: 'BATTERY_CLIP_LOWER_TOGGLE' }),
      },
      'batteryLowerToggle',
    )
    .name('Toggle Battery Lower');
  mechanicsFolder
    .add(
      {
        batteryUpperToggle: () => machineService.send({ type: 'BATTERY_CLIP_UPPER_TOGGLE' }),
      },
      'batteryUpperToggle',
    )
    .name('Toggle Battery Upper');

  // Electronic controls
  const controlsFolder = gui.addFolder('Controls');
  controlsFolder
    .add(
      {
        btnStartPress: () => machineService.send({ type: 'BTN_START_RELEASE' }),
      },
      'btnStartPress',
    )
    .name('BTN START Release');
  controlsFolder
    .add(
      {
        btnModePress: () => machineService.send({ type: 'BTN_MODE_RELEASE' }),
      },
      'btnModePress',
    )
    .name('BTN MODE Release');
  controlsFolder
    .add(
      {
        btnModeLongPress: () => machineService.send({ type: 'BTN_MODE_LONGPRESS' }),
      },
      'btnModeLongPress',
    )
    .name('BTN MODE Long Press');

  // Workflow state manual transitions
  const workflowFolder = gui.addFolder('Workflow');
  const workflowStates = ['ReadyToBoot', 'Booting', 'Warmup', 'ContinuousSearch', 'SearchWithStop'];
  const workflowControl = { state: 'ReadyToBoot' };
  workflowFolder
    .add(workflowControl, 'state', workflowStates)
    .name('Go to State')
    .onChange((value: string) => {
      const current = machineService.state;
      if (current.value === 'PowerOff') {
        machineService.send({ type: 'ROCKER_ON' });
      }
      machineService.send({
        type: 'DEBUG_SET_WORKFLOW',
        workflowState: value as any,
      });
    });

  // Overlay management
  const overlayFolder = gui.addFolder('Overlay');
  overlayFolder
    .add(
      {
        showShutdown: () => machineService.send({ type: 'SHOW_SHUTDOWN_PROMPT' }),
      },
      'showShutdown',
    )
    .name('Show Shutdown Prompt');
  overlayFolder
    .add(
      {
        cancelShutdown: () => machineService.send({ type: 'CANCEL_SHUTDOWN_PROMPT' }),
      },
      'cancelShutdown',
    )
    .name('Cancel Shutdown');

  // Context display
  const contextFolder = gui.addFolder('Context');
  const contextDisplay = {
    powerState: '',
    deviceWorkflowState: '',
    nozzleCover: '',
    modeLatch: '',
    batteryClipLower: '',
    batteryClipUpper: '',
    screenPresentationMode: '',
  };

  for (const key of Object.keys(contextDisplay)) {
    const controller = contextFolder.add(contextDisplay, key as any).name(key).listen();
    controller.disable();
  }

  const renderState = (snapshot: any) => {
    const state = snapshot.value;
    const context = snapshot.context;

    // Update state display
    if (typeof state === 'object') {
      const keys = Object.keys(state as any);
      stateDisplay.current = `${keys.join(', ')}`;
    } else {
      stateDisplay.current = String(state);
    }

    // Update context display
    contextDisplay.powerState = context.powerState;
    contextDisplay.deviceWorkflowState = context.deviceWorkflowState;
    contextDisplay.nozzleCover = context.nozzleCover;
    contextDisplay.modeLatch = context.modeLatch;
    contextDisplay.batteryClipLower = context.batteryClipLower;
    contextDisplay.batteryClipUpper = context.batteryClipUpper;
    contextDisplay.screenPresentationMode = context.screenPresentationMode;
    workflowControl.state = context.deviceWorkflowState;
  };

  // Initialize immediately from current state (so it is never blank)
  renderState(machineService.state as any);

  // XState v4-compatible subscription
  machineService.onTransition((state) => {
    renderState(state as any);
  });

  return gui;
}
