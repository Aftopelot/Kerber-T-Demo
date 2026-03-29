/**
 * Asset Loading
 * Loads GLB model with Draco decompression and screen textures
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { SCREEN_ASSET_MAP } from './config';
import { ScreenAssets } from './types';

export interface LoadAssetsResult {
  model: THREE.Group;
  animations: THREE.AnimationClip[];
  screenAssets: ScreenAssets;
}

export async function loadAssets(): Promise<LoadAssetsResult> {
  // Setup DRACO decompression
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  // Load GLB model
  const gltf = await gltfLoader.loadAsync('/models/kerber-t-demo.glb');
  const model = gltf.scene as THREE.Group;
  const animations = gltf.animations || [];
  
  // Log model structure
  const nodeNames: string[] = [];
  model.traverse((obj) => { nodeNames.push(obj.name); });
  console.log('[LoadAssets] Node names:', nodeNames);
  console.log('[LoadAssets] Animations:', animations.map((c) => c.name));

  // Load screen textures
  const textureLoader = new THREE.TextureLoader();
  const screenAssets: ScreenAssets = {};

  // Load all screen textures from config
  const screenKeys = Object.keys(SCREEN_ASSET_MAP) as string[];
  for (const key of screenKeys) {
    const path = SCREEN_ASSET_MAP[key as any];
    try {
      const texture = await textureLoader.loadAsync(path);
      // Ensure correct color space for screen textures
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      screenAssets[key] = texture;
    } catch (error) {
      console.warn(`Failed to load screen asset: ${key} from ${path}`, error);
      // Create 1x1 black fallback texture
      const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
      fallback.colorSpace = THREE.SRGBColorSpace;
      fallback.flipY = false;
      screenAssets[key] = fallback;
    }
  }

  return { model, animations, screenAssets };
}
