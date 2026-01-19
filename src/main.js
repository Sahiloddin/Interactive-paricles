import './style.css'
import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem.js';
import { HandTracker } from './HandTracker.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Setup basic Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 8;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Tone mapping for better bloom
renderer.toneMapping = THREE.ReinhardToneMapping;
document.querySelector('#app').appendChild(renderer.domElement);

// Post-Processing: Bloom
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.1;
bloomPass.strength = 1.2; // Intensity
bloomPass.radius = 0.5;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Init Particle System
const particleSystem = new ParticleSystem(scene, 8000);

// Hand Tracking
const handTracker = new HandTracker();
handTracker.start();

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  // Get Data
  let handData = handTracker.getData();

  // Coordinate Mapping
  if (handData && handData.position) {
    const vHeight = 12.5;
    const vWidth = vHeight * camera.aspect;

    // HandTracker now returns -1..1 logic
    handData.position.x = handData.position.x * (vWidth / 2);
    handData.position.y = handData.position.y * (vHeight / 2);
  }

  particleSystem.update(elapsedTime, handData);

  // Interaction Logic (Gestures -> Behaviors)
  if (handData) {
    // Swipe Detection -> Trigger Wave
    if (handData.swipe && handData.swipe !== 'none') {
      particleSystem.triggerWave();
      console.log("Swipe Detected:", handData.swipe);
    }

    // Gestures
    if (handData.gesture === 'open') {
      if (particleSystem.currentTarget !== 'sphere') particleSystem.setTarget('sphere');
      particleSystem.setExpanded(true); // Open palm expands
      particleSystem.setAttract(false);
    } else if (handData.gesture === 'fist') {
      // Fist -> Collapse / Attract
      // if (particleSystem.currentTarget !== 'cube') particleSystem.setTarget('cube');
      particleSystem.setExpanded(false);
      particleSystem.setAttract(true);
    } else if (handData.gesture === 'pinch') {
      // Pinch -> High Glow / Attract
      // particleSystem.setTarget('random');
      particleSystem.setAttract(true);
    } else {
      particleSystem.setExpanded(false);
      particleSystem.setAttract(false);
    }
  } else {
    // Auto demo cycle
    if (Math.floor(elapsedTime) % 15 === 0 && Math.floor(elapsedTime) % 30 < 15) {
      if (particleSystem.currentTarget !== 'saturn') particleSystem.setTarget('saturn');
    } else {
      if (particleSystem.currentTarget !== 'random') particleSystem.setTarget('random');
    }
  }

  // renderer.render(scene, camera);
  composer.render();
}

animate();
