import * as THREE from '../vendor/three.module.js';
import { detachUpright, cameraTilt, createDottedGuide } from './scene-helpers.js';
import { createState, createGait, advanceGait, gaitBodyOffset, gaitArmSwing, gaitLegPose, plantingPose, cameraRelativeMovement, followCameraTurn, digAlignment, nextSerpentinePlot, createApproach, advanceApproach, PHASES, PLOT_COUNT, PLOT_COLUMNS, PLOT_ROWS, MOVEMENT_RADIUS, WALK_RADIUS, MACHINE_PICKUP_REACH, TOOL_TYPES, REST_DOOR, REST_GROWTH_SECONDS, WATER_SWITCH, IRRIGATION_SECONDS, advance, rest, isNight, nearRestDoor, nearWaterSwitch, canStartIrrigation, completeIrrigation, growthStage, canWork, shouldGuideToMachine, isTillerRunning, completeWork, startNextCycle, phaseProgress } from './simulation.js';
import { pressKeyboardKey, readGamepad, newlyPressed, joystickVector, createTouchCamera, wheelZoomDelta } from './controls.js';
import { controllerType, promptButtons, promptText, isFaceButton, updateControllerPrompts } from './controller-prompts.js';
import { createGamepadMenu } from './gamepad-menu.js';
import { loadProgress, saveProgress, resetProgress } from './persistence.js';
import { SILO_RADIUS, SILO_HEIGHT, SILO_FLOOR_HEIGHT, SILO_POTATO_SCALE, SILO_CAPACITY, validateSiloPreview, siloPotatoPose, siloFallOffset, siloRainStep } from './silo.js';
import { setupMusic } from './music.js';
import { marsSky } from './sky.js';
import { createHaptics } from './haptics.js';
import { createSoundEffects, loadSoundVolumes, saveSoundVolumes } from './sound-effects.js';
import { TERRAIN_WIDTH, TERRAIN_SEGMENTS, terrainHeight } from './terrain.js';

const $ = id => document.getElementById(id);
setupMusic($('background-music'), document.querySelectorAll('[data-music-toggle]'), window, $('music-status'));
const sounds = createSoundEffects(
  () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio is not supported by this browser.');
    return new AudioContext();
  },
  url => fetch(url),
  error => {
    console.error('Unable to play sound effects:', error);
    $('sound-status').textContent = 'Sound effects could not load. Check browser audio support and open the app through a web server.';
    $('sound-status').hidden = false;
  }
);
window.addEventListener('pointerdown', sounds.unlock, true);
window.addEventListener('keydown', sounds.unlock, true);
const toolSounds = { furrow: 'plow', hill: 'plow', drill: 'drill', harvest: 'harvest' };
let storage = null, saved = null, savingBlocked = false, saveFailed = false;
try {
  storage = window.localStorage;
  saved = loadProgress(storage);
} catch (error) {
  savingBlocked = true;
  console.error('Unable to load saved progress:', error);
  $('save-status').textContent = 'SAVE UNAVAILABLE · CHECK SITE STORAGE';
  $('save-status').classList.add('save-error');
}
let mixerStorage = null, mixerSavingBlocked = false, previewButton = null;
try {
  mixerStorage = window.localStorage;
  const savedVolumes = loadSoundVolumes(mixerStorage);
  if (savedVolumes) {
    for (const [name, volume] of Object.entries(savedVolumes)) sounds.setVolume(name, volume);
  }
} catch (error) {
  mixerSavingBlocked = true;
  console.error('Unable to load sound levels:', error);
  $('audio-mixer-status').textContent = 'Sound levels could not be loaded or saved. Check browser site storage.';
  $('audio-mixer-status').classList.add('error-text');
}
function stopPreview() {
  sounds.setLoop('preview', null);
  if (previewButton) {
    previewButton.setAttribute('aria-pressed', 'false');
    previewButton.textContent = 'PREVIEW';
    previewButton = null;
  }
}
const soundLabels = {
  tiller: 'Rotary tiller', drill: 'Auger', attach: 'Tool attachment',
  pickup: 'Potato pickup', plow: 'Plow', harvest: 'Lifter', water: 'Irrigation'
};
for (const [name, volume] of Object.entries(sounds.getVolumes())) {
  const row = document.createElement('div'), label = document.createElement('label');
  const output = document.createElement('output'), slider = document.createElement('input');
  const preview = document.createElement('button');
  row.className = 'audio-mixer-row';
  slider.type = 'range'; slider.min = '0'; slider.max = '200'; slider.step = '1';
  slider.id = `sound-volume-${name}`; slider.value = String(Math.round(volume * 100));
  label.htmlFor = slider.id; label.textContent = soundLabels[name];
  output.setAttribute('for', slider.id); output.textContent = `${slider.value}%`;
  preview.type = 'button'; preview.textContent = 'PREVIEW';
  preview.setAttribute('aria-label', `Preview ${soundLabels[name]}`);
  preview.setAttribute('aria-pressed', 'false');
  slider.addEventListener('input', () => {
    sounds.setVolume(name, slider.valueAsNumber / 100);
    output.textContent = `${slider.value}%`;
    if (mixerSavingBlocked) return;
    try {
      saveSoundVolumes(mixerStorage, sounds.getVolumes());
      $('audio-mixer-status').textContent = 'Sound levels saved on this device.';
      $('audio-mixer-status').classList.remove('error-text');
    } catch (error) {
      console.error('Unable to save sound levels:', error);
      $('audio-mixer-status').textContent = 'Sound levels could not be saved. Check browser site storage.';
      $('audio-mixer-status').classList.add('error-text');
    }
  });
  preview.addEventListener('click', () => {
    const wasPlaying = previewButton === preview;
    stopPreview();
    if (!wasPlaying) {
      previewButton = preview;
      preview.setAttribute('aria-pressed', 'true');
      preview.textContent = 'STOP';
      sounds.setLoop('preview', name);
    }
  });
  row.append(label, output, slider, preview);
  $('audio-mixer-controls').append(row);
}
$('audio-mixer').addEventListener('toggle', () => { if (!$('audio-mixer').open) stopPreview(); });
const state = saved ? saved.state : createState();
const gait = createGait();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8916e);
scene.fog = new THREE.Fog(0xc8916e, 45, 80);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
} catch (error) {
  $('error').hidden = false;
  $('error').textContent = 'The 3D view could not start. Please enable WebGL or try a current browser. ' + error.message;
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('scene').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 150);
const hemi = new THREE.HemisphereLight(0xffefd7, 0x594638, 2.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6c6, 2.5);
sun.position.set(-8, 15, 5);
scene.add(sun);

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });
const mat = {
  orange: material(0xe98939), orangeDark: material(0xa85425), black: material(0x252c29),
  rubber: material(0x343b37), tread: material(0x515951), steel: material(0xb9c4b8),
  darkSteel: material(0x6a7770), white: material(0xe5e2ce), suit: material(0xcdd4c7),
  suitDark: material(0x8d9f95), visor: material(0x304f50, { metalness: 0.35, roughness: 0.3 }),
  red: material(0xc76c49), dirt: material(0x76513b), floor: material(0xa58e74),
  green: material(0x719765), leaf: material(0x67965e), leafLight: material(0x9abb7d),
  cream: material(0xe7dcbf), potato: material(0xc69b65), light: new THREE.MeshBasicMaterial({ color: 0xffe5a7 }),
  blue: material(0x799f9e), glass: new THREE.MeshBasicMaterial({ color: 0xb9d6c6, transparent: true, opacity: 0.095, side: THREE.DoubleSide, depthWrite: false })
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
function box(parent, m, x, y, z, sx, sy, sz, rotation = 0) {
  const mesh = new THREE.Mesh(boxGeo, m);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.y = rotation;
  parent.add(mesh); return mesh;
}
function sphere(parent, m, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(sphereGeo, m);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
}
function cylinder(parent, m, x, y, z, radius, height, rotation = 0) {
  const mesh = new THREE.Mesh(cylinderGeo, m);
  mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius); mesh.rotation.z = rotation;
  parent.add(mesh); return mesh;
}
function rod(parent, m, a, b, radius) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(cylinderGeo, m);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.scale.set(radius, start.distanceTo(end), radius);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  parent.add(mesh); return mesh;
}

const terrainRenderWidth = TERRAIN_WIDTH * 1.5;
const terrainRenderSegments = TERRAIN_SEGMENTS * 1.5;
const terrainGeometry = new THREE.PlaneGeometry(terrainRenderWidth, terrainRenderWidth, terrainRenderSegments, terrainRenderSegments);
const terrainVertices = terrainGeometry.attributes.position, terrainUVs = terrainGeometry.attributes.uv;
for (let i = 0; i < terrainVertices.count; i++) {
  const x = terrainVertices.getX(i), y = terrainVertices.getY(i);
  terrainVertices.setZ(i, terrainHeight(x, -y));
  terrainUVs.setXY(i, x / TERRAIN_WIDTH + 0.5, y / TERRAIN_WIDTH + 0.5);
}
terrainGeometry.computeVertexNormals();
const terrainTexture = new THREE.TextureLoader().load('assets/jezero-ctx.png', undefined, undefined, error => {
  console.error('Unable to load Jezero terrain imagery:', error);
  $('error').textContent = 'The Jezero terrain image could not load. Check the local assets and reload.';
  $('error').hidden = false;
});
terrainTexture.colorSpace = THREE.SRGBColorSpace;
const terrain = new THREE.Mesh(terrainGeometry, material(0xd7ae99, { map: terrainTexture }));
terrain.rotation.x = -Math.PI / 2;
scene.add(terrain);
const nightSky = new THREE.Group(); scene.add(nightSky);
const starMaterial = new THREE.MeshBasicMaterial({ color: 0xe7ede6, transparent: true, fog: false });
for (let i = 0; i < 120; i++) {
  const angle = i * 2.39996, altitude = (i + 0.5) / 120;
  const horizontal = Math.sqrt(1 - altitude * altitude) * 55;
  sphere(nightSky, starMaterial, Math.sin(angle) * horizontal, altitude * 55, Math.cos(angle) * horizontal, 0.04, 0.04, 0.04);
}
nightSky.visible = false;
const skyDistance = 60;
const skySun = sphere(scene, new THREE.MeshBasicMaterial({ color: 0xffe2a8, fog: false }), 0, 0, 0, 1, 1, 1);
skySun.name = 'sky-sun';
const phobosGeometry = new THREE.IcosahedronGeometry(1, 2);
const phobosVertices = phobosGeometry.attributes.position;
for (let i = 0; i < phobosVertices.count; i++) {
  const x = phobosVertices.getX(i), y = phobosVertices.getY(i), z = phobosVertices.getZ(i);
  const variation = 1 + 0.07 * Math.sin(x * 13 + y * 17 + z * 19);
  phobosVertices.setXYZ(i, x * variation * 1.12, y * variation * 0.87, z * variation);
}
phobosGeometry.computeVertexNormals();
const phobosMaterial = new THREE.ShaderMaterial({
  uniforms: { sunDirection: { value: new THREE.Vector3() } },
  vertexShader: 'varying vec3 worldNormal; void main() { worldNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 sunDirection; varying vec3 worldNormal; void main() { float light = 0.08 + 0.92 * max(dot(normalize(worldNormal), sunDirection), 0.0); gl_FragColor = vec4(vec3(0.75, 0.70, 0.64) * light, 1.0); }'
});
const skyPhobos = new THREE.Mesh(phobosGeometry, phobosMaterial);
skyPhobos.name = 'sky-phobos'; scene.add(skyPhobos);
const skyDeimos = sphere(scene, new THREE.MeshBasicMaterial({ color: 0xe3d6c3, fog: false }), 0, 0, 0, 1, 1, 1);
skyDeimos.name = 'sky-deimos';
let randomSeed = 4301;
function random() {
  randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
  return randomSeed / 4294967296;
}
const exteriorRocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material(0x987263), 300);
const instanceTransform = new THREE.Object3D();
for (let i = 0; i < exteriorRocks.count; i++) {
  const angle = random() * Math.PI * 2, radius = 11 + random() * 18, size = 0.08 + random() * 0.42;
  const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  instanceTransform.position.set(x, terrainHeight(x, z) + size * 0.25, z);
  instanceTransform.scale.set(size, size * (0.25 + random() * 0.5), size * (0.6 + random()));
  instanceTransform.rotation.set(random(), random() * Math.PI, random());
  instanceTransform.updateMatrix(); exteriorRocks.setMatrixAt(i, instanceTransform.matrix);
}
scene.add(exteriorRocks);

const silo = new THREE.Group();
silo.position.set(-10, 0, -10);
scene.add(silo);
const siloRadius = SILO_RADIUS, siloHeight = SILO_HEIGHT;
const siloFrame = material(0x9caea6, { metalness: 0.5, roughness: 0.45 });
const siloGlass = new THREE.MeshBasicMaterial({ color: 0xd7e9df, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
cylinder(silo, mat.darkSteel, 0, SILO_FLOOR_HEIGHT / 2, 0, siloRadius + 0.2, SILO_FLOOR_HEIGHT);
const siloWalls = new THREE.Mesh(new THREE.CylinderGeometry(siloRadius, siloRadius, siloHeight, 24, 1, true), siloGlass);
siloWalls.position.y = siloHeight / 2; silo.add(siloWalls);
for (let i = 0; i < 8; i++) {
  const angle = i * Math.PI / 4;
  cylinder(silo, siloFrame, Math.cos(angle) * siloRadius, siloHeight / 2, Math.sin(angle) * siloRadius, 0.065, siloHeight);
}
const siloRings = new THREE.InstancedMesh(new THREE.TorusGeometry(siloRadius, 0.055, 5, 24), siloFrame, Math.ceil(siloHeight / 2.4));
for (let i = 0; i < siloRings.count; i++) {
  instanceTransform.position.set(0, i * 2.4 + 0.2, 0);
  instanceTransform.rotation.set(-Math.PI / 2, 0, 0);
  instanceTransform.scale.set(1, 1, 1); instanceTransform.updateMatrix();
  siloRings.setMatrixAt(i, instanceTransform.matrix);
}
silo.add(siloRings);
const siloPotatoes = new THREE.InstancedMesh(sphereGeo, mat.potato, SILO_CAPACITY);
siloPotatoes.count = 0;
siloPotatoes.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, siloHeight / 2, 0), Math.hypot(siloHeight / 2, siloRadius));
silo.add(siloPotatoes);
let displayedHarvest = -1, siloPreview = null, siloFalling = [], siloTarget = 0, siloRainCredit = 0;
function setSiloPotato(index, elapsed = Infinity) {
  const pose = siloPotatoPose(index);
  instanceTransform.position.set(pose.x, pose.y + siloFallOffset(index, pose.y, elapsed), pose.z);
  instanceTransform.rotation.set(pose.tiltX, pose.yaw, pose.tiltZ);
  instanceTransform.scale.set(SILO_POTATO_SCALE.x, SILO_POTATO_SCALE.y, SILO_POTATO_SCALE.z); instanceTransform.updateMatrix();
  siloPotatoes.setMatrixAt(index, instanceTransform.matrix);
}
function updateSilo(total) {
  if (total === displayedHarvest) return;
  siloTarget = Math.min(total, SILO_CAPACITY);
  if (displayedHarvest < 0) {
    siloPotatoes.count = siloTarget;
    for (let i = 0; i < siloTarget; i++) setSiloPotato(i);
    siloPotatoes.instanceMatrix.needsUpdate = true;
  } else if (siloTarget < siloPotatoes.count) {
    siloPotatoes.count = siloTarget;
    siloFalling = siloFalling.filter(({ index }) => index < siloTarget);
  }
  if (siloTarget <= siloPotatoes.count) siloRainCredit = 0;
  displayedHarvest = total;
}
function animateSilo(now, dt) {
  if (!siloFalling.length && siloPotatoes.count === siloTarget) return;
  siloFalling = siloFalling.filter(({ index, startTime }) => {
    const elapsed = (now - startTime) / 1000;
    setSiloPotato(index, elapsed);
    return elapsed < 1.8;
  });
  const step = siloRainStep(siloTarget - siloPotatoes.count, siloFalling.length, siloRainCredit, dt);
  siloRainCredit = step.credit;
  for (let i = 0; i < step.count; i++) {
    const index = siloPotatoes.count++;
    siloFalling.push({ index, startTime: now });
    setSiloPotato(index, 0);
  }
  siloPotatoes.instanceMatrix.needsUpdate = true;
}

const dirtCanvas = document.createElement('canvas');
dirtCanvas.width = dirtCanvas.height = 256;
const dirtContext = dirtCanvas.getContext('2d');
if (!dirtContext) {
  $('error').hidden = false;
  $('error').textContent = 'The greenhouse dirt texture could not be created. Please try a current browser.';
  throw new Error('Canvas 2D is not supported.');
}
dirtContext.fillStyle = '#e2ded7';
dirtContext.fillRect(0, 0, 256, 256);
let dirtSeed = 1437;
function dirtRandom() {
  dirtSeed = (dirtSeed * 1664525 + 1013904223) >>> 0;
  return dirtSeed / 4294967296;
}
for (let i = 0; i < 6000; i++) {
  const x = dirtRandom() * 256, y = dirtRandom() * 256, size = 0.5 + dirtRandom() * 2;
  dirtContext.fillStyle = i % 3 ? 'rgba(70, 56, 44, 0.13)' : 'rgba(255, 249, 235, 0.23)';
  dirtContext.fillRect(x, y, size, size * (0.5 + dirtRandom()));
}
const dirtTexture = new THREE.CanvasTexture(dirtCanvas);
dirtTexture.colorSpace = THREE.SRGBColorSpace;
dirtTexture.wrapS = dirtTexture.wrapT = THREE.RepeatWrapping;
dirtTexture.repeat.set(6, 6);
const tilledCanvas = document.createElement('canvas');
tilledCanvas.width = tilledCanvas.height = 256;
const tilledContext = tilledCanvas.getContext('2d');
if (!tilledContext) {
  $('error').hidden = false;
  $('error').textContent = 'The tilled soil texture could not be created. Please try a current browser.';
  throw new Error('Canvas 2D is not supported.');
}
tilledContext.drawImage(dirtCanvas, 0, 0);
tilledContext.fillStyle = 'rgba(57, 39, 27, 0.3)';
for (let i = 0; i < 1800; i++) {
  const x = dirtRandom() * 256, y = dirtRandom() * 256;
  tilledContext.fillRect(x, y, 2 + dirtRandom() * 6, 0.5 + dirtRandom() * 2);
}
const tilledTexture = new THREE.CanvasTexture(tilledCanvas);
tilledTexture.colorSpace = THREE.SRGBColorSpace;
const domeGround = new THREE.Mesh(new THREE.CircleGeometry(10, 64), material(0x937158, { map: dirtTexture }));
domeGround.rotation.x = -Math.PI / 2;
domeGround.position.y = 0.08;
scene.add(domeGround);
const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass);
dome.position.y = 0.06; scene.add(dome);
const ribMat = material(0x899f90);
for (let i = 0; i < 8; i++) {
  const points = [];
  for (let j = 0; j <= 32; j++) {
    const theta = j / 32 * Math.PI;
    points.push(new THREE.Vector3(Math.cos(theta) * 10, Math.sin(theta) * 10 + 0.1, 0));
  }
  const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.055, 5, false), ribMat);
  rib.rotation.y = i * Math.PI / 8; scene.add(rib);
}
const rim = new THREE.Mesh(new THREE.TorusGeometry(10, 0.1, 6, 64), ribMat);
rim.rotation.x = Math.PI / 2; rim.position.y = 0.15; scene.add(rim);

const growLights = new THREE.Group(); growLights.name = 'grow-lights'; scene.add(growLights);
const growLamp = material(0xffe1f1, { emissive: 0xffa4d5, emissiveIntensity: 0.7 });
for (let row = 0; row < PLOT_ROWS; row++) {
  const z = (row - (PLOT_ROWS - 1) / 2) * 2.1 - 0.3;
  const y = Math.sqrt(100 - 4.5 ** 2 - z ** 2) - 0.35;
  box(growLights, mat.darkSteel, 0, y, z, 9.1, 0.14, 0.27);
  box(growLights, growLamp, 0, y - 0.09, z, 8.9, 0.05, 0.2);
  for (const x of [-3.8, 3.8]) {
    const ceiling = Math.sqrt(100 - x ** 2 - z ** 2);
    rod(growLights, mat.darkSteel, [x, y + 0.07, z], [x, ceiling - 0.08, z], 0.025);
  }
  const light = new THREE.PointLight(0xffd7ec, 17, 15, 2);
  light.position.set(0, y - 0.2, z); growLights.add(light);
}

// Habitat and infrastructure sit behind the beds, outside the playable dome.
const hab = new THREE.Group(); hab.position.set(0, 0, -14); scene.add(hab);
box(hab, mat.suit, 0, 2, 0, 8, 4, 4);
box(hab, mat.white, 0, 4.1, 0, 8.4, 0.25, 4.4);
box(hab, mat.darkSteel, 0, 1.5, 2.05, 2.4, 3, 0.15);
box(hab, mat.visor, 0, 1.6, 2.15, 1.4, 2.3, 0.1);
box(hab, mat.orange, 0, 3.25, 2.17, 1.8, 0.12, 0.12);
for (const x of [-3, 3]) {
  box(hab, mat.visor, x, 2.5, 2.08, 1.15, 0.8, 0.1);
  box(hab, mat.darkSteel, x, 0.65, 2.08, 1.3, 0.3, 0.1);
}
box(scene, mat.suitDark, 0, 1.4, -10.6, 2.7, 2.8, 3);
box(scene, mat.black, 0, 1.4, -9.05, 1.65, 2.2, 0.1);
box(scene, mat.orange, 0, 2.8, -9, 2.4, 0.14, 0.16);
const doorBeacon = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.66, 32), new THREE.MeshBasicMaterial({ color: 0x7cc9ff, side: THREE.DoubleSide }));
doorBeacon.rotation.x = -Math.PI / 2; doorBeacon.position.set(REST_DOOR.x, 0.19, -7.5); scene.add(doorBeacon);
doorBeacon.visible = false;
// Utility cabinets, reservoir and lighting reinforce the life-support concept.
for (const side of [-1, 1]) {
  box(scene, mat.suit, side * 8.7, 0.8, -2, 1.1, 1.6, 2);
  box(scene, mat.orange, side * 8.7, 1.15, -0.95, 0.7, 0.12, 0.06);
  cylinder(scene, mat.blue, side * 8.7, 1.8, -2.5, 0.5, 0.8);
  rod(scene, mat.darkSteel, [side * 7.5, 0, -5.6], [side * 7.5, 4, -5.6], 0.06);
  rod(scene, mat.darkSteel, [side * 7.5, 4, -5.6], [side * 5.7, 4, -5.6], 0.06);
  box(scene, mat.light, side * 6.6, 3.95, -5.6, 1.8, 0.08, 0.25);
}
box(scene, mat.orange, WATER_SWITCH.x + 0.04, 1.15, WATER_SWITCH.z, 0.1, 0.28, 0.34);
box(scene, mat.cream, WATER_SWITCH.x + 0.1, 1.15, WATER_SWITCH.z, 0.05, 0.14, 0.16);
const switchBeacon = new THREE.Group(); switchBeacon.position.set(WATER_SWITCH.x + 0.5, 2.2, WATER_SWITCH.z); scene.add(switchBeacon);
const switchDiamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), material(0x169bff, { emissive: 0x1265b8, emissiveIntensity: 0.9 }));
switchBeacon.add(switchDiamond); switchBeacon.visible = false;
const objectiveGuide = createDottedGuide(scene);
const guideDestination = new THREE.Vector3();

const plots = [];
const soilDetails = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material(0x715741), PLOT_COUNT * 24);
const plotMaterial = [0x6f513e, 0x39271d, 0x3e291e, 0x443026, 0x70503a, 0x5c4232, 0x543b2d, 0x5c4232, 0x795b43]
  .map(color => material(color, { transparent: true, opacity: 0.55, depthWrite: false }));
plotMaterial[1].map = tilledTexture;
plotMaterial[1].opacity = 0.95;
const furrows = new THREE.InstancedMesh(sphereGeo, material(0x79543b), PLOT_COUNT * 5);
const plantingHoles = new THREE.InstancedMesh(new THREE.CircleGeometry(0.24, 20), material(0x211711), PLOT_COUNT);
const plantedMounds = new THREE.InstancedMesh(sphereGeo, material(0x926b4b), PLOT_COUNT);
const dampSoil = new THREE.InstancedMesh(new THREE.CircleGeometry(0.55, 24), material(0x302721), PLOT_COUNT);
const waterGlints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.055, 8), material(0x86a9a4), PLOT_COUNT * 3);
scene.add(soilDetails, furrows, plantingHoles, dampSoil, plantedMounds, waterGlints);
function setPlotDetail(mesh, index, x, y, z, sx, sy, sz, flat = false) {
  instanceTransform.position.set(x, y, z);
  instanceTransform.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
  instanceTransform.scale.set(sx, sx === 0 ? 0 : sy, sx === 0 ? 0 : sz);
  instanceTransform.updateMatrix(); mesh.setMatrixAt(index, instanceTransform.matrix);
}
function updatePlotDetails(visual, index, stage) {
  const { x, z } = visual;
  for (let i = 0; i < 5; i++) {
    const visible = stage >= 2 && stage <= 3;
    setPlotDetail(furrows, index * 5 + i, x, 0.115, z + (i - 2) * 0.3, visible ? 0.75 : 0, 0.035, 0.075);
  }
  setPlotDetail(plantingHoles, index, x, 0.16, z, stage === 3 ? 1 : 0, 1, 1, true);
  setPlotDetail(plantedMounds, index, x, 0.12, z, stage >= 4 && stage <= 7 ? (stage >= 6 ? 0.55 : 0.32) : 0, stage >= 6 ? 0.18 : 0.1, 0.4);
  setPlotDetail(dampSoil, index, x, 0.108, z, stage >= 5 && stage <= 7 ? 1 : 0, 1, 1, true);
  for (let i = 0; i < 3; i++) {
    setPlotDetail(waterGlints, index * 3 + i, x + [-0.38, 0.4, 0][i], 0.112, z + [0.2, 0.1, -0.42][i], stage >= 5 && stage <= 7 ? 1 : 0, 0.55, 1, true);
  }
  for (const mesh of [furrows, plantingHoles, plantedMounds, dampSoil, waterGlints]) mesh.instanceMatrix.needsUpdate = true;
}
const plotEdges = [], plotGeometry = new THREE.PlaneGeometry(1.9, 2);
for (let row = 0; row < PLOT_ROWS; row++) {
  for (let col = 0; col < PLOT_COLUMNS; col++) {
    const index = row * PLOT_COLUMNS + col;
    const x = (col - (PLOT_COLUMNS - 1) / 2) * 2, z = (row - (PLOT_ROWS - 1) / 2) * 2.1 - 0.3;
    const group = new THREE.Group(); group.position.set(x, -0.2, z); scene.add(group);
    const soil = new THREE.Mesh(plotGeometry, plotMaterial[0]);
    soil.rotation.x = -Math.PI / 2; soil.position.y = 0.3; group.add(soil);
    soil.userData.plot = index;
    for (const [ax, az, bx, bz] of [[-0.95, -1, 0.95, -1], [0.95, -1, 0.95, 1], [0.95, 1, -0.95, 1], [-0.95, 1, -0.95, -1]]) {
      plotEdges.push(x + ax, 0.105, z + az, x + bx, 0.105, z + bz);
    }
    for (let n = 0; n < 24; n++) {
      const size = 0.025 + random() * 0.035;
      instanceTransform.position.set(x + (random() - 0.5) * 1.6, 0.11, z + (random() - 0.5) * 1.7);
      instanceTransform.scale.set(size * 1.5, size * 0.3, size);
      instanceTransform.rotation.set(0, random() * Math.PI, 0);
      instanceTransform.updateMatrix(); soilDetails.setMatrixAt(index * 24 + n, instanceTransform.matrix);
    }
    // Thin irrigation lines run below the growing surface.
    for (const dz of [-0.5, 0.5]) box(group, mat.black, 0, 0.31, dz, 1.7, 0.025, 0.035);
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.23, 0.27, 24), new THREE.MeshBasicMaterial({ color: 0xe9c78e, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2; marker.position.y = 0.33; group.add(marker);
    const selected = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.76, 4), new THREE.MeshBasicMaterial({ color: 0xffd69a, side: THREE.DoubleSide }));
    selected.rotation.x = -Math.PI / 2; selected.rotation.z = Math.PI / 4; selected.position.y = 0.35; selected.visible = false; group.add(selected);
    const plant = new THREE.Group(); plant.position.y = 0.31; group.add(plant);
    const stem = cylinder(plant, mat.green, 0, 0.36, 0, 0.045, 0.72);
    for (let n = 0; n < 6; n++) {
      const angle = n * Math.PI / 3;
      const leaf = sphere(plant, n % 2 ? mat.leaf : mat.leafLight, Math.cos(angle) * 0.22, 0.25 + (n % 3) * 0.14, Math.sin(angle) * 0.22, 0.28, 0.07, 0.13);
      leaf.rotation.y = -angle; leaf.rotation.z = (n % 2 ? -1 : 1) * 0.18;
    }
    const seed = sphere(group, mat.potato, 0, 0.33, 0, 0.12, 0.07, 0.09);
    seed.visible = false;
    const ready = new THREE.Group(); ready.position.y = 1.25; group.add(ready);
    sphere(ready, mat.orange, 0, 0, 0, 0.19, 0.19, 0.19);
    rod(ready, mat.orange, [0, -0.34, 0], [0, -0.12, 0], 0.025);
    plant.visible = false; ready.visible = false;
    plots.push({ group, soil, marker, selected, plant, seed, ready, x, z, lastStage: -1, lastGrowth: -1 });
  }
}
const plotGrid = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(plotEdges, 3)),
  new THREE.LineBasicMaterial({ color: 0xb9a080, transparent: true, opacity: 0.55 })
);
scene.add(plotGrid);

const dropletsPerRow = 36;
const sprayGeometry = new THREE.BufferGeometry();
sprayGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLOT_ROWS * dropletsPerRow * 3), 3));
const spray = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({ color: 0xb5e7f2, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
spray.visible = false; scene.add(spray);
for (let row = 0; row < PLOT_ROWS; row++) {
  const z = (row - (PLOT_ROWS - 1) / 2) * 2.1 - 0.3;
  cylinder(scene, mat.darkSteel, -5.1, 0.3, z, 0.055, 0.55);
  sphere(scene, mat.orange, -5.1, 0.59, z, 0.12, 0.08, 0.12);
}
function updateSpray(time) {
  const positions = sprayGeometry.attributes.position;
  for (let row = 0; row < PLOT_ROWS; row++) for (let i = 0; i < dropletsPerRow; i++) {
    const p = (i / dropletsPerRow + time * 0.7) % 1;
    const z = (row - (PLOT_ROWS - 1) / 2) * 2.1 - 0.3 + Math.sin(i * 2.4) * 0.45;
    positions.setXYZ(row * dropletsPerRow + i, -5.1 + p * 9.6, 0.6 + Math.sin(p * Math.PI) * 1.6, z);
  }
  positions.needsUpdate = true;
}

const digMarker = new THREE.Group();
const diamondGeometry = new THREE.OctahedronGeometry(0.27);
const diamond = new THREE.Mesh(diamondGeometry, material(0x169bff, { emissive: 0x1265b8, emissiveIntensity: 0.9, metalness: 0.15, roughness: 0.35 }));
diamond.scale.set(0.85, 1.35, 0.85);
digMarker.add(diamond);
const diamondEdges = new THREE.LineSegments(new THREE.EdgesGeometry(diamondGeometry), new THREE.LineBasicMaterial({ color: 0xb7ecff }));
diamondEdges.scale.copy(diamond.scale);
digMarker.add(diamondEdges);
digMarker.visible = false;
scene.add(digMarker);
const digMarkerStem = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]),
  new THREE.LineBasicMaterial({ color: 0x82d7ff, transparent: true, opacity: 0.8 })
);
digMarkerStem.visible = false;
scene.add(digMarkerStem);

// The machine follows the sketches: triangular tracked pods, orange T-shaped
// compartment, long handle, and interchangeable front-mounted attachments.
const rig = new THREE.Group(); scene.add(rig);
const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x332b24, transparent: true, opacity: 0.2, depthWrite: false });
for (const [x, z, width, length] of [[-0.5, -0.85, 0.28, 0.75], [0.5, -0.85, 0.28, 0.75], [0, 1.05, 0.5, 0.4]]) {
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(x, 0.055, z); shadow.scale.set(width, length, 1); rig.add(shadow);
}
const MACHINE_SCALE = 0.82, MACHINE_OFFSET = 0.85, MOUNT_OFFSET = 1.05;
const TOOL_OFFSET = MACHINE_OFFSET + MACHINE_SCALE * MOUNT_OFFSET;
const machine = new THREE.Group(); machine.position.z = -MACHINE_OFFSET; machine.scale.setScalar(MACHINE_SCALE); rig.add(machine);
const treads = [], wheels = [];
const beltPath = [
  new THREE.Vector2(-0.95, 0.19), new THREE.Vector2(-0.9, 0.105),
  new THREE.Vector2(0.75, 0.105), new THREE.Vector2(0.95, 0.18),
  new THREE.Vector2(0.97, 0.25), new THREE.Vector2(0.92, 0.32),
  new THREE.Vector2(-0.4, 1.07), new THREE.Vector2(-0.5, 1.09),
  new THREE.Vector2(-0.53, 1), new THREE.Vector2(-0.93, 0.32)
];
const trackWidth = 0.52, trackScale = 0.8, trackWidthScale = 0.84, trackSpacing = 0.615;
const trackShape = new THREE.Shape();
trackShape.moveTo(-1.02, 0.16); trackShape.lineTo(-0.94, 0.04);
trackShape.lineTo(0.79, 0.04); trackShape.lineTo(1.01, 0.12);
trackShape.lineTo(1.04, 0.25); trackShape.lineTo(0.97, 0.37);
trackShape.lineTo(-0.38, 1.14); trackShape.lineTo(-0.5, 1.16);
trackShape.lineTo(-0.59, 1.06); trackShape.lineTo(-1, 0.34); trackShape.closePath();
const trackOpening = new THREE.Path();
trackOpening.moveTo(-0.85, 0.3); trackOpening.lineTo(-0.5, 0.94);
trackOpening.lineTo(-0.47, 1.02); trackOpening.lineTo(-0.4, 1);
trackOpening.lineTo(0.86, 0.29); trackOpening.lineTo(0.88, 0.23);
trackOpening.lineTo(0.73, 0.17); trackOpening.lineTo(-0.73, 0.17);
trackOpening.lineTo(-0.82, 0.21); trackOpening.closePath();
trackShape.holes.push(trackOpening);
const trackGeo = new THREE.ExtrudeGeometry(trackShape, { depth: trackWidth, bevelEnabled: false });
const frameShape = new THREE.Shape();
frameShape.moveTo(-0.72, 0.23); frameShape.lineTo(0.72, 0.23);
frameShape.lineTo(-0.42, 0.91); frameShape.lineTo(-0.5, 0.91); frameShape.closePath();
const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: trackWidth - 0.12, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 1 });
const beltLengths = beltPath.map((point, i) => point.distanceTo(beltPath[(i + 1) % beltPath.length]));
const beltLength = beltLengths.reduce((sum, length) => sum + length, 0);
function positionTread(tread, distance) {
  let remaining = ((distance % beltLength) + beltLength) % beltLength;
  for (let i = 0; i < beltPath.length; i++) {
    if (remaining <= beltLengths[i]) {
      const start = beltPath[i], end = beltPath[(i + 1) % beltPath.length];
      const fraction = remaining / beltLengths[i];
      const dx = end.x - start.x, dy = end.y - start.y;
      tread.position.set(
        THREE.MathUtils.lerp(start.x, end.x, fraction) + dy / beltLengths[i] * 0.07,
        THREE.MathUtils.lerp(start.y, end.y, fraction) - dx / beltLengths[i] * 0.07,
        trackWidth / 2
      );
      tread.rotation.z = Math.atan2(end.y - start.y, end.x - start.x);
      return;
    }
    remaining -= beltLengths[i];
  }
}
for (const x of [-trackSpacing, trackSpacing]) {
  const pod = new THREE.Group();
  pod.position.set(x - trackWidth * trackWidthScale / 2, 0, 0);
  pod.rotation.y = Math.PI / 2; pod.scale.set(trackScale, trackScale, trackWidthScale);
  const track = new THREE.Mesh(trackGeo, mat.rubber); pod.add(track); machine.add(pod);
  const frame = new THREE.Mesh(frameGeo, mat.black); frame.position.z = 0.06; pod.add(frame);
  for (let i = 0; i < 26; i++) {
    const tread = box(pod, mat.tread, 0, 0, 0, 0.15, 0.055, trackWidth + 0.05);
    const offset = i * beltLength / 26;
    positionTread(tread, offset);
    treads.push({ mesh: tread, offset, side: x > 0 ? 1 : 0 });
  }
  const side = x > 0 ? 1 : -1;
  const outside = x > 0 ? trackWidth + 0.01 : -0.01;
  for (const [wx, wy, radius] of [[-0.7, 0.27, 0.2], [0, 0.27, 0.2], [0.7, 0.27, 0.2], [-0.45, 0.84, 0.19]]) {
    const wheelGroup = new THREE.Group(); wheelGroup.position.set(wx, wy, outside); pod.add(wheelGroup);
    const wheel = cylinder(wheelGroup, mat.rubber, 0, 0, 0, radius, 0.09);
    wheel.rotation.x = Math.PI / 2;
    const rim = cylinder(wheelGroup, mat.darkSteel, 0, 0, side * 0.05, radius * 0.78, 0.025);
    rim.rotation.x = Math.PI / 2;
    const hub = cylinder(wheelGroup, mat.rubber, 0, 0, side * 0.067, radius * 0.48, 0.02);
    hub.rotation.x = Math.PI / 2;
    const cap = cylinder(wheelGroup, mat.darkSteel, 0, 0, side * 0.08, radius * 0.26, 0.018);
    cap.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI * 2 / 6;
      sphere(wheelGroup, mat.steel, Math.cos(angle) * radius * 0.62, Math.sin(angle) * radius * 0.62, side * 0.068, 0.012, 0.012, 0.012);
    }
    wheels.push({ mesh: wheelGroup, radius, side: x > 0 ? 1 : 0 });
  }
}
box(machine, mat.black, 0, 0.24, 0, 0.84, 0.3, 1.5);
const seedBin = new THREE.Group(); seedBin.position.set(0, 0.28, 0.2); machine.add(seedBin);
box(seedBin, mat.darkSteel, 0, 0, 0, 0.68, 0.08, 0.9);
for (const side of [-1, 1]) {
  box(seedBin, mat.suitDark, side * 0.32, 0.18, 0, 0.06, 0.36, 0.9);
  box(seedBin, mat.suitDark, 0, 0.18, side * 0.42, 0.68, 0.36, 0.06);
}
for (const [x, z] of [[-0.18, -0.22], [0.09, -0.24], [-0.12, 0.05], [0.17, 0.04], [-0.16, 0.3], [0.13, 0.29]]) {
  const seed = sphere(seedBin, mat.potato, x, 0.32, z, 0.115, 0.085, 0.14);
  seed.rotation.y = x * 3;
}

// The closed case follows the rising front edge of the triangular tracks.
const compartment = new THREE.Group(); compartment.position.set(0, 0.84, 0.2); compartment.rotation.x = -Math.atan(0.75 / 1.32); machine.add(compartment);
function tShapeMesh(m, depth, inset = 0) {
  const shape = new THREE.Shape();
  const points = [
    [-0.34 + inset, 1.03 - inset], [0.34 - inset, 1.03 - inset],
    [0.34 - inset, -0.27 + inset], [0.57 - inset, -0.27 + inset],
    [0.57 - inset, -0.68 + inset], [0.48 - inset, -0.78 + inset],
    [-0.48 + inset, -0.78 + inset], [-0.57 + inset, -0.68 + inset],
    [-0.57 + inset, -0.27 + inset], [-0.34 + inset, -0.27 + inset]
  ];
  shape.moveTo(...points[0]); points.slice(1).forEach(point => shape.lineTo(...point)); shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 }), m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
compartment.add(tShapeMesh(mat.orangeDark, 0.17));
const tray = tShapeMesh(mat.black, 0.025, 0.08); tray.position.y = 0.18; compartment.add(tray);
const caseOutline = [[-0.34, -1.03], [0.34, -1.03], [0.34, 0.27], [0.57, 0.27], [0.57, 0.68], [0.48, 0.78], [-0.48, 0.78], [-0.57, 0.68], [-0.57, 0.27], [-0.34, 0.27]];
for (let i = 0; i < caseOutline.length; i++) {
  const [x1, z1] = caseOutline[i], [x2, z2] = caseOutline[(i + 1) % caseOutline.length];
  box(compartment, mat.orangeDark, (x1 + x2) / 2, 0.33, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1), 0.32, 0.05, -Math.atan2(z2 - z1, x2 - x1));
}
const lidPivot = new THREE.Group(); lidPivot.position.set(-0.36, 0.49, 0); compartment.add(lidPivot);
const lid = tShapeMesh(mat.orange, 0.095); lid.position.x = 0.36; lidPivot.add(lid);
const lidPanel = tShapeMesh(mat.orangeDark, 0.01, 0.07); lidPanel.position.set(0.36, 0.1, 0); lidPivot.add(lidPanel);
const lidFace = tShapeMesh(mat.orange, 0.01, 0.095); lidFace.position.set(0.36, 0.112, 0); lidPivot.add(lidFace);
for (const z of [-0.42, 0.42]) cylinder(compartment, mat.darkSteel, -0.38, 0.49, z, 0.045, 0.14);
box(compartment, mat.cream, 0.55, 0.5, 0.56, 0.1, 0.08, 0.2);
rod(machine, mat.black, [0, 1.41, 0.78], [0, 2.1, 1.95], 0.055);
rod(machine, mat.darkSteel, [0, 1.41, 0.78], [0, 1.52, 0.97], 0.074);
rod(machine, mat.black, [-0.42, 2.1, 1.95], [0.42, 2.1, 1.95], 0.065);
rod(machine, mat.black, [-0.42, 2.1, 1.95], [-0.3, 1.94, 1.83], 0.045);
rod(machine, mat.black, [0.42, 2.1, 1.95], [0.3, 1.94, 1.83], 0.045);
rod(machine, mat.black, [-0.3, 1.94, 1.83], [0.3, 1.94, 1.83], 0.045);
const attachmentPivot = new THREE.Group(); attachmentPivot.position.set(0, 0.34, -0.7); machine.add(attachmentPivot);
const pivotPin = cylinder(machine, mat.orangeDark, 0, 0.34, -0.7, 0.1, 0.28);
pivotPin.rotation.z = Math.PI / 2;
const toolMountPosition = new THREE.Vector3(0, 0.12 - attachmentPivot.position.y, -MOUNT_OFFSET - attachmentPivot.position.z);
const toolCoupler = new THREE.Vector3(0, 0.44, 0.25);
const couplerPosition = toolMountPosition.clone().add(toolCoupler);
rod(attachmentPivot, mat.darkSteel, [0, 0, 0], couplerPosition.toArray(), 0.085);
sphere(attachmentPivot, mat.orangeDark, couplerPosition.x, couplerPosition.y, couplerPosition.z, 0.12, 0.12, 0.12);
function makeTool(type, scale = 1) {
  const g = new THREE.Group(); g.scale.setScalar(scale);
  const anchors = { tiller: [0, 0.65, 0.25], plow: [0, 0.23, 0.08], auger: [0, 0.78, 0], sifter: [0, 0.18, 0.32] };
  rod(g, mat.darkSteel, toolCoupler.toArray(), anchors[type], 0.075);
  sphere(g, mat.orange, toolCoupler.x, toolCoupler.y, toolCoupler.z, 0.1, 0.1, 0.1);
  if (type === 'plow') {
    g.userData.wings = [];
    for (const side of [-1, 1]) {
      const wing = box(g, mat.steel, side * 0.24, 0.16, 0.08, 0.58, 0.07, 0.34, side * 0.65);
      wing.rotation.z = side * 0.18;
      g.userData.wings.push(wing);
      rod(g, mat.darkSteel, [0, 0.24, -0.14], [side * 0.47, 0.23, 0.28], 0.025);
    }
    sphere(g, mat.orangeDark, 0, 0.24, -0.14, 0.055, 0.055, 0.055);
  } else if (type === 'auger') {
    const auger = new THREE.Group(); g.add(auger);
    rod(auger, mat.darkSteel, [0, 0.05, 0], [0, 0.85, 0], 0.055);
    cylinder(g, mat.darkSteel, 0, 0.78, 0, 0.11, 0.13);
    const vertices = [], indices = [];
    for (let i = 0; i <= 96; i++) {
      const progress = i / 96, angle = progress * Math.PI * 8, y = 0.08 + progress * 0.72;
      const radius = 0.1 + 0.12 * Math.min(1, progress * 5);
      vertices.push(Math.cos(angle) * 0.05, y, Math.sin(angle) * 0.05, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      if (i < 96) {
        const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
    }
    const flight = new THREE.BufferGeometry();
    flight.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    flight.setIndex(indices); flight.computeVertexNormals();
    auger.add(new THREE.Mesh(flight, material(0xaab5ad, { side: THREE.DoubleSide, metalness: 0.25 })));
    g.userData.auger = auger;
  } else if (type === 'tiller') {
    const rollerGroup = new THREE.Group(); rollerGroup.position.y = 0.25; g.add(rollerGroup);
    const roller = cylinder(rollerGroup, mat.darkSteel, 0, 0, 0, 0.18, 0.8);
    roller.rotation.z = Math.PI / 2;
    for (let i = -2; i <= 2; i++) for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * 2 / 5;
      const y = Math.cos(a), z = Math.sin(a);
      rod(rollerGroup, mat.steel, [i * 0.15, y * 0.16, z * 0.16], [i * 0.15, y * 0.29, z * 0.29], 0.03);
      rod(rollerGroup, mat.steel, [i * 0.15, y * 0.29, z * 0.29], [i * 0.15 + 0.09, y * 0.29 - z * 0.06, z * 0.29 + y * 0.06], 0.03);
    }
    rod(g, mat.darkSteel, [-0.42, 0.25, 0], [-0.42, 0.65, 0.25], 0.035);
    rod(g, mat.darkSteel, [0.42, 0.25, 0], [0.42, 0.65, 0.25], 0.035);
    rod(g, mat.darkSteel, [-0.42, 0.65, 0.25], [0.42, 0.65, 0.25], 0.035);
    g.userData.roller = rollerGroup;
  } else if (type === 'sifter') {
    const basket = new THREE.Group(); g.add(basket);
    box(basket, mat.darkSteel, 0, 0.18, 0.32, 0.9, 0.12, 0.14);
    for (let i = -4; i <= 4; i++) {
      box(basket, mat.steel, i * 0.1, 0.12, 0, 0.055, 0.06, 0.68);
    }
    for (const side of [-1, 1]) {
      box(basket, mat.darkSteel, side * 0.46, 0.2, 0, 0.08, 0.15, 0.7);
      sphere(basket, mat.orangeDark, side * 0.46, 0.22, 0.3, 0.07, 0.07, 0.07);
    }
    g.userData.basket = basket;
  }
  return g;
}
const toolTypes = TOOL_TYPES;
const mounted = {};
for (const type of toolTypes) {
  const tool = makeTool(type); tool.position.copy(toolMountPosition); attachmentPivot.add(tool);
  tool.visible = type === (saved ? saved.tool : 'tiller'); mounted[type] = tool;
}
const stored = {};
const storageSlots = { tiller: 0.32, plow: -0.55, auger: -0.91, sifter: -0.27 };
for (const type of toolTypes) {
  const tool = makeTool(type, 0.32);
  tool.position.set(0, 0.34, storageSlots[type]);
  tool.rotation.x = Math.PI / 2; compartment.add(tool);
  tool.visible = false; stored[type] = tool;
}
const carried = {};
for (const type of toolTypes) {
  carried[type] = makeTool(type, 0.7);
  carried[type].visible = false;
  machine.add(carried[type]);
}

const astronaut = new THREE.Group(); astronaut.position.set(0, 0, 1.05); rig.add(astronaut);
// Rounded, segmented pressure suit with separate hip, knee, shoulder and elbow joints.
sphere(astronaut, mat.suit, 0, 1.29, 0, 0.39, 0.51, 0.27);
sphere(astronaut, mat.suitDark, 0, 0.99, 0, 0.34, 0.2, 0.25);
box(astronaut, mat.suitDark, 0, 1.37, 0.27, 0.64, 0.7, 0.34);
box(astronaut, mat.white, 0, 1.38, 0.45, 0.56, 0.61, 0.08);
box(astronaut, mat.orange, 0, 1.59, 0.5, 0.42, 0.055, 0.025);
box(astronaut, mat.darkSteel, 0, 1.24, 0.5, 0.36, 0.2, 0.025);
for (const x of [-0.19, 0.19]) {
  rod(astronaut, mat.suitDark, [x, 1.72, 0.3], [x, 1.02, 0.31], 0.055);
  box(astronaut, mat.orange, x, 1.15, 0.52, 0.08, 0.04, 0.03);
}
box(astronaut, mat.suitDark, 0, 1.34, -0.255, 0.4, 0.31, 0.06);
box(astronaut, mat.orange, 0, 1.43, -0.295, 0.29, 0.045, 0.025);
for (const x of [-0.12, 0, 0.12]) sphere(astronaut, mat.blue, x, 1.32, -0.3, 0.03, 0.03, 0.02);
const collar = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 24), mat.darkSteel);
collar.rotation.x = Math.PI / 2; collar.position.y = 1.73; astronaut.add(collar);
const helmet = new THREE.Group(); helmet.name = 'helmet'; astronaut.add(helmet);
sphere(helmet, mat.white, 0, 1.99, 0, 0.36, 0.39, 0.35);
sphere(helmet, mat.darkSteel, 0, 2.02, -0.27, 0.3, 0.265, 0.12);
sphere(helmet, mat.visor, 0, 2.03, -0.335, 0.265, 0.225, 0.07);
sphere(helmet, mat.blue, -0.12, 2.12, -0.395, 0.075, 0.035, 0.008);
for (const side of [-1, 1]) {
  sphere(helmet, mat.orange, side * 0.34, 2, 0, 0.045, 0.065, 0.07);
}
const upperBody = new THREE.Group(); upperBody.position.y = 0.96;
for (const part of [...astronaut.children]) {
  part.position.y -= upperBody.position.y;
  upperBody.add(part);
}
astronaut.add(upperBody);
function makeLeg(side) {
  const hip = new THREE.Group(); hip.position.set(side * 0.2, 0.96, 0); astronaut.add(hip);
  sphere(hip, mat.suitDark, 0, 0, 0, 0.16, 0.16, 0.16);
  rod(hip, mat.suit, [0, -0.03, 0], [0, -0.36, 0], 0.145);
  const knee = new THREE.Group(); knee.position.set(0, -0.4, 0); hip.add(knee);
  sphere(knee, mat.suitDark, 0, 0, 0, 0.145, 0.13, 0.15);
  sphere(knee, mat.white, 0, 0, -0.105, 0.12, 0.1, 0.07);
  rod(knee, mat.suit, [0, -0.04, 0], [0, -0.36, 0], 0.12);
  sphere(knee, mat.suitDark, 0, -0.35, 0, 0.13, 0.07, 0.13);
  const foot = new THREE.Group(); foot.position.y = -0.35; knee.add(foot);
  sphere(foot, mat.black, 0, -0.09, -0.085, 0.16, 0.1, 0.245);
  return { hip, knee, foot };
}
const legs = [makeLeg(-1), makeLeg(1)];
const arms = [];
for (const side of [-1, 1]) {
  const arm = new THREE.Group(); arm.position.set(side * 0.37, 1.53 - upperBody.position.y, 0); upperBody.add(arm);
  sphere(arm, mat.white, 0, 0, 0, 0.16, 0.16, 0.16);
  rod(arm, mat.suit, [0, -0.03, 0], [side * 0.09, -0.2, -0.22], 0.115);
  sphere(arm, mat.suitDark, side * 0.09, -0.2, -0.22, 0.12, 0.12, 0.12);
  sphere(arm, mat.white, side * 0.13, -0.2, -0.22, 0.065, 0.09, 0.09);
  rod(arm, mat.suit, [side * 0.09, -0.2, -0.22], [side * -0.03, 0.16, -0.3], 0.1);
  const hand = new THREE.Group(); hand.position.set(side * -0.03, 0.19, -0.3); arm.add(hand);
  sphere(hand, mat.darkSteel, 0, -0.03, 0, 0.105, 0.07, 0.105);
  sphere(hand, mat.white, 0, 0, 0, 0.11, 0.1, 0.12);
  const walkingArm = new THREE.Group(); walkingArm.position.copy(arm.position); upperBody.add(walkingArm);
  sphere(walkingArm, mat.white, 0, 0, 0, 0.16, 0.16, 0.16);
  rod(walkingArm, mat.suit, [0, -0.04, 0], [side * 0.06, -0.32, 0], 0.115);
  sphere(walkingArm, mat.suitDark, side * 0.06, -0.32, 0, 0.12, 0.12, 0.12);
  rod(walkingArm, mat.suit, [side * 0.06, -0.32, 0], [side * 0.08, -0.58, -0.05], 0.1);
  sphere(walkingArm, mat.white, side * 0.08, -0.6, -0.05, 0.11, 0.1, 0.12);
  walkingArm.visible = false;
  arms.push({ arm, hand, walkingArm });
}
const carriedSeed = sphere(rig, mat.potato, 0, 0, 0, 0.12, 0.08, 0.1); carriedSeed.visible = false;
rig.position.set(saved ? saved.position.x : 0, 0.05, saved ? saved.position.z : 5);
if (saved) rig.rotation.y = saved.position.angle;
const lastSafePosition = { x: rig.position.x, z: rig.position.z, angle: rig.rotation.y };
let parked = Boolean(saved && saved.operator);
if (parked) {
  scene.attach(astronaut);
  astronaut.position.set(saved.operator.x, 0.05, saved.operator.z);
  astronaut.rotation.set(0, saved.operator.angle, 0);
}
let irrigationRemaining = saved && saved.irrigation ? saved.irrigation : 0;

let activeTool = saved ? saved.tool : 'tiller', switching = null, started = false, currentTarget = null, pinnedTarget = null;
let work = 0, workTarget = null, workPhase = null, workRoute = null, snap = null, toastTimer = 0, elapsed = 0;
let plantingActive = false, plantingPlot = null, plantReturn = null, plantBend = 0, plantPose = null;
let saveTimer = 0;
let restCutscene = null, restScene = null;
let previousWorking = false, previousNight = false;
const treadDistance = [0, 0];
const keys = new Set();
let screenMove = null, screenWork = false, previousGamepadButtons = [], gamepadWorkReady = false, previousGamepadActive = false;
let currentControllerType = 'keyboard', lastNonGamepadType = 'keyboard', currentGamepadIdentity = null;
let joystickPointer = null, joystick = { right: 0, forward: 0 }, touchWorkPointer = null;
const touchCamera = createTouchCamera();
const gamepadMenu = createGamepadMenu();
const haptics = createHaptics(navigator);
const CAMERA_MIN_PITCH = -1.1, CAMERA_MAX_PITCH = 1.25;
let cameraAngle = 0.38, cameraPitch = 0.45, cameraDistance = 11;
let previousCameraAngle = cameraAngle;
const cameraPan = { x: 0, z: 0 };
let dragging = false, lastX = 0, lastY = 0;
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
const targetPoint = new THREE.Vector3(), cameraPoint = new THREE.Vector3(), viewDirection = new THREE.Vector3();
const interactionPosition = new THREE.Vector3(), interactionProjection = new THREE.Vector3(), astronautWorld = new THREE.Vector3();
const coarsePointer = window.matchMedia('(pointer: coarse)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isGamepadMode = type => type !== 'keyboard' && type !== 'touch';
function setPromptMode(type) {
  if (!isGamepadMode(type)) lastNonGamepadType = type;
  if (currentControllerType !== type || !document.body.dataset.inputMode) {
    currentControllerType = type;
    updateControllerPrompts(document, type);
  }
}
setPromptMode(coarsePointer.matches ? 'touch' : 'keyboard');
window.addEventListener('pointerdown', event => {
  const touch = event.pointerType === 'touch';
  haptics.setSource(touch ? 'touch' : null);
  setPromptMode(touch ? 'touch' : 'keyboard');
}, true);
window.addEventListener('keydown', () => { haptics.setSource(null); setPromptMode('keyboard'); }, true);
const desktopLayout = window.matchMedia('(min-width: 601px) and (pointer: fine), (min-width: 601px) and (pointer: none)');
function positionFieldGuide() {
  const container = desktopLayout.matches ? $('toolbox') : $('mission-hud');
  container.append($('work-wrap'));
}
desktopLayout.addEventListener('change', positionFieldGuide);
positionFieldGuide();
const seedHandPosition = new THREE.Vector3(), seedGroundPosition = new THREE.Vector3(0, 0.12, -TOOL_OFFSET);

function stopPlanting(returnToHandle) {
  if (!plantingActive) return;
  carriedSeed.visible = false;
  if (plantingPlot !== null) plots[plantingPlot].seed.visible = false;
  if (returnToHandle) {
    plantReturn = { x: astronaut.position.x, z: astronaut.position.z, angle: astronaut.rotation.y, bend: plantBend, time: 0 };
  } else {
    astronaut.position.x = 0; astronaut.position.z = 1.05; astronaut.rotation.y = 0; plantBend = 0;
  }
  plantingActive = false; plantingPlot = null; plantPose = null;
}

function persistProgress() {
  if (!started || savingBlocked) return;
  try {
    rememberSafePosition();
    const operator = parked ? { x: astronaut.position.x, z: astronaut.position.z, angle: astronaut.rotation.y } : null;
    saveProgress(storage, state, lastSafePosition, activeTool, operator, irrigationRemaining || null);
    $('save-status').textContent = 'PROGRESS SAVED ON THIS DEVICE';
    $('save-status').classList.remove('save-error');
    saveFailed = false;
  } catch (error) {
    if (!saveFailed) console.error('Unable to save progress:', error);
    saveFailed = true;
    $('save-status').textContent = 'SAVE FAILED · CHECK SITE STORAGE';
    $('save-status').classList.add('save-error');
  }
}

function rememberSafePosition() {
  if (Math.hypot(rig.position.x, rig.position.z) <= MOVEMENT_RADIUS) {
    lastSafePosition.x = rig.position.x;
    lastSafePosition.z = rig.position.z;
    lastSafePosition.angle = rig.rotation.y;
  }
}

function createRestScene() {
  const interior = new THREE.Scene(); interior.background = new THREE.Color(0x24352f);
  interior.add(new THREE.HemisphereLight(0xffefd7, 0x43544d, 2));
  const lamp = new THREE.DirectionalLight(0xffe6c6, 2); lamp.position.set(1, 5, 4); interior.add(lamp);
  const view = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 50);
  view.position.set(4.5, 4, 8); view.lookAt(0, 1, 0);
  box(interior, mat.floor, 0, -0.1, 0, 6, 0.2, 4.7);
  box(interior, mat.suitDark, -2.72, 1.65, -2.35, 0.56, 3.3, 0.16);
  box(interior, mat.suitDark, 0.9, 1.65, -2.35, 4.2, 3.3, 0.16);
  box(interior, mat.suitDark, -1.8, 2.98, -2.35, 1.3, 0.64, 0.16);
  const door = box(interior, mat.darkSteel, -1.8, 1.32, -2.29, 1.22, 2.64, 0.1);
  box(interior, mat.orange, -1.8, 2.67, -2.21, 1.3, 0.09, 0.1);
  box(interior, mat.suit, 0.9, 0.35, 0, 1.25, 0.55, 2.15);
  box(interior, mat.white, 0.9, 0.68, 0, 1.15, 0.14, 2.05);
  box(interior, mat.cream, 0.9, 0.79, 0.72, 0.72, 0.13, 0.42);
  box(interior, mat.blue, 0.9, 0.77, -0.48, 1.1, 0.08, 0.95);
  box(interior, mat.white, 2.35, 0.7, -1.55, 0.85, 1.4, 0.6);
  box(interior, mat.orange, 2.35, 1.1, -1.22, 0.6, 0.07, 0.04);
  box(interior, mat.light, 0.65, 2.9, -2.2, 1.8, 0.1, 0.12);

  const person = new THREE.Group(); interior.add(person);
  const skin = material(0xc69a79), hair = material(0x4f4036);
  sphere(person, skin, 0, 1.46, 0, 0.24, 0.18, 0.18);
  sphere(person, mat.white, 0, 1.14, 0, 0.29, 0.35, 0.2);
  for (const x of [-0.19, 0.19]) box(person, mat.white, x, 1.49, 0, 0.07, 0.25, 0.3);
  sphere(person, mat.darkSteel, 0, 0.91, 0, 0.25, 0.16, 0.19);
  sphere(person, skin, 0, 1.79, 0, 0.22, 0.27, 0.21);
  sphere(person, hair, 0, 1.98, 0.02, 0.22, 0.09, 0.21);
  for (const x of [-0.07, 0.07]) sphere(person, mat.black, x, 1.82, -0.19, 0.022, 0.025, 0.015);
  const restLegs = [], restArms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.15, 0.85, 0); person.add(leg);
    rod(leg, mat.darkSteel, [0, 0, 0], [0, -0.62, 0], 0.11);
    sphere(leg, mat.black, 0, -0.73, -0.06, 0.13, 0.1, 0.2);
    const arm = new THREE.Group(); arm.position.set(side * 0.3, 1.48, 0); person.add(arm);
    rod(arm, skin, [0, 0, 0], [side * 0.05, -0.43, 0], 0.095);
    sphere(arm, skin, side * 0.05, -0.48, 0, 0.08, 0.09, 0.08);
    restLegs.push(leg); restArms.push(arm);
  }
  const suit = astronaut.clone(true); suit.position.set(0, 0, 0); suit.rotation.set(0, 0, 0); interior.add(suit);
  const suitHelmet = suit.getObjectByName('helmet');
  const suitHelmetY = suitHelmet.position.y;
  sphere(suit, skin, 0, 1.99, 0, 0.22, 0.27, 0.21);
  sphere(suit, hair, 0, 2.18, 0.02, 0.22, 0.09, 0.21);
  for (const x of [-0.07, 0.07]) sphere(suit, mat.black, x, 2.02, -0.19, 0.022, 0.025, 0.015);
  return { interior, view, door, person, restLegs, restArms, suit, suitHelmet, suitHelmetY };
}

function updateRestCutscene(dt) {
  const sequence = restCutscene;
  sequence.time = Math.min(5, sequence.time + dt);
  const t = sequence.time, { interior, view, door, person, restLegs, restArms, suit, suitHelmet, suitHelmetY } = restScene;
  const ease = (value, start, end) => THREE.MathUtils.smoothstep(value, start, end);
  person.visible = t < 3.9; suit.visible = t >= 3.9;
  person.rotation.set(0, 0, 0);
  let stride = 0;
  if (t < 0.8) {
    const p = ease(t, 0, 0.8);
    person.position.set(THREE.MathUtils.lerp(-1.8, 0.9, p), 0, THREE.MathUtils.lerp(-2.3, -0.75, p));
    person.rotation.y = THREE.MathUtils.lerp(-2.1, 0, ease(t, 0.64, 0.8));
    stride = Math.sin(t * 18) * 0.55 * Math.sin(Math.PI * p);
  } else if (t < 2.85) {
    const reclining = t < 1.3 ? ease(t, 0.8, 1.3) : t < 2.25 ? 1 : 1 - ease(t, 2.25, 2.85);
    person.position.set(0.9, reclining * 1.02, -0.75 - reclining * 0.3);
    person.rotation.x = reclining * Math.PI / 2;
  } else {
    const p = ease(t, 2.85, 3.8);
    person.position.set(THREE.MathUtils.lerp(0.9, -1.8, p), 0, THREE.MathUtils.lerp(-0.75, -2.3, p));
    person.rotation.y = THREE.MathUtils.lerp(1.05, Math.PI, ease(t, 3.65, 3.8));
    if (t < 3.8) stride = Math.sin((t - 2.85) * 18) * 0.55 * Math.sin(Math.PI * p);
  }
  for (let i = 0; i < 2; i++) {
    restLegs[i].rotation.x = stride * (i ? -1 : 1);
    restArms[i].rotation.x = -stride * (i ? -0.55 : 0.55);
  }
  const doorOpen = t < 1.15 ? 1 - ease(t, 0.85, 1.15) : ease(t, 2.65, 2.95);
  door.position.x = -1.8 + doorOpen * 1.3;
  if (suit.visible) {
    suit.position.set(-1.8, 0, -2.3); suit.rotation.y = Math.PI;
    const dressed = ease(t, 3.9, 4.25);
    suit.scale.setScalar(0.88 + dressed * 0.12);
    suitHelmet.position.y = suitHelmetY + (1 - dressed) * 0.55;
  }
  let fade = 0;
  if (t >= 1.55 && t < 1.85) fade = (t - 1.55) / 0.3;
  else if (t >= 1.85 && t < 2.05) fade = 1;
  else if (t >= 2.05 && t < 2.35) fade = 1 - (t - 2.05) / 0.3;
  else if (t >= 4.2 && t < 4.55) fade = (t - 4.2) / 0.35;
  else if (t >= 4.55) fade = (5 - t) / 0.45;
  $('rest-fade').style.opacity = String(fade);
  const caption = t < 1.3 ? 'Returning to the habitat' : t < 2.35 ? 'Resting through the night' : t < 3.9 ? 'A new morning' : 'Putting on the suit';
  if ($('rest-caption').textContent !== caption) $('rest-caption').textContent = caption;
  if (t < 4.55) renderer.render(interior, view);
  else {
    updatePlots(); updateUI(); updateSky(); renderer.render(scene, camera);
  }
  if (t >= 5) {
    restCutscene = null; $('rest-cutscene').hidden = true; $('app').classList.remove('resting');
    message(`Rest complete. Crop growth advanced by up to ${REST_GROWTH_SECONDS} seconds.`);
    renderer.domElement.focus();
  }
}

function message(text) {
  $('toast').textContent = text; $('toast').classList.add('show'); toastTimer = 3.5;
}
function selectTool(type) {
  if (!started || switching || restCutscene) return;
  if (parked) { message('Pick up the machine before changing attachments.'); return; }
  if (plantingActive || plantReturn) { message('Finish planting or release Work before changing attachments.'); return; }
  const nextCycle = state.phase === PHASES.length && type === 'tiller';
  if (activeTool === type && !nextCycle) return;
  setScreenMove(null); setScreenWork(false);
  if (nextCycle) {
    startNextCycle(state);
    currentTarget = null; pinnedTarget = null;
    work = 0; workTarget = null; workPhase = null; workRoute = null; snap = null;
    persistProgress();
  }
  if (activeTool === type) { message('The next growing cycle begins.'); return; }
  switching = { from: activeTool, to: type, time: 0 };
  work = 0; workTarget = null; workPhase = null; workRoute = null; snap = null;
  message(`Changing attachment: ${activeTool} → ${type}`);
}
function moveCarriedTool(type, progress) {
  const tool = carried[type];
  compartment.updateMatrix(); attachmentPivot.updateMatrix();
  const storagePosition = stored[type].position.clone().applyMatrix4(compartment.matrix);
  const mountedPosition = mounted[type].position.clone().applyMatrix4(attachmentPivot.matrix);
  tool.position.lerpVectors(mountedPosition, storagePosition, progress);
  tool.position.y += Math.sin(progress * Math.PI) * 0.3;
  const mountedRotation = attachmentPivot.quaternion.clone().multiply(mounted[type].quaternion);
  const storedRotation = compartment.quaternion.clone().multiply(stored[type].quaternion);
  tool.quaternion.slerpQuaternions(mountedRotation, storedRotation, progress);
  tool.scale.setScalar(THREE.MathUtils.lerp(1, stored[type].scale.x, progress));
}
function updateSwitch(dt) {
  if (!switching) return;
  switching.time += dt * 1.6;
  const t = switching.time;
  // Walk to the front, open the lid, exchange the attachment, and return.
  const walk = t < 0.8 ? t / 0.8 : t < 2.7 ? 1 : Math.max(0, 1 - (t - 2.7) / 0.8);
  astronaut.position.x = walk * 1.25;
  astronaut.position.z = 1.05 - walk * 1.5;
  astronaut.rotation.y = walk * 1.15;
  lidPivot.rotation.z = t < 0.8 ? 0 : t < 1.3 ? (t - 0.8) / 0.5 * 1.8 : t < 2.5 ? 1.8 : Math.max(0, 1.8 * (1 - (t - 2.5) / 0.5));
  if (t >= 1.05) mounted[switching.from].visible = false;
  if (t >= 1.05 && t < 1.8) {
    const tool = carried[switching.from], progress = (t - 1.05) / 0.75;
    tool.visible = true;
    moveCarriedTool(switching.from, progress);
  } else if (t >= 1.8) {
    carried[switching.from].visible = false;
  }
  if (t >= 1.8 && t < 2.5) {
    const tool = carried[switching.to], progress = (t - 1.8) / 0.7;
    tool.visible = true;
    moveCarriedTool(switching.to, 1 - progress);
  } else if (t >= 2.5 && activeTool !== switching.to) {
    carried[switching.to].visible = false;
    mounted[switching.to].visible = true;
    activeTool = switching.to;
    haptics.trigger('attach', performance.now());
    sounds.play('attach');
    updateToolUI();
    persistProgress();
  }
  for (const type of toolTypes) {
    const inCase = type === switching.from ? t >= 1.8 : type === switching.to ? t < 1.8 : true;
    stored[type].visible = lidPivot.rotation.z > 0.4 && inCase;
  }
  if (t >= 3.5) { astronaut.position.x = 0; astronaut.position.z = 1.05; astronaut.rotation.y = 0; lidPivot.rotation.z = 0; switching = null; }
}
const toolLabels = { tiller: '01 · Rotary tiller', plow: '02 · Hilling plow', auger: '03 · Mixing auger', sifter: '04 · Vibratory lifter' };
let lastToolHintPhase = -1;
function updateToolUI() {
  const required = state.phase === PHASES.length ? 'tiller' : PHASES[state.phase]?.tool;
  const needsTool = required && required !== activeTool;
  document.querySelectorAll('.tool').forEach(button => {
    const selected = button.dataset.tool === activeTool;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    const needed = needsTool && button.dataset.tool === required;
    button.classList.toggle('required', Boolean(needed));
    button.setAttribute('aria-label', `${button.querySelector('b').textContent}${needed ? ', required for current objective' : ''}`);
  });
  $('tools-label').textContent = needsTool ? 'SELECT TOOL' : 'TOOLS';
  $('current-tool').textContent = needsTool ? toolLabels[required] : toolLabels[activeTool].slice(5);
  $('tools-toggle').classList.toggle('needed', Boolean(needsTool));
  $('machine-toggle').textContent = parked ? 'PICK UP TOOL' : 'PARK TOOL';
  $('machine-toggle').setAttribute('aria-pressed', String(parked));
  lastToolHintPhase = state.phase;
}
function updatePlots() {
  updateSilo(siloPreview === null ? state.totalHarvested : siloPreview);
  plots.forEach((visual, i) => {
    const plot = state.plots[i], stage = growthStage(plot.growth);
    if (visual.lastStage !== plot.stage || visual.lastGrowth !== stage) {
      visual.soil.material = plotMaterial[plot.stage];
      if (visual.lastStage !== plot.stage) updatePlotDetails(visual, i, plot.stage);
      visual.marker.visible = plot.stage < 3;
      visual.plant.visible = plot.stage >= 5 && plot.stage <= 7 && stage > 0;
      visual.plant.scale.setScalar([0.1, 0.35, 0.62, 0.85, 1.05][stage]);
      visual.ready.visible = plot.stage === 7 && stage === 4;
      visual.lastStage = plot.stage; visual.lastGrowth = stage;
    }
    visual.selected.visible = currentTarget === i;
    visual.selected.material.color.setHex(canWork(state, plot, activeTool) ? 0xffd69a : 0xe07862);
    if (visual.ready.visible) visual.ready.position.y = 1.25 + Math.sin(elapsed * 3 + i) * 0.08;
  });
  const phase = PHASES[state.phase];
  digMarker.visible = started && Boolean(phase) && currentTarget !== null && canWork(state, state.plots[currentTarget], phase.tool || activeTool);
  digMarkerStem.visible = digMarker.visible;
  if (digMarker.visible) {
    const target = plots[currentTarget];
    digMarker.position.set(target.x, 1.3 + Math.sin(elapsed * 2.5) * 0.12, target.z);
    digMarker.rotation.set(0, elapsed * 2, Math.sin(elapsed * 1.7) * 0.14);
    digMarkerStem.position.set(target.x, 0.16, target.z);
    digMarkerStem.scale.y = digMarker.position.y - 0.53;
  }
}
const operationInsights = [
  { title: 'Rotary tiller · loosen', text: 'Curved tines break up compacted soil so roots and tubers have room to grow.' },
  { title: 'Hilling plow · furrow', text: 'The plow opens a trench, giving seed potatoes a consistent planting row.' },
  { title: 'Mixing auger · bore', text: 'The spiral drills planting holes with little downward force in low gravity.' },
  { title: 'Planting by hand', text: 'Placing each seed potato gently in a prepared hole helps protect it from damage.' },
  { title: 'Sprinklers · establish', text: 'Water moistens the planted soil, helping the seed potatoes begin growing.' },
  { title: 'Hilling plow · mound', text: 'Soil mounded over growing tubers protects them from light and greening.' },
  { title: 'Sprinklers · tuber growth', text: 'Consistent moisture during tuber development helps the crop grow evenly.' },
  { title: 'Vibratory lifter · harvest', text: 'The blade lifts from beneath while soil sifts away, reducing damage to potatoes.' }
];
let displayedInsight = -1;
function updateUI() {
  const phase = PHASES[state.phase], done = phaseProgress(state);
  if (lastToolHintPhase !== state.phase) updateToolUI();
  const watering = phase?.action === 'water';
  const progress = watering ? (irrigationRemaining > 0 ? 1 - irrigationRemaining / IRRIGATION_SECONDS : 0) : done / PLOT_COUNT;
  const progressPercent = Math.floor(progress * 100);
  $('objective-count').textContent = watering ? `Field watered: ${progressPercent}%` : `Plot completion: ${done}/${PLOT_COUNT}`;
  $('objective-progress').style.width = `${progress * 100}%`;
  $('progress-track').setAttribute('aria-valuenow', String(progressPercent));
  $('progress-track').setAttribute('aria-valuetext', watering ? `${progressPercent}% of field watering` : `${done} of ${PLOT_COUNT} plots`);
  $('objective').textContent = phase ? phase.title : 'Harvest complete';
  $('harvest-count').textContent = state.totalHarvested;
  $('phase-number').textContent = phase ? `Objective [${String(state.phase + 1).padStart(2, '0')}/${String(PHASES.length).padStart(2, '0')}]` : 'Mission complete';
  $('phase-name').textContent = phase ? phase.name : 'WELL DONE';
  let instruction = parked ? 'Pick up the machine, then select the rotary tiller for the next crop.' : 'Select the rotary tiller to begin the next crop.';
  if (phase) {
    if (switching) instruction = 'The astronaut is exchanging attachments.';
    else if (phase.action === 'water') {
      if (irrigationRemaining > 0) instruction = `Sprinklers running · ${Math.ceil(irrigationRemaining)} seconds remaining.`;
      else if (!parked) instruction = `Park the machine (${promptText(currentControllerType, 'park')}), then walk to the blue marker at the white cabinet.`;
      else if (!nearWaterSwitch(astronaut.position)) instruction = 'Walk to the blue marker at the white irrigation cabinet.';
      else if (!canStartIrrigation(state)) instruction = 'Wait for every plot to reach the irrigation checkpoint.';
      else instruction = `Press ${promptText(currentControllerType, 'work')} or Work at the cabinet switch to start the sprinklers.`;
    }
    else if (parked) instruction = `Return to the machine handle and press ${promptText(currentControllerType, 'park')} or Pick up tool.`;
    else if (phase.tool && phase.tool !== activeTool) instruction = state.phase === 5
      ? 'Select tool 02 · Hilling plow again to mound soil over the shoots.'
      : `Select tool ${toolLabels[phase.tool]} for this objective.`;
    else if (state.phase === 5) instruction = `Use the plow again: hold ${promptText(currentControllerType, 'work')} or Work on blue-marked growing plots.`;
    else if (state.phase === 7) instruction = 'Harvest blue-marked mature crops. Rest at night to accelerate growth.';
    else instruction = `Move to a marked plot and work to ${phase.action}.`;
  }
  $('instruction').textContent = instruction;
  const hours = Math.floor(state.minutes / 60), minutes = Math.floor(state.minutes % 60);
  $('clock').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  $('day-label').textContent = `SOL ${String(state.sol).padStart(2, '0')} · ${isNight(state.minutes) ? 'NIGHTTIME' : 'DAYTIME'}`;
  $('mobile-clock').textContent = `SOL ${String(state.sol).padStart(2, '0')} · ${$('clock').textContent} · ${isNight(state.minutes) ? 'NIGHTTIME' : 'DAYTIME'}`;
  $('day-icon').textContent = isNight(state.minutes) ? '☾' : '☀';
  $('work-wrap').hidden = !(irrigationRemaining > 0 || (snap && phase));
  if (!$('work-wrap').hidden && phase && displayedInsight !== state.phase) {
    displayedInsight = state.phase;
    $('insight-title').textContent = operationInsights[state.phase].title;
    $('insight-text').textContent = operationInsights[state.phase].text;
    document.querySelectorAll('[data-insight]').forEach(icon => { icon.style.display = Number(icon.dataset.insight) === state.phase ? '' : 'none'; });
  }
  if (irrigationRemaining > 0) {
    const progress = 1 - irrigationRemaining / IRRIGATION_SECONDS;
    $('work-label').textContent = `SPRINKLERS · ${Math.ceil(irrigationRemaining)}S LEFT`;
    $('work-percent').textContent = `${Math.floor(progress * 100)}%`;
    $('work-fill').style.width = `${progress * 100}%`;
  } else if (phase && snap) {
    const approaching = snap.elapsed < snap.duration;
    const progress = approaching ? snap.elapsed / snap.duration : work / phase.duration;
    $('work-label').textContent = approaching ? 'APPROACHING PLOT' : ['TILLING', 'FURROWING', 'DRILLING', 'PLANTING', 'IRRIGATING', 'HILLING', 'CHECKING WATER', 'HARVESTING'][state.phase];
    $('work-percent').textContent = `${Math.floor(Math.min(1, progress) * 100)}%`;
    $('work-fill').style.width = `${Math.min(100, progress * 100)}%`;
  }
  if (currentTarget !== null && phase) {
    const plot = state.plots[currentTarget];
    const label = plot.stage >= 5 && plot.stage <= 7 ? ['PLANTED', 'SPROUT', 'LEAFING', 'MATURE PLANT', 'READY TO HARVEST'][growthStage(plot.growth)] : `PLOT ${String(currentTarget + 1).padStart(2, '0')}`;
    $('target-label').textContent = `${label}  ·  ${canWork(state, plot, activeTool) ? 'WORK TO ' + phase.action.toUpperCase() : 'FOLLOW CURRENT OBJECTIVE'}`;
  } else $('target-label').textContent = '';
}

function updateInteractionPrompt() {
  const prompt = $('interaction-prompt');
  if (!started || !$('info').hidden || restCutscene || switching || plantingActive || plantReturn) { prompt.hidden = true; return; }
  astronaut.getWorldPosition(astronautWorld);
  const phase = PHASES[state.phase];
  let key = '', action = '', alternative = '';
  if (nearWaterSwitch(astronautWorld) && (phase?.action === 'water' || irrigationRemaining > 0)) {
    interactionPosition.set(WATER_SWITCH.x, 1.8, WATER_SWITCH.z);
    if (irrigationRemaining > 0) { action = `SPRINKLERS RUNNING · ${Math.ceil(irrigationRemaining)}S`; }
    else if (!parked) { key = 'F'; action = 'PARK MACHINE'; alternative = 'PARK TOOL'; }
    else if (!canStartIrrigation(state)) { action = 'WAIT FOR CROPS TO GROW'; }
    else { key = 'SPACE'; action = 'START SPRINKLERS'; alternative = 'WORK'; }
  } else if (nearRestDoor(parked ? astronaut.position : rig.position)) {
    interactionPosition.set(REST_DOOR.x, 2.8, REST_DOOR.z);
    if (isNight(state.minutes) && irrigationRemaining === 0) { key = 'SPACE'; action = 'REST'; alternative = 'WORK'; }
    else { action = irrigationRemaining > 0 ? 'WAIT FOR SPRINKLERS' : 'REST AVAILABLE AT 19:00'; }
  } else if (parked) {
    rig.localToWorld(interactionPosition.set(0, 0, 1.05));
    if (Math.hypot(astronaut.position.x - interactionPosition.x, astronaut.position.z - interactionPosition.z) <= MACHINE_PICKUP_REACH) {
      interactionPosition.y += 1.7;
      key = 'F'; action = 'PICK UP MACHINE'; alternative = 'PICK UP TOOL';
    }
  } else if (phase && currentTarget !== null && !snap && canWork(state, state.plots[currentTarget], activeTool)) {
    const target = plots[currentTarget];
    const front = interactionPosition.set(0, 0, -TOOL_OFFSET);
    rig.localToWorld(front);
    if (Math.hypot(front.x - target.x, front.z - target.z) <= 2.1) {
      interactionPosition.set(target.x, 1.9, target.z);
      key = 'SPACE'; action = `HOLD TO ${phase.action.toUpperCase()}`; alternative = 'WORK';
    }
  }
  if (!action) { prompt.hidden = true; return; }
  let keyLabel = '', faceButton = false;
  if (isGamepadMode(currentControllerType) && key) {
    const control = key === 'SPACE' ? 'work' : 'park';
    const [text, label] = promptButtons(currentControllerType, control)[0];
    faceButton = isFaceButton(currentControllerType, control);
    key = text; keyLabel = label || text;
  } else if (currentControllerType === 'touch') {
    if (key === 'SPACE') { key = 'WORK'; alternative = ''; }
    else if (key === 'F') { key = 'TAP'; alternative = parked ? 'PICK UP TOOL' : 'PARK TOOL'; }
  }
  interactionProjection.copy(interactionPosition).project(camera);
  if (interactionProjection.z < -1 || interactionProjection.z > 1 || Math.abs(interactionProjection.x) > 1 || Math.abs(interactionProjection.y) > 1) { prompt.hidden = true; return; }
  prompt.hidden = false;
  const keyElement = $('interaction-key'), actionElement = $('interaction-action'), alternativeElement = $('interaction-alternative');
  if (keyElement.textContent !== key) keyElement.textContent = key;
  if (keyLabel) keyElement.setAttribute('aria-label', keyLabel); else keyElement.removeAttribute('aria-label');
  keyElement.classList.toggle('gamepad-face', faceButton);
  keyElement.hidden = !key;
  if (actionElement.textContent !== action) actionElement.textContent = action;
  if (alternativeElement.textContent !== alternative) alternativeElement.textContent = alternative;
  alternativeElement.hidden = !alternative;
  prompt.style.left = `${Math.max(80, Math.min(innerWidth - 80, (interactionProjection.x + 1) * innerWidth / 2))}px`;
  prompt.style.top = `${Math.max(45, Math.min(innerHeight - 10, (1 - interactionProjection.y) * innerHeight / 2))}px`;
}

function nearestTarget() {
  const front = new THREE.Vector3(0, 0, -TOOL_OFFSET).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.rotation.y).add(rig.position);
  const distance = i => Math.hypot(plots[i].x - front.x, plots[i].z - front.z);
  const phase = PHASES[state.phase];
  if (!phase) return null;
  const eligible = i => canWork(state, state.plots[i], phase.tool || activeTool);
  if (pinnedTarget !== null && eligible(pinnedTarget)) return pinnedTarget;
  pinnedTarget = null;
  let best = null, bestDist = Infinity;
  plots.forEach((plot, i) => {
    const d = distance(i);
    if (d < bestDist && eligible(i)) { bestDist = d; best = i; }
  });
  return best;
}
function animateTracks(travel, turn = 0) {
  const movement = [
    (travel - turn * trackSpacing * MACHINE_SCALE) / (MACHINE_SCALE * trackScale),
    (travel + turn * trackSpacing * MACHINE_SCALE) / (MACHINE_SCALE * trackScale)
  ];
  for (let side = 0; side < 2; side++) treadDistance[side] += movement[side];
  for (const tread of treads) positionTread(tread.mesh, tread.offset - treadDistance[tread.side]);
  for (const wheel of wheels) wheel.mesh.rotation.z -= movement[wheel.side] / wheel.radius;
}

function setScreenMove(direction) {
  screenMove = direction;
  document.querySelectorAll('[data-move]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.move === direction)));
}
function setScreenWork(enabled) {
  screenWork = enabled;
  $('screen-work').setAttribute('aria-pressed', String(enabled));
  $('screen-work').textContent = enabled ? 'WORK: ON' : 'WORK: OFF';
  $('touch-work').setAttribute('aria-pressed', String(enabled));
}
function clearInputs() {
  haptics.stop();
  stopPreview();
  sounds.stopAll();
  keys.clear(); dragging = false; touchCamera.clear(); touchWorkPointer = null; resetJoystick();
  $('touch-work').classList.remove('pressed');
  setScreenMove(null); setScreenWork(false); gamepadWorkReady = false; previousWorking = false;
}
$('debug-visibility').addEventListener('click', () => {
  const hidden = $('app').classList.toggle('ui-hidden');
  const label = hidden ? 'Show interface' : 'Hide interface';
  $('debug-visibility').setAttribute('aria-pressed', String(hidden));
  $('debug-visibility').setAttribute('aria-label', label);
  $('debug-visibility').title = label;
  clearInputs();
});
window.setSiloPreview = value => {
  siloPreview = validateSiloPreview(value);
  updateSilo(siloPreview === null ? state.totalHarvested : siloPreview);
  return siloPreview;
};
$('haptics-toggle').addEventListener('click', event => {
  const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  haptics.setEnabled(enabled);
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
  event.currentTarget.textContent = `HAPTICS: ${enabled ? 'ON' : 'OFF'}`;
});
$('sound-effects-toggle').addEventListener('click', event => {
  const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  if (!enabled) stopPreview();
  sounds.setEnabled(enabled);
  $('audio-mixer-controls').querySelectorAll('button').forEach(button => { button.disabled = !enabled; });
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
  event.currentTarget.textContent = `SOUND EFFECTS: ${enabled ? 'ON' : 'OFF'}`;
  if (enabled) sounds.unlock();
});
function toggleMachine() {
  if (!started || !$('info').hidden || restCutscene) return;
  if (switching || plantingActive || plantReturn) {
    message('Finish the current task before parking or picking up the machine.');
    return;
  }
  if (!parked && Math.hypot(rig.position.x, rig.position.z) > MOVEMENT_RADIUS) {
    message('Move the machine back inside the field before parking it.');
    return;
  }
  if (parked) {
    const handle = rig.localToWorld(new THREE.Vector3(0, 0, 1.05));
    if (Math.hypot(astronaut.position.x - handle.x, astronaut.position.z - handle.z) > MACHINE_PICKUP_REACH) {
      message('Return to the machine handle to pick it up.');
      return;
    }
    clearInputs();
    rig.attach(astronaut);
    astronaut.position.set(0, 0, 1.05); astronaut.rotation.set(0, 0, 0);
    parked = false;
    message('Machine picked up.');
  } else {
    clearInputs();
    work = 0; workTarget = null; workPhase = null; workRoute = null; snap = null;
    attachmentPivot.rotation.x = 0;
    detachUpright(scene, astronaut);
    parked = true;
    message(`Machine parked. Press ${promptText(currentControllerType, 'park')} or the machine button near its handle to pick it up.`);
  }
  updateToolUI();
  haptics.trigger('attach', performance.now());
  persistProgress();
}

function startIrrigation() {
  if (irrigationRemaining > 0) { message('The sprinklers are already running.'); return; }
  if (PHASES[state.phase]?.action !== 'water') { message('The sprinklers are only needed during an irrigation objective.'); return; }
  if (!canStartIrrigation(state)) { message('Wait until every plot is ready for its irrigation check.'); return; }
  irrigationRemaining = IRRIGATION_SECONDS;
  haptics.trigger('irrigation', performance.now());
  setScreenWork(false);
  message(`Sprinklers on for ${IRRIGATION_SECONDS} seconds.`);
  persistProgress();
}

function setToolMenuOpen(open) {
  $('tool-menu').parentElement.classList.toggle('tools-open', open);
  $('tools-toggle').setAttribute('aria-expanded', String(open));
}
function setControlsVisible(visible) {
  if (visible) setToolMenuOpen(false);
  $('screen-controls').hidden = !visible;
  $('touch-controls').hidden = visible;
  $('controls-button').setAttribute('aria-expanded', String(visible));
  clearInputs();
}
setControlsVisible(false);
function resetJoystick() {
  joystickPointer = null; joystick = { right: 0, forward: 0 };
  $('joystick-knob').style.transform = 'translate(-50%, -50%)';
}
function updateJoystick(event) {
  const rect = $('joystick').getBoundingClientRect(), radius = rect.width / 2;
  joystick = joystickVector(event.clientX - (rect.left + radius), event.clientY - (rect.top + radius), radius);
  $('joystick-knob').style.transform = `translate(calc(-50% + ${joystick.right * radius}px), calc(-50% - ${joystick.forward * radius}px))`;
}
$('joystick').addEventListener('pointerdown', event => {
  if (joystickPointer !== null || !started || !$('info').hidden || restCutscene) return;
  event.preventDefault(); joystickPointer = event.pointerId;
  $('joystick').setPointerCapture(event.pointerId); updateJoystick(event);
});
$('joystick').addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) updateJoystick(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('joystick').addEventListener(type, event => { if (event.pointerId === joystickPointer) resetJoystick(); });
}
$('touch-work').addEventListener('pointerdown', event => {
  if (touchWorkPointer !== null || !started || !$('info').hidden || restCutscene) return;
  event.preventDefault(); touchWorkPointer = event.pointerId;
  $('touch-work').setPointerCapture(event.pointerId); $('touch-work').classList.add('pressed');
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('touch-work').addEventListener(type, event => {
    if (event.pointerId === touchWorkPointer) { touchWorkPointer = null; $('touch-work').classList.remove('pressed'); }
  });
}
$('touch-work').addEventListener('click', event => { if (event.detail === 0) setScreenWork(!screenWork); });
$('tools-toggle').addEventListener('click', () => {
  const open = $('tools-toggle').getAttribute('aria-expanded') !== 'true';
  if (open && !$('screen-controls').hidden) setControlsVisible(false);
  setToolMenuOpen(open);
});
$('machine-toggle').addEventListener('click', toggleMachine);
$('controls-button').addEventListener('click', () => setControlsVisible($('screen-controls').hidden));
document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
  setScreenWork(false);
  setScreenMove(screenMove === button.dataset.move ? null : button.dataset.move);
}));
$('screen-work').addEventListener('click', () => { setScreenMove(null); setScreenWork(!screenWork); });
document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.camera;
  if (action === 'left') cameraAngle += 0.25;
  if (action === 'right') cameraAngle -= 0.25;
  if (action === 'up') cameraPitch = Math.max(CAMERA_MIN_PITCH, cameraPitch - 0.15);
  if (action === 'down') cameraPitch = Math.min(CAMERA_MAX_PITCH, cameraPitch + 0.15);
  if (action === 'in') cameraDistance = Math.max(7, cameraDistance - 1);
  if (action === 'out') cameraDistance = Math.min(20, cameraDistance + 1);
}));
if (saved) $('start-button').firstChild.textContent = 'RESUME THE MISSION ';
$('start-button').addEventListener('click', () => { $('intro').hidden = true; started = true; message(saved ? 'Welcome back. Your progress has been restored.' : 'Welcome to the farm module. Follow your first objective.'); renderer.domElement.focus(); });
$('info-button').addEventListener('click', () => { clearInputs(); $('info').hidden = false; $('close-info').focus(); });
$('close-info').addEventListener('click', () => { stopPreview(); $('info').hidden = true; $('info-button').focus(); });
let resetOpener = null;
document.querySelectorAll('.reset-progress').forEach(button => button.addEventListener('click', () => {
  clearInputs();
  resetOpener = button;
  $('reset-confirmation').checked = false;
  $('reset-confirm').disabled = true;
  $('reset-error').hidden = true;
  $('reset-dialog').showModal();
  $('reset-cancel').focus();
}));
$('reset-confirmation').addEventListener('change', () => { $('reset-confirm').disabled = !$('reset-confirmation').checked; });
$('reset-cancel').addEventListener('click', () => $('reset-dialog').close());
$('reset-dialog').addEventListener('close', () => { if (resetOpener) resetOpener.focus(); });
$('reset-confirm').addEventListener('click', () => {
  if (!$('reset-confirmation').checked) return;
  const wasSavingBlocked = savingBlocked;
  savingBlocked = true;
  try {
    resetProgress(storage || window.localStorage);
  } catch (error) {
    savingBlocked = wasSavingBlocked;
    console.error('Unable to delete saved progress:', error);
    $('reset-error').textContent = 'Could not delete progress. Check browser site storage and try again.';
    $('reset-error').hidden = false;
    return;
  }
  window.location.reload();
});
document.querySelectorAll('.tool').forEach(button => {
  const showDescription = () => {
    $('tool-description').textContent = button.dataset.description;
    $('tool-description').hidden = false;
  };
  button.addEventListener('mouseenter', showDescription);
  button.addEventListener('focus', showDescription);
  button.addEventListener('mouseleave', () => {
    if (document.activeElement !== button) $('tool-description').hidden = true;
  });
  button.addEventListener('blur', () => { $('tool-description').hidden = true; });
  button.addEventListener('click', () => { showDescription(); selectTool(button.dataset.tool); });
});
renderer.domElement.tabIndex = 0;
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
function targetPlot(x, y) {
  if (!started || !$('info').hidden || restCutscene) return;
  mouse.set(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(plots.map(plot => plot.soil))[0];
  if (hit) {
    const requested = hit.object.userData.plot;
    pinnedTarget = requested;
    if (nearestTarget() === requested) message('Plot selected. Hold Work to approach.');
    else message('That plot is not ready for the current objective.');
  }
}
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') {
    if (started && $('info').hidden && !restCutscene && touchCamera.start(event.pointerId, event.clientX, event.clientY)) renderer.domElement.setPointerCapture(event.pointerId);
  } else if (event.button === 2) {
    dragging = true; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId);
  } else if (event.button === 0 && event.pointerType !== 'touch') targetPlot(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') {
    const gesture = touchCamera.move(event.pointerId, event.clientX, event.clientY);
    if (gesture && gesture.zoom !== undefined) {
      cameraDistance = THREE.MathUtils.clamp(cameraDistance * gesture.zoom, 7, 20);
    } else if (gesture) {
      cameraAngle -= gesture.dx * 0.006;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + gesture.dy * 0.005, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
    }
    return;
  }
  if (!dragging) return;
  cameraAngle -= (event.clientX - lastX) * 0.006;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + (event.clientY - lastY) * 0.005, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
  lastX = event.clientX; lastY = event.clientY;
});
renderer.domElement.addEventListener('pointerup', event => {
  if (event.pointerType === 'touch') {
    if (touchCamera.end(event.pointerId)) targetPlot(event.clientX, event.clientY);
  } else dragging = false;
});
for (const type of ['pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(type, event => {
  if (event.pointerType === 'touch') touchCamera.end(event.pointerId, true);
  else dragging = false;
});
window.addEventListener('wheel', event => {
  if (!started || !$('info').hidden || restCutscene) return;
  event.preventDefault();
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + wheelZoomDelta(event.deltaY, event.deltaMode, event.ctrlKey), 7, 20);
}, { passive: false });
window.addEventListener('keydown', event => {
  if (event.code === 'Escape') {
    if ($('reset-dialog').open) {
      if (!event.repeat) { event.preventDefault(); $('reset-dialog').close(); }
      return;
    }
    if (!started || event.repeat) return;
    event.preventDefault();
    ($('info').hidden ? $('info-button') : $('close-info')).click();
    return;
  }
  if (!started || !$('info').hidden || restCutscene) return;
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  if (!pressKeyboardKey(keys, event)) return;
  if (screenMove && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) setScreenMove(null);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'Digit1') selectTool('tiller');
  if (event.code === 'Digit2') selectTool('plow');
  if (event.code === 'Digit3') selectTool('auger');
  if (event.code === 'Digit4') selectTool('sifter');
  if (event.code === 'KeyF') toggleMachine();
  if (event.code === 'KeyC') { cameraPan.x = 0; cameraPan.z = 0; }
  if (event.code === 'Equal' || event.code === 'NumpadAdd') cameraDistance = Math.max(7, cameraDistance - 1);
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') cameraDistance = Math.min(20, cameraDistance + 1);
});
function requestRest() {
  if (!started || !$('info').hidden || restCutscene) return;
  if (!nearRestDoor(parked ? astronaut.position : rig.position)) message('Approach the habitat door to rest.');
  else if (!isNight(state.minutes)) message('Rest is available at night, from 19:00 to 06:00.');
  else if (switching || plantingActive || plantReturn) message('Finish the current task before resting.');
  else if (irrigationRemaining > 0) message('Wait for the sprinklers to finish before resting.');
  else {
    if (!restScene) restScene = createRestScene();
    rest(state); clearInputs(); persistProgress();
    work = 0; workTarget = null; workPhase = null; workRoute = null; snap = null; attachmentPivot.rotation.x = 0;
    gait.blend = 0; astronaut.position.y = parked ? 0.05 : 0;
    restCutscene = { time: 0 };
    $('rest-caption').textContent = 'Returning to the habitat';
    $('rest-fade').style.opacity = '0';
    $('rest-cutscene').hidden = false; $('app').classList.add('resting');
  }
}
window.addEventListener('keyup', event => keys.delete(event.code), true);
window.addEventListener('blur', clearInputs);
window.addEventListener('pagehide', () => { persistProgress(); clearInputs(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { persistProgress(); clearInputs(); } });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (restScene) { restScene.view.aspect = innerWidth / innerHeight; restScene.view.updateProjectionMatrix(); }
  renderer.setSize(innerWidth, innerHeight);
});

const skyDirection = new THREE.Vector3();
const daytimeColor = new THREE.Color(0xc8916e), nighttimeColor = new THREE.Color(0x202c42);
function updateSky() {
  const sky = marsSky(state.sol, state.minutes);
  const daylight = THREE.MathUtils.smoothstep(sky.sun.y, -0.07, 0.12);
  const place = (object, direction, radius) => {
    object.visible = direction.y > 0;
    skyDirection.set(direction.x, direction.y, direction.z);
    object.position.copy(camera.position).addScaledVector(skyDirection, skyDistance);
    object.scale.setScalar(radius);
  };
  place(skySun, sky.sun, skyDistance * 0.00308);
  place(skyPhobos, sky.phobos, skyDistance * sky.phobos.angularRadius);
  place(skyDeimos, sky.deimos, Math.max(0.055, skyDistance * sky.deimos.angularRadius));
  phobosMaterial.uniforms.sunDirection.value.set(sky.sun.x, sky.sun.y, sky.sun.z);
  const deimosPhase = (1 - (sky.sun.x * sky.deimos.x + sky.sun.y * sky.deimos.y + sky.sun.z * sky.deimos.z)) / 2;
  skyDeimos.material.color.setRGB(0.35 + 0.54 * deimosPhase, 0.33 + 0.51 * deimosPhase, 0.3 + 0.46 * deimosPhase);
  nightSky.position.copy(camera.position);
  starMaterial.opacity = 1 - daylight;
  nightSky.visible = starMaterial.opacity > 0.01;
  sun.position.set(sky.sun.x, sky.sun.y, sky.sun.z).multiplyScalar(50);
  sun.intensity = 2.5 * daylight;
  hemi.intensity = 0.45 + 1.65 * daylight;
  scene.background.lerpColors(nighttimeColor, daytimeColor, daylight);
  scene.fog.color.copy(scene.background);
  $('scene').style.setProperty('--night-opacity', String(0.32 * (1 - daylight)));
}

let previous = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000, 1); previous = now;
  if (document.hidden) return;
  const connectedGamepad = navigator.getGamepads ? Array.from(navigator.getGamepads()).find(pad => pad && pad.mapping === 'standard') : null;
  const gamepadIdentity = connectedGamepad ? `${connectedGamepad.index}:${connectedGamepad.id}` : null;
  if (gamepadIdentity !== currentGamepadIdentity) {
    currentGamepadIdentity = gamepadIdentity;
    previousGamepadButtons = []; previousGamepadActive = false; gamepadWorkReady = false;
    setPromptMode(connectedGamepad ? controllerType(connectedGamepad) : lastNonGamepadType);
  }
  const gamepad = readGamepad(connectedGamepad);
  haptics.setGamepad(connectedGamepad);
  const gamepadActive = Boolean(gamepad.right || gamepad.forward || gamepad.orbit || gamepad.tilt || gamepad.buttons.some(Boolean));
  if (gamepadActive) {
    haptics.setSource('gamepad');
    if (!previousGamepadActive || gamepad.buttons.some((pressed, index) => pressed && !previousGamepadButtons[index])) {
      setPromptMode(controllerType(connectedGamepad));
      sounds.unlock();
    }
  }
  previousGamepadActive = gamepadActive;
  const wasStarted = started;
  const menuRoot = $('reset-dialog').open ? $('reset-dialog') : !started ? $('intro') : !$('info').hidden ? $('info') : null;
  if (menuRoot) {
    const reset = menuRoot === $('reset-dialog'), intro = menuRoot === $('intro');
    if (!reset && !intro && newlyPressed(gamepad.buttons, previousGamepadButtons, 9)) $('close-info').click();
    else gamepadMenu.update(menuRoot, reset ? $('reset-cancel') : intro ? $('start-button') : $('close-info'),
        reset ? null : intro ? document.querySelector('.intro-plan') : document.querySelector('.info-card'),
        gamepad, previousGamepadButtons, now, dt, () => {
          if (reset) $('reset-dialog').close();
          else if (!intro) $('close-info').click();
        });
    gamepadWorkReady = false;
  } else {
    gamepadMenu.reset();
    if (!gamepad.buttons[0]) gamepadWorkReady = true;
  }
  if (!menuRoot && started && !restCutscene && wasStarted) {
    if (newlyPressed(gamepad.buttons, previousGamepadButtons, 9)) {
      if ($('info').hidden) $('info-button').click(); else $('close-info').click();
    }
    if ($('info').hidden) {
      if (newlyPressed(gamepad.buttons, previousGamepadButtons, 4)) selectTool(toolTypes[(toolTypes.indexOf(activeTool) + toolTypes.length - 1) % toolTypes.length]);
      if (newlyPressed(gamepad.buttons, previousGamepadButtons, 5)) selectTool(toolTypes[(toolTypes.indexOf(activeTool) + 1) % toolTypes.length]);
      if (newlyPressed(gamepad.buttons, previousGamepadButtons, 1)) toggleMachine();
    }
  }
  if (!started || !$('info').hidden || restCutscene || !wasStarted) gamepadWorkReady = false;
  previousGamepadButtons = gamepad.buttons;
  if (restCutscene) { if ($('info').hidden) updateRestCutscene(dt); return; }
  if (started && $('info').hidden) {
    let hapticAction = null;
    const previousAstronautX = astronaut.position.x, previousAstronautZ = astronaut.position.z;
    elapsed += dt; advance(state, dt); updateSwitch(dt);
    if (irrigationRemaining > 0) {
      irrigationRemaining = Math.max(0, irrigationRemaining - dt);
      if (irrigationRemaining === 0) {
        completeIrrigation(state);
        haptics.trigger('complete', now);
        message('Sprinklers stopped automatically. Irrigation complete.');
        persistProgress();
      }
    }
    spray.visible = irrigationRemaining > 0;
    if (spray.visible) updateSpray(elapsed);
    if (plantReturn) {
      plantReturn.time = Math.min(0.6, plantReturn.time + dt);
      const progress = THREE.MathUtils.smoothstep(plantReturn.time, 0, 0.6);
      astronaut.position.x = THREE.MathUtils.lerp(plantReturn.x, 0, progress);
      astronaut.position.z = THREE.MathUtils.lerp(plantReturn.z, 1.05, progress);
      astronaut.rotation.y = plantReturn.angle + Math.atan2(Math.sin(-plantReturn.angle), Math.cos(-plantReturn.angle)) * progress;
      plantBend = plantReturn.bend * (1 - progress);
      if (progress === 1) plantReturn = null;
    }
    let walkingDistance = Math.hypot(astronaut.position.x - previousAstronautX, astronaut.position.z - previousAstronautZ);
    saveTimer += dt;
    if (saveTimer >= 1) { persistProgress(); saveTimer = 0; }
    mounted.plow.userData.wings.forEach((wing, index) => {
      wing.rotation.y = (index === 0 ? -1 : 1) * (state.phase === 5 ? -0.65 : 0.65);
    });
    const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + Number(screenMove === 'right') - Number(screenMove === 'left') + gamepad.right + joystick.right;
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) + Number(screenMove === 'forward') - Number(screenMove === 'back') + gamepad.forward + joystick.forward;
    const working = keys.has('Space') || screenWork || touchWorkPointer !== null || (gamepadWorkReady && gamepad.buttons[0]);
    if (working && !previousWorking) {
      if (parked && nearWaterSwitch(astronaut.position)) startIrrigation();
      else if (nearRestDoor(parked ? astronaut.position : rig.position)) {
        requestRest();
        if (restCutscene) return;
      }
    }
    previousWorking = working;
    const pan = cameraRelativeMovement(Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')), Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown')), cameraAngle);
    cameraPan.x += pan.x * dt * 3;
    cameraPan.z += pan.z * dt * 3;
    const panDistance = Math.hypot(cameraPan.x, cameraPan.z);
    if (panDistance > 8) { cameraPan.x *= 8 / panDistance; cameraPan.z *= 8 / panDistance; }
    cameraAngle += (Number(keys.has('KeyE')) - Number(keys.has('KeyQ')) - gamepad.orbit) * dt * 1.5;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + (Number(keys.has('KeyK')) - Number(keys.has('KeyI')) + gamepad.tilt) * dt, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
    cameraDistance = THREE.MathUtils.clamp(cameraDistance + (Number(gamepad.buttons[6]) - Number(gamepad.buttons[7])) * dt * 5, 7, 20);
    const moving = (right !== 0 || forward !== 0) && !switching && !working && !plantingActive && !plantReturn;
    if (parked && !moving) astronaut.rotation.y = followCameraTurn(astronaut.rotation.y, previousCameraAngle, cameraAngle);
    previousCameraAngle = cameraAngle;
    if (moving) {
      camera.getWorldDirection(viewDirection);
      const direction = cameraRelativeMovement(right, forward, Math.atan2(-viewDirection.x, -viewDirection.z));
      const dx = direction.x, dz = direction.z;
      const movingObject = parked ? astronaut : rig;
      const oldX = movingObject.position.x, oldZ = movingObject.position.z;
      const speed = Math.min(1, Math.hypot(right, forward));
      movingObject.position.x += dx * dt * 2.3 * speed; movingObject.position.z += dz * dt * 2.3 * speed;
      const radius = Math.hypot(movingObject.position.x, movingObject.position.z), limit = parked ? WALK_RADIUS : MOVEMENT_RADIUS;
      if (radius > limit) { movingObject.position.x *= limit / radius; movingObject.position.z *= limit / radius; }
      movingObject.rotation.y = Math.atan2(-dx, -dz);
      machine.position.y = parked ? 0 : Math.abs(Math.sin(elapsed * 10)) * 0.035;
      const travel = Math.hypot(movingObject.position.x - oldX, movingObject.position.z - oldZ);
      walkingDistance += travel;
      if (travel > 0.00001) hapticAction = parked ? 'walk' : 'tracks';
      if (!parked) animateTracks(travel);
    } else machine.position.y = 0;
    if (!working) { workPhase = null; workRoute = null; }
    let nextRoute = null;
    if (working && workTarget === null && workPhase === state.phase && workRoute) {
      const eligible = state.plots.flatMap((plot, index) => canWork(state, plot, activeTool) ? [index] : []);
      nextRoute = nextSerpentinePlot(eligible, workRoute.index, workRoute.direction);
    }
    currentTarget = parked ? null : workTarget !== null && working && !switching ? workTarget : workRoute && working && workPhase === state.phase ? (nextRoute ? nextRoute.index : null) : nearestTarget();
    const phase = PHASES[state.phase], plot = state.plots[currentTarget];
    if (phase && currentTarget !== null && working && !switching && !plantReturn && (workPhase === null || workPhase === state.phase) && canWork(state, plot, activeTool)) {
      if (workTarget !== currentTarget) {
        work = 0; workTarget = currentTarget; workPhase = state.phase;
        workRoute = nextRoute || { index: currentTarget, direction: currentTarget % PLOT_COLUMNS < PLOT_COLUMNS / 2 ? -1 : 1 };
        const start = { x: rig.position.x, z: rig.position.z, angle: rig.rotation.y };
        snap = createApproach(start, digAlignment(start, plots[currentTarget], TOOL_OFFSET, MOVEMENT_RADIUS, MACHINE_OFFSET), MACHINE_OFFSET);
      }
      const { pose, travel, turn, workSeconds } = advanceApproach(snap, dt);
      if (snap.elapsed <= snap.duration && (workSeconds < dt)) {
        rig.position.x = pose.x; rig.position.z = pose.z; rig.rotation.y = pose.angle;
        walkingDistance += travel + Math.abs(turn) * (MACHINE_OFFSET + 1.05);
        if (travel > 0.00001 || Math.abs(turn) > 0.00001) hapticAction = 'tracks';
        animateTracks(travel, turn);
      }
      const previousWork = work;
      work += workSeconds;
      const operating = snap.elapsed >= snap.duration;
      if (operating && workSeconds > 0) hapticAction = phase.action;
      if (operating && phase.action === 'plant') {
        if (previousWork < phase.duration * 0.4 && work >= phase.duration * 0.4) sounds.play('pickup');
        const oldX = astronaut.position.x, oldZ = astronaut.position.z;
        plantingActive = true; plantingPlot = currentTarget;
        plantPose = plantingPose(work / phase.duration);
        astronaut.position.x = plantPose.x; astronaut.position.z = plantPose.z; astronaut.rotation.y = plantPose.angle;
        plantBend = plantPose.bend;
        plots[currentTarget].seed.visible = plantPose.planted;
        walkingDistance += Math.hypot(astronaut.position.x - oldX, astronaut.position.z - oldZ);
      }
      attachmentPivot.rotation.x = operating && state.phase === 0 ? 0.08 * (1 + Math.sin(elapsed * 8)) : 0;
      if (operating && activeTool === 'auger') mounted.auger.userData.auger.rotation.y += workSeconds * 8;
      if (operating && activeTool === 'sifter' && state.phase === 7) mounted.sifter.userData.basket.position.y = Math.sin(elapsed * 40) * 0.025;
      if (work >= phase.duration) {
        stopPlanting(false);
        completeWork(state, plot); work = 0; workTarget = null; snap = null; pinnedTarget = null; attachmentPivot.rotation.x = 0;
        haptics.trigger('complete', now);
        persistProgress();
        mounted.sifter.userData.basket.position.y = 0;
        if (state.phase !== workPhase) setScreenWork(false);
        if (state.phase >= PHASES.length) message('Mission complete! The first harvest is ready.');
        else message(state.phase !== PHASES.indexOf(phase) ? `Objective complete. Release Work, then ${PHASES[state.phase].title.toLowerCase()}.` : `Plot ${currentTarget + 1} complete.`);
      }
    } else { stopPlanting(true); work = 0; workTarget = null; snap = null; attachmentPivot.rotation.x = 0; mounted.sifter.userData.basket.position.y = 0; }
    haptics.update(hapticAction, now);
    const tillerRunning = isTillerRunning(state, { working, parked, switching, activeTool });
    if (tillerRunning) mounted.tiller.userData.roller.rotation.x -= dt * 8;
    const toolSound = tillerRunning ? 'tiller' : toolSounds[hapticAction] || null;
    sounds.setLoop('tool', toolSound);
    sounds.setLoop('water', irrigationRemaining > 0 ? 'water' : null);
    rememberSafePosition();
    advanceGait(gait, walkingDistance, dt);
    astronaut.position.y = (parked ? 0.05 : 0) + gaitBodyOffset(gait) - 0.12 * plantBend;
    upperBody.rotation.x = -0.8 * plantBend;
    for (let i = 0; i < legs.length; i++) {
      const pose = gaitLegPose(gait, i);
      legs[i].hip.rotation.x = THREE.MathUtils.lerp(pose.hip, 0.45, plantBend);
      legs[i].knee.rotation.x = THREE.MathUtils.lerp(pose.knee, -0.9, plantBend);
      legs[i].foot.rotation.x = THREE.MathUtils.lerp(pose.ankle, 0.45, plantBend);
    }
    const reaching = switching && switching.time >= 0.8 && switching.time < 2.7;
    for (let i = 0; i < arms.length; i++) {
      arms[i].arm.visible = !parked;
      arms[i].walkingArm.visible = parked;
      arms[i].walkingArm.rotation.x = gaitArmSwing(gait, i);
      arms[i].arm.rotation.x = reaching ? 0.5 + Math.sin(elapsed * 6) * 0.12 : -(i === 1 ? 1.35 : 0.65) * plantBend;
    }
    carriedSeed.visible = Boolean(plantingActive && plantPose && plantPose.carrying);
    if (carriedSeed.visible) {
      rig.updateMatrixWorld(true);
      arms[1].hand.getWorldPosition(seedHandPosition);
      rig.worldToLocal(seedHandPosition);
      carriedSeed.position.copy(seedHandPosition).lerp(seedGroundPosition, plantPose.drop);
    }
    switchBeacon.visible = PHASES[state.phase]?.action === 'water' && irrigationRemaining === 0;
    switchDiamond.rotation.y = elapsed * 2;
    switchBeacon.position.y = 2.2 + Math.sin(elapsed * 2.5) * 0.1;
    astronaut.getWorldPosition(astronautWorld);
    if (switchBeacon.visible) {
      objectiveGuide.update(astronautWorld, switchBeacon.position, reducedMotion.matches ? 0 : elapsed,
        !nearWaterSwitch(astronautWorld));
    } else {
      rig.localToWorld(guideDestination.set(0, 0, 1.05));
      objectiveGuide.update(astronautWorld, guideDestination, reducedMotion.matches ? 0 : elapsed,
        shouldGuideToMachine(state, parked, astronautWorld, guideDestination));
    }
    const night = isNight(state.minutes);
    if (night && !previousNight) message(`Nightfall: approach the habitat door and press ${promptText(currentControllerType, 'work')} or Work to rest.`);
    previousNight = night;
    doorBeacon.visible = night;
    doorBeacon.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.1);
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
    updatePlots(); updateUI();
  }
  const cameraFocus = parked ? astronaut.position : rig.position;
  targetPoint.set(cameraFocus.x + cameraPan.x, 0.7, cameraFocus.z - 1.2 + cameraPan.z);
  const { orbitPitch, aimOffset } = cameraTilt(cameraPitch, cameraDistance);
  cameraPoint.set(targetPoint.x + Math.sin(cameraAngle) * Math.cos(orbitPitch) * cameraDistance, targetPoint.y + Math.sin(orbitPitch) * cameraDistance, targetPoint.z + Math.cos(cameraAngle) * Math.cos(orbitPitch) * cameraDistance);
  targetPoint.y += aimOffset;
  camera.position.lerp(cameraPoint, 0.08); camera.lookAt(targetPoint);
  camera.updateMatrixWorld();
  updateSky();
  updateInteractionPrompt();
  animateSilo(now, dt);
  renderer.render(scene, camera);
}
updateToolUI(); updatePlots(); updateUI(); requestAnimationFrame(frame);
