/**
 * Utility to inspect GLB model structure
 * Run this to see all node names and animations in the model
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

export async function inspectGLBModel() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    'https://www.gstatic.com/draco/versioned/draco_wasm_wrapper.js'
  );

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  try {
    const gltf = await loader.loadAsync('/models/kerber-t-demo.glb');
    const model = gltf.scene;

    console.log('=== GLB MODEL STRUCTURE ===');
    console.log('Model:', model.name);

    // Log all nodes recursively
    console.log('\n📦 NODE NAMES:');
    const nodeNames: string[] = [];
    model.traverse((obj: any) => {
      if (obj !== model) {
        const indent = '  '.repeat(obj.parent ? getDepth(obj) : 0);
        console.log(`${indent}• ${obj.name} (${obj.type})`);
        nodeNames.push(obj.name);
      }
    });

    console.log('\n✨ ANIMATIONS:');
    if (gltf.animations.length === 0) {
      console.log('  (no animations found)');
    } else {
      gltf.animations.forEach((clip) => {
        console.log(`  • ${clip.name} (${clip.duration.toFixed(2)}s)`);
      });
    }

    // Log as JSON for easy copy-paste
    console.log('\n📋 NODE NAMES AS ARRAY:');
    console.log(JSON.stringify(nodeNames, null, 2));

    console.log('\n📋 ANIMATION NAMES AS ARRAY:');
    console.log(
      JSON.stringify(
        gltf.animations.map((c) => c.name),
        null,
        2
      )
    );
  } catch (err) {
    console.error('Failed to load GLB:', err);
  }
}

function getDepth(obj: any): number {
  let depth = 0;
  let current = obj.parent;
  while (current) {
    depth++;
    current = current.parent;
  }
  return depth;
}
