/**
 * Scene Setup
 * Initializes THREE.Scene, Camera, Renderer, and OrbitControls
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { SCENE_CONFIG } from './config';

export interface SceneSetupResult {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  orbitControls: OrbitControls;
}

export function setupScene(canvas: HTMLCanvasElement): SceneSetupResult {
  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);
  scene.fog = new THREE.Fog(SCENE_CONFIG.backgroundColor, 500, 1000);

  // Camera
  const camera = new THREE.PerspectiveCamera(
    SCENE_CONFIG.cameraFov,
    window.innerWidth / window.innerHeight,
    SCENE_CONFIG.cameraNear,
    SCENE_CONFIG.cameraFar,
  );
  camera.position.set(
    SCENE_CONFIG.cameraPosition.x,
    SCENE_CONFIG.cameraPosition.y,
    SCENE_CONFIG.cameraPosition.z,
  );

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  // OrbitControls
  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enabled = SCENE_CONFIG.orbitControlsEnabled;
  orbitControls.autoRotate = SCENE_CONFIG.orbitControlsAutoRotate;
  orbitControls.autoRotateSpeed = SCENE_CONFIG.orbitControlsAutoRotateSpeed;
  orbitControls.dampingFactor = 0.05;
  orbitControls.enableDamping = true;
  orbitControls.enableZoom = true;
  orbitControls.zoomSpeed = 4.0;
  orbitControls.enablePan = true;

  // Presentation Surface (optional floor for visual context)
  if (SCENE_CONFIG.presentationSurfaceEnabled) {
    const planeGeometry = new THREE.PlaneGeometry(20, 20);
    // Transparent catcher: keeps depth for SAO/contact shading but stays visually invisible.
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0,
      roughness: 1.0,
      metalness: 0.0,
    });
    planeMaterial.depthWrite = true;
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.name = 'ShadowCatcherFloor';
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    plane.receiveShadow = false;
    scene.add(plane);
  }

  // Handle window resize
  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
  };
  window.addEventListener('resize', handleResize);

  return { scene, camera, renderer, orbitControls };
}

export function animateScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  orbitControls: OrbitControls,
  onFrame: () => void,
) {
  const animate = () => {
    requestAnimationFrame(animate);
    orbitControls.update();
    onFrame();
    renderer.render(scene, camera);
  };
  animate();
}
