import * as THREE from '../vendor/three.module.js';
import { createState, createGait, advanceGait, cameraRelativeMovement, digAlignment, alignmentPose, PHASES, PLOT_COUNT, PLOT_COLUMNS, PLOT_ROWS, DIG_SECONDS, DIG_SPEED_MULTIPLIER, ASSUMED_MARS_DIG_SECONDS, STEP_LAUNCH_SPEED, advance, rest, isNight, growthStage, canWork, completeWork, phaseProgress } from './simulation.js';
import { readGamepad, newlyPressed, joystickVector } from './controls.js';

const $ = id => document.getElementById(id);
const state = createState();
const gait = createGait();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8916e);
scene.fog = new THREE.Fog(0xc8916e, 28, 72);
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
  red: material(0xc76c49), dirt: material(0x76513b), soil: material(0x503d30),
  worked: material(0x3e3027), sand: material(0xb96f50), floor: material(0xa58e74),
  green: material(0x719765), leaf: material(0x67965e), leafLight: material(0x9abb7d),
  cream: material(0xe7dcbf), light: new THREE.MeshBasicMaterial({ color: 0xffe5a7 }),
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

// Mars, habitat shell, and a deliberately low-poly landscape.
box(scene, mat.sand, 0, -0.5, 0, 120, 0.8, 120);
const hills = material(0xa9674d);
for (let i = 0; i < 17; i++) {
  const angle = i / 17 * Math.PI * 2;
  const rock = new THREE.Mesh(new THREE.ConeGeometry(3 + i % 4, 3 + i % 3, 7), hills);
  rock.position.set(Math.sin(angle) * 32, 0.2, Math.cos(angle) * 32);
  rock.rotation.y = i; scene.add(rock);
}
let randomSeed = 4301;
function random() {
  randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
  return randomSeed / 4294967296;
}
const exteriorRocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material(0x9e624a), 300);
const instanceTransform = new THREE.Object3D();
for (let i = 0; i < exteriorRocks.count; i++) {
  const angle = random() * Math.PI * 2, radius = 11 + random() * 18, size = 0.08 + random() * 0.42;
  instanceTransform.position.set(Math.cos(angle) * radius, -0.07 + size * 0.25, Math.sin(angle) * radius);
  instanceTransform.scale.set(size, size * (0.25 + random() * 0.5), size * (0.6 + random()));
  instanceTransform.rotation.set(random(), random() * Math.PI, random());
  instanceTransform.updateMatrix(); exteriorRocks.setMatrixAt(i, instanceTransform.matrix);
}
scene.add(exteriorRocks);
const platform = cylinder(scene, mat.floor, 0, -0.03, 0, 10.1, 0.22);
platform.scale.z = 1;
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
// Utility cabinets, reservoir and lighting reinforce the life-support concept.
for (const side of [-1, 1]) {
  box(scene, mat.suit, side * 8.7, 0.8, -2, 1.1, 1.6, 2);
  box(scene, mat.orange, side * 8.7, 1.15, -0.95, 0.7, 0.12, 0.06);
  cylinder(scene, mat.blue, side * 8.7, 1.8, -2.5, 0.5, 0.8);
  rod(scene, mat.darkSteel, [side * 7.5, 0, -5.6], [side * 7.5, 4, -5.6], 0.06);
  rod(scene, mat.darkSteel, [side * 7.5, 4, -5.6], [side * 5.7, 4, -5.6], 0.06);
  box(scene, mat.light, side * 6.6, 3.95, -5.6, 1.8, 0.08, 0.25);
}

const plots = [];
const soilDetails = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material(0x715741), PLOT_COUNT * 24);
const plotMaterial = [mat.soil, mat.worked, material(0x49382b), material(0x594332), material(0x614831), material(0x4c3b2b), material(0x66503a)];
const furrows = new THREE.InstancedMesh(sphereGeo, material(0x79543b), PLOT_COUNT * 5);
const aerationHoles = new THREE.InstancedMesh(new THREE.CircleGeometry(0.065, 8), material(0x241914), PLOT_COUNT * 16);
const plantingHoles = new THREE.InstancedMesh(new THREE.CircleGeometry(0.24, 20), material(0x211711), PLOT_COUNT);
const plantedMounds = new THREE.InstancedMesh(sphereGeo, material(0x926b4b), PLOT_COUNT);
const dampSoil = new THREE.InstancedMesh(new THREE.CircleGeometry(0.55, 24), material(0x302721), PLOT_COUNT);
const waterGlints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.055, 8), material(0x86a9a4), PLOT_COUNT * 3);
scene.add(soilDetails, furrows, aerationHoles, plantingHoles, dampSoil, plantedMounds, waterGlints);
function setPlotDetail(mesh, index, x, y, z, sx, sy, sz, flat = false) {
  instanceTransform.position.set(x, y, z);
  instanceTransform.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
  instanceTransform.scale.set(sx, sx === 0 ? 0 : sy, sx === 0 ? 0 : sz);
  instanceTransform.updateMatrix(); mesh.setMatrixAt(index, instanceTransform.matrix);
}
function updatePlotDetails(visual, index, stage) {
  const { x, z } = visual;
  for (let i = 0; i < 5; i++) {
    const visible = stage >= 1 && stage <= 3;
    setPlotDetail(furrows, index * 5 + i, x + (i - 2) * 0.3, 0.115, z, visible ? 0.075 : 0, 0.035, 0.75);
  }
  for (let i = 0; i < 16; i++) {
    const visible = stage === 2 || stage === 3;
    setPlotDetail(aerationHoles, index * 16 + i, x + (i % 4 - 1.5) * 0.4, 0.15, z + (Math.floor(i / 4) - 1.5) * 0.4, visible ? 1 : 0, 1, 1, true);
  }
  setPlotDetail(plantingHoles, index, x, 0.16, z, stage === 3 ? 1 : 0, 1, 1, true);
  setPlotDetail(plantedMounds, index, x, 0.12, z, stage === 4 || stage === 5 ? 0.32 : 0, 0.1, 0.32);
  setPlotDetail(dampSoil, index, x, 0.108, z, stage === 5 ? 1 : 0, 1, 1, true);
  for (let i = 0; i < 3; i++) {
    setPlotDetail(waterGlints, index * 3 + i, x + [-0.38, 0.4, 0][i], 0.112, z + [0.2, 0.1, -0.42][i], stage === 5 ? 1 : 0, 0.55, 1, true);
  }
  for (const mesh of [furrows, aerationHoles, plantingHoles, plantedMounds, dampSoil, waterGlints]) mesh.instanceMatrix.needsUpdate = true;
}
for (let row = 0; row < PLOT_ROWS; row++) {
  for (let col = 0; col < PLOT_COLUMNS; col++) {
    const index = row * PLOT_COLUMNS + col;
    const x = (col - (PLOT_COLUMNS - 1) / 2) * 2, z = (row - (PLOT_ROWS - 1) / 2) * 2.1 - 0.3;
    const group = new THREE.Group(); group.position.set(x, -0.2, z); scene.add(group);
    box(group, mat.suitDark, 0, 0.12, 0, 1.95, 0.24, 2.05);
    const soil = box(group, mat.soil, 0, 0.255, 0, 1.78, 0.09, 1.88);
    soil.userData.plot = index;
    for (let n = 0; n < 24; n++) {
      const size = 0.025 + random() * 0.035;
      instanceTransform.position.set(x + (random() - 0.5) * 1.6, 0.11, z + (random() - 0.5) * 1.7);
      instanceTransform.scale.set(size * 1.5, size * 0.3, size);
      instanceTransform.rotation.set(0, random() * Math.PI, 0);
      instanceTransform.updateMatrix(); soilDetails.setMatrixAt(index * 24 + n, instanceTransform.matrix);
    }
    // Thin irrigation lines run below the growing surface.
    for (const dx of [-0.5, 0.5]) box(group, mat.black, dx, 0.31, 0, 0.035, 0.025, 1.8);
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
    const ready = new THREE.Group(); ready.position.y = 1.25; group.add(ready);
    sphere(ready, mat.orange, 0, 0, 0, 0.19, 0.19, 0.19);
    rod(ready, mat.orange, [0, -0.34, 0], [0, -0.12, 0], 0.025);
    plant.visible = false; ready.visible = false;
    plots.push({ group, soil, marker, selected, plant, ready, x, z, lastStage: -1, lastGrowth: -1 });
  }
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
const TOOL_OFFSET = MACHINE_OFFSET + MACHINE_SCALE * MOUNT_OFFSET, MOVEMENT_RADIUS = 7.7;
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
const lidPivot = new THREE.Group(); lidPivot.position.set(-0.36, 0.21, 0); compartment.add(lidPivot);
const lid = tShapeMesh(mat.orange, 0.095); lid.position.x = 0.36; lidPivot.add(lid);
const lidPanel = tShapeMesh(mat.orangeDark, 0.01, 0.07); lidPanel.position.set(0.36, 0.1, 0); lidPivot.add(lidPanel);
const lidFace = tShapeMesh(mat.orange, 0.01, 0.095); lidFace.position.set(0.36, 0.112, 0); lidPivot.add(lidFace);
for (const z of [-0.42, 0.42]) cylinder(compartment, mat.darkSteel, -0.38, 0.2, z, 0.045, 0.14);
box(compartment, mat.darkSteel, 0.55, 0.24, 0.56, 0.08, 0.06, 0.18);
rod(machine, mat.black, [0, 1.41, 0.78], [0, 2.1, 1.95], 0.055);
rod(machine, mat.darkSteel, [0, 1.41, 0.78], [0, 1.52, 0.97], 0.074);
rod(machine, mat.black, [-0.42, 2.1, 1.95], [0.42, 2.1, 1.95], 0.065);
rod(machine, mat.black, [-0.42, 2.1, 1.95], [-0.3, 1.94, 1.83], 0.045);
rod(machine, mat.black, [0.42, 2.1, 1.95], [0.3, 1.94, 1.83], 0.045);
rod(machine, mat.black, [-0.3, 1.94, 1.83], [0.3, 1.94, 1.83], 0.045);
const attachmentPivot = new THREE.Group(); attachmentPivot.position.set(0, 0.34, -0.7); machine.add(attachmentPivot);
const pivotPin = cylinder(machine, mat.orangeDark, 0, 0.34, -0.7, 0.1, 0.28);
pivotPin.rotation.z = Math.PI / 2;
rod(attachmentPivot, mat.darkSteel, [0, 0, 0], [0, 0.06, -0.28], 0.08);
sphere(attachmentPivot, mat.darkSteel, 0, 0.06, -0.28, 0.11, 0.09, 0.09);
function makeTool(type, scale = 1) {
  const g = new THREE.Group(); g.scale.setScalar(scale);
  if (type === 'shovel') {
    rod(g, mat.darkSteel, [0, 0.27, 0], [0, 0.22, 0.35], 0.055);
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, 0.42); shape.lineTo(0.3, 0.42);
    shape.quadraticCurveTo(0.28, 0.12, 0, -0.12);
    shape.quadraticCurveTo(-0.28, 0.12, -0.3, 0.42);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.055, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }), mat.steel);
    blade.position.z = -0.05; blade.rotation.x = -0.25; g.add(blade);
    rod(g, mat.darkSteel, [0, 0.16, -0.08], [0, 0.45, 0.02], 0.035);
  } else if (type === 'auger') {
    rod(g, mat.darkSteel, [0, 0.05, 0], [0, 0.85, 0], 0.055);
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
    g.add(new THREE.Mesh(flight, material(0xaab5ad, { side: THREE.DoubleSide, metalness: 0.25 })));
  } else {
    const rollerGroup = new THREE.Group(); rollerGroup.position.y = 0.25; g.add(rollerGroup);
    const roller = cylinder(rollerGroup, mat.darkSteel, 0, 0, 0, 0.18, 0.8);
    roller.rotation.z = Math.PI / 2;
    for (let i = -2; i <= 2; i++) for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * 2 / 5;
      rod(rollerGroup, mat.steel, [i * 0.15, Math.cos(a) * 0.15, Math.sin(a) * 0.15], [i * 0.15, Math.cos(a) * 0.3, Math.sin(a) * 0.3], 0.035);
    }
    rod(g, mat.darkSteel, [-0.42, 0.25, 0], [-0.42, 0.65, 0.25], 0.035);
    rod(g, mat.darkSteel, [0.42, 0.25, 0], [0.42, 0.65, 0.25], 0.035);
    rod(g, mat.darkSteel, [-0.42, 0.65, 0.25], [0.42, 0.65, 0.25], 0.035);
    g.userData.roller = rollerGroup;
  }
  return g;
}
const mounted = {};
for (const type of ['shovel', 'aerator', 'auger']) {
  const tool = makeTool(type); tool.position.set(0, 0.12 - attachmentPivot.position.y, -MOUNT_OFFSET - attachmentPivot.position.z); attachmentPivot.add(tool);
  tool.visible = type === 'shovel'; mounted[type] = tool;
}
const stored = {};
for (const type of ['shovel', 'aerator', 'auger']) {
  const tool = makeTool(type, 0.4);
  if (type === 'aerator') tool.position.set(0, 0.26, 0.36);
  else tool.position.set(type === 'auger' ? -0.16 : 0.14, 0.26, -0.55);
  tool.rotation.x = Math.PI / 2; compartment.add(tool);
  tool.visible = false; stored[type] = tool;
}
const carried = {};
for (const type of ['shovel', 'aerator', 'auger']) {
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
function makeLeg(side) {
  const hip = new THREE.Group(); hip.position.set(side * 0.2, 0.96, 0); astronaut.add(hip);
  sphere(hip, mat.suitDark, 0, 0, 0, 0.16, 0.16, 0.16);
  rod(hip, mat.suit, [0, -0.03, 0], [0, -0.36, 0], 0.145);
  const knee = new THREE.Group(); knee.position.set(0, -0.4, 0); hip.add(knee);
  sphere(knee, mat.suitDark, 0, 0, 0, 0.145, 0.13, 0.15);
  sphere(knee, mat.white, 0, 0, -0.105, 0.12, 0.1, 0.07);
  rod(knee, mat.suit, [0, -0.04, 0], [0, -0.36, 0], 0.12);
  sphere(knee, mat.suitDark, 0, -0.35, 0, 0.13, 0.07, 0.13);
  sphere(knee, mat.black, 0, -0.44, -0.085, 0.16, 0.1, 0.245);
  box(knee, mat.darkSteel, 0, -0.51, -0.09, 0.29, 0.07, 0.4);
  return { hip, knee };
}
const legs = [makeLeg(-1), makeLeg(1)];
const arms = [];
for (const side of [-1, 1]) {
  const arm = new THREE.Group(); arm.position.set(side * 0.37, 1.53, 0); astronaut.add(arm);
  sphere(arm, mat.white, 0, 0, 0, 0.16, 0.16, 0.16);
  rod(arm, mat.suit, [0, -0.03, 0], [side * 0.09, -0.2, -0.22], 0.115);
  sphere(arm, mat.suitDark, side * 0.09, -0.2, -0.22, 0.12, 0.12, 0.12);
  sphere(arm, mat.white, side * 0.13, -0.2, -0.22, 0.065, 0.09, 0.09);
  rod(arm, mat.suit, [side * 0.09, -0.2, -0.22], [side * -0.03, 0.16, -0.3], 0.1);
  sphere(arm, mat.darkSteel, side * -0.03, 0.16, -0.3, 0.105, 0.07, 0.105);
  sphere(arm, mat.white, side * -0.03, 0.19, -0.3, 0.11, 0.1, 0.12);
  arms.push(arm);
}
rig.position.set(0, 0.05, 5.8);

let activeTool = 'shovel', switching = null, started = false, currentTarget = null, pinnedTarget = null;
let work = 0, workTarget = null, snap = null, toastTimer = 0, elapsed = 0;
let restCutscene = null, restScene = null;
const treadDistance = [0, 0];
const keys = new Set();
let screenMove = null, screenWork = false, previousGamepadButtons = [], gamepadWorkReady = false;
let joystickPointer = null, joystick = { right: 0, forward: 0 }, touchWorkPointer = null, touchCamera = null;
let cameraAngle = 0.38, cameraPitch = 0.62, cameraDistance = 11;
let dragging = false, lastX = 0, lastY = 0;
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
const targetPoint = new THREE.Vector3(), cameraPoint = new THREE.Vector3(), viewDirection = new THREE.Vector3();

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
  const clothing = material(0x658078), skin = material(0xc69a79), hair = material(0x4f4036);
  sphere(person, clothing, 0, 1.2, 0, 0.29, 0.46, 0.2);
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
    rod(arm, clothing, [0, 0, 0], [side * 0.05, -0.43, 0], 0.095);
    sphere(arm, skin, side * 0.05, -0.48, 0, 0.08, 0.09, 0.08);
    restLegs.push(leg); restArms.push(arm);
  }
  const suit = astronaut.clone(true); suit.position.set(0, 0, 0); suit.rotation.set(0, 0, 0); interior.add(suit);
  const suitHelmet = suit.getObjectByName('helmet');
  sphere(suit, skin, 0, 1.99, 0, 0.22, 0.27, 0.21);
  sphere(suit, hair, 0, 2.18, 0.02, 0.22, 0.09, 0.21);
  for (const x of [-0.07, 0.07]) sphere(suit, mat.black, x, 2.02, -0.19, 0.022, 0.025, 0.015);
  return { interior, view, door, person, restLegs, restArms, suit, suitHelmet };
}

function updateRestCutscene(dt) {
  const sequence = restCutscene;
  sequence.time = Math.min(5, sequence.time + dt);
  const t = sequence.time, { interior, view, door, person, restLegs, restArms, suit, suitHelmet } = restScene;
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
    suitHelmet.position.y = (1 - dressed) * 0.55;
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
    updatePlots(); updateUI(); renderer.render(scene, camera);
  }
  if (t >= 5) {
    restCutscene = null; $('rest-cutscene').hidden = true; $('app').classList.remove('resting');
    message('Rest complete. Crop growth advanced by 90 seconds.');
    renderer.domElement.focus();
  }
}

function message(text) {
  $('toast').textContent = text; $('toast').classList.add('show'); toastTimer = 3.5;
}
function selectTool(type) {
  if (!started || switching || restCutscene || activeTool === type) return;
  setScreenMove(null); setScreenWork(false);
  switching = { from: activeTool, to: type, time: 0 };
  work = 0; workTarget = null; snap = null;
  message(`Changing attachment: ${activeTool} → ${type}`);
}
function moveCarriedTool(type, progress) {
  const tool = carried[type];
  compartment.updateMatrix(); attachmentPivot.updateMatrix();
  const storagePosition = stored[type].position.clone().applyMatrix4(compartment.matrix);
  const mountedPosition = mounted[type].position.clone().applyMatrix4(attachmentPivot.matrix);
  tool.position.lerpVectors(mountedPosition, storagePosition, progress);
  tool.position.y += Math.sin(progress * Math.PI) * 0.3;
  tool.rotation.set(THREE.MathUtils.lerp(0, Math.PI / 2 + compartment.rotation.x, progress), 0, 0);
  tool.scale.setScalar(THREE.MathUtils.lerp(1, 0.4, progress));
}
function updateSwitch(dt) {
  if (!switching) return;
  switching.time += dt;
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
    updateToolUI();
  }
  for (const type of ['shovel', 'aerator', 'auger']) {
    const inCase = type === switching.from ? t >= 1.8 : type === switching.to ? t < 1.8 : true;
    stored[type].visible = lidPivot.rotation.z > 0.4 && inCase;
  }
  if (t >= 3.5) { astronaut.position.x = 0; astronaut.position.z = 1.05; astronaut.rotation.y = 0; lidPivot.rotation.z = 0; switching = null; }
}
function updateToolUI() {
  document.querySelectorAll('.tool').forEach(button => {
    const selected = button.dataset.tool === activeTool;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
  });
}
function updatePlots() {
  plots.forEach((visual, i) => {
    const plot = state.plots[i], stage = growthStage(plot.growth);
    if (visual.lastStage !== plot.stage || visual.lastGrowth !== stage) {
      visual.soil.material = plotMaterial[plot.stage];
      if (visual.lastStage !== plot.stage) updatePlotDetails(visual, i, plot.stage);
      visual.marker.visible = plot.stage < 3;
      visual.plant.visible = plot.stage === 5 && stage > 0;
      visual.plant.scale.setScalar([0.1, 0.35, 0.62, 0.85, 1.05][stage]);
      visual.ready.visible = plot.stage === 5 && stage === 4;
      visual.lastStage = plot.stage; visual.lastGrowth = stage;
    }
    visual.selected.visible = currentTarget === i;
    visual.selected.material.color.setHex(canWork(state, plot, activeTool) ? 0xffd69a : 0xe07862);
    if (visual.ready.visible) visual.ready.position.y = 1.25 + Math.sin(elapsed * 3 + i) * 0.08;
  });
  digMarker.visible = started && state.phase === 0 && currentTarget !== null && state.plots[currentTarget].stage === 0;
  digMarkerStem.visible = digMarker.visible;
  if (digMarker.visible) {
    const target = plots[currentTarget];
    digMarker.position.set(target.x, 1.3 + Math.sin(elapsed * 2.5) * 0.12, target.z);
    digMarker.rotation.set(0, elapsed * 2, Math.sin(elapsed * 1.7) * 0.14);
    digMarkerStem.position.set(target.x, 0.16, target.z);
    digMarkerStem.scale.y = digMarker.position.y - 0.53;
  }
}
function updateUI() {
  const phase = PHASES[state.phase], done = phaseProgress(state);
  $('objective-count').textContent = `${String(done).padStart(2, '0')} / ${PLOT_COUNT}`;
  $('objective-progress').style.width = `${done / PLOT_COUNT * 100}%`;
  $('objective').textContent = phase ? phase.title : 'The first harvest is complete';
  $('phase-number').textContent = phase ? `PHASE 0${state.phase + 1} / 06` : 'MISSION COMPLETE';
  $('phase-name').textContent = phase ? phase.name : 'WELL DONE';
  $('dig-speed').hidden = state.phase !== 0;
  $('dig-speed-note').hidden = state.phase !== 0;
  $('dig-speed-label').textContent = `${DIG_SPEED_MULTIPLIER}× DIGGING SPEED`;
  $('dig-speed-note').textContent = `*Illustrative ${ASSUMED_MARS_DIG_SECONDS}s/plot baseline; not measured.`;
  let instruction = 'Your crop is harvested. Thank you for exploring the concept.';
  if (phase) {
    if (switching) instruction = 'The astronaut is exchanging attachments.';
    else if (phase.tool && phase.tool !== activeTool) instruction = `Select the ${phase.tool} attachment.`;
    else if (state.phase === 0) instruction = `Move to a marked plot and work to dig. Each plot takes ${DIG_SECONDS} seconds.`;
    else if (state.phase === 5) instruction = 'Wait for orange harvest markers. Rest at night to accelerate growth.';
    else instruction = `Move to a marked plot and work to ${phase.action}.`;
  }
  $('instruction').textContent = instruction;
  const hours = Math.floor(state.minutes / 60), minutes = Math.floor(state.minutes % 60);
  $('clock').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  $('day-label').textContent = `SOL ${String(state.sol).padStart(2, '0')} · ${isNight(state.minutes) ? 'NIGHTTIME' : 'DAYTIME'}`;
  $('mobile-clock').textContent = `SOL ${String(state.sol).padStart(2, '0')} · ${$('clock').textContent} · ${isNight(state.minutes) ? 'NIGHTTIME' : 'DAYTIME'}`;
  $('day-icon').textContent = isNight(state.minutes) ? '☾' : '☀';
  $('work-wrap').hidden = !(work > 0 && phase);
  if (phase && work > 0) {
    $('work-label').textContent = ['DIGGING', 'AERATING', 'DRILLING', 'PLANTING', 'WATERING', 'HARVESTING'][state.phase];
    $('work-percent').textContent = `${Math.floor(work / phase.duration * 100)}%`;
    $('work-fill').style.width = `${Math.min(100, work / phase.duration * 100)}%`;
  }
  if (currentTarget !== null && phase) {
    const plot = state.plots[currentTarget];
    const label = plot.stage === 5 ? ['PLANTED', 'SPROUT', 'LEAFING', 'MATURE PLANT', 'READY TO HARVEST'][growthStage(plot.growth)] : `PLOT ${String(currentTarget + 1).padStart(2, '0')}`;
    $('target-label').textContent = `${label}  ·  ${canWork(state, plot, activeTool) ? 'WORK TO ' + phase.action.toUpperCase() : 'FOLLOW CURRENT OBJECTIVE'}`;
  } else $('target-label').textContent = '';
}

function nearestTarget() {
  const front = new THREE.Vector3(0, 0, -TOOL_OFFSET).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.rotation.y).add(rig.position);
  const distance = i => Math.hypot(plots[i].x - front.x, plots[i].z - front.z);
  if (pinnedTarget !== null && distance(pinnedTarget) < 2.15) return pinnedTarget;
  pinnedTarget = null;
  let best = null, bestDist = 2.15;
  plots.forEach((plot, i) => {
    const d = distance(i);
    if (d < bestDist && (state.phase === 5 ? state.plots[i].stage === 5 : state.plots[i].stage === state.phase)) { bestDist = d; best = i; }
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
  keys.clear(); dragging = false; touchCamera = null; touchWorkPointer = null; resetJoystick();
  $('touch-work').classList.remove('pressed');
  setScreenMove(null); setScreenWork(false); gamepadWorkReady = false;
}
function setControlsVisible(visible) {
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
$('touch-rest').addEventListener('click', requestRest);
$('controls-button').addEventListener('click', () => setControlsVisible($('screen-controls').hidden));
document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
  setScreenWork(false);
  setScreenMove(screenMove === button.dataset.move ? null : button.dataset.move);
}));
$('screen-work').addEventListener('click', () => { setScreenMove(null); setScreenWork(!screenWork); });
$('screen-rest').addEventListener('click', requestRest);
document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.camera;
  if (action === 'left') cameraAngle += 0.25;
  if (action === 'right') cameraAngle -= 0.25;
  if (action === 'up') cameraPitch = Math.min(1.25, cameraPitch + 0.15);
  if (action === 'down') cameraPitch = Math.max(0.3, cameraPitch - 0.15);
  if (action === 'in') cameraDistance = Math.max(7, cameraDistance - 1);
  if (action === 'out') cameraDistance = Math.min(20, cameraDistance + 1);
}));
$('start-button').addEventListener('click', () => { $('intro').hidden = true; started = true; message('Welcome to the farm module. Follow your first objective.'); renderer.domElement.focus(); });
$('info-button').addEventListener('click', () => { clearInputs(); $('info').hidden = false; $('close-info').focus(); });
$('close-info').addEventListener('click', () => { $('info').hidden = true; $('info-button').focus(); });
document.querySelectorAll('.tool').forEach(button => button.addEventListener('click', () => selectTool(button.dataset.tool)));
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
    if (nearestTarget() !== requested) message('Move closer to that plot to work on it.');
  }
}
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch' && !touchCamera && started) {
    touchCamera = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    renderer.domElement.setPointerCapture(event.pointerId);
  } else if (event.button === 2) {
    dragging = true; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId);
  } else if (event.button === 0 && event.pointerType !== 'touch') targetPlot(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (touchCamera && event.pointerId === touchCamera.id) {
    if (Math.hypot(event.clientX - touchCamera.startX, event.clientY - touchCamera.startY) > 8) touchCamera.moved = true;
    if (touchCamera.moved) {
      cameraAngle -= (event.clientX - touchCamera.x) * 0.006;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + (event.clientY - touchCamera.y) * 0.005, 0.3, 1.25);
    }
    touchCamera.x = event.clientX; touchCamera.y = event.clientY;
    return;
  }
  if (!dragging) return;
  cameraAngle -= (event.clientX - lastX) * 0.006;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + (event.clientY - lastY) * 0.005, 0.3, 1.25);
  lastX = event.clientX; lastY = event.clientY;
});
renderer.domElement.addEventListener('pointerup', event => {
  if (touchCamera && event.pointerId === touchCamera.id) {
    if (!touchCamera.moved) targetPlot(event.clientX, event.clientY);
    touchCamera = null;
  }
  if (event.pointerType !== 'touch') dragging = false;
});
renderer.domElement.addEventListener('pointercancel', event => {
  if (touchCamera && event.pointerId === touchCamera.id) touchCamera = null;
  if (event.pointerType !== 'touch') dragging = false;
});
window.addEventListener('wheel', event => {
  if (!started || !$('info').hidden || restCutscene) return;
  event.preventDefault();
  const scale = event.deltaMode === 1 ? 0.16 : event.deltaMode === 2 ? 2 : 0.01;
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * scale, 7, 20);
}, { passive: false });
window.addEventListener('keydown', event => {
  if (!started || !$('info').hidden || restCutscene) return;
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'Digit1') selectTool('shovel');
  if (event.code === 'Digit2') selectTool('aerator');
  if (event.code === 'Digit3') selectTool('auger');
  if (event.code === 'Equal' || event.code === 'NumpadAdd') cameraDistance = Math.max(7, cameraDistance - 1);
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') cameraDistance = Math.min(20, cameraDistance + 1);
  if (event.code === 'KeyR') requestRest();
});
function requestRest() {
  if (!started || !$('info').hidden || restCutscene) return;
  if (!isNight(state.minutes)) message('Rest is available at night, from 19:00 to 06:00.');
  else if (switching) message('Finish changing attachments before resting.');
  else {
    if (!restScene) restScene = createRestScene();
    rest(state); clearInputs();
    work = 0; workTarget = null; snap = null; attachmentPivot.rotation.x = 0;
    gait.height = 0; gait.velocity = 0; astronaut.position.y = 0;
    restCutscene = { time: 0 };
    $('rest-caption').textContent = 'Returning to the habitat';
    $('rest-fade').style.opacity = '0';
    $('rest-cutscene').hidden = false; $('app').classList.add('resting');
  }
}
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', clearInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInputs(); });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (restScene) { restScene.view.aspect = innerWidth / innerHeight; restScene.view.updateProjectionMatrix(); }
  renderer.setSize(innerWidth, innerHeight);
});

let previous = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000, 1); previous = now;
  if (document.hidden) return;
  const gamepad = readGamepad(navigator.getGamepads ? Array.from(navigator.getGamepads()).find(pad => pad && pad.mapping === 'standard') : null);
  const wasStarted = started;
  if (!gamepad.buttons[0]) gamepadWorkReady = true;
  if (newlyPressed(gamepad.buttons, previousGamepadButtons, 0) && !started) $('start-button').click();
  if (started && !restCutscene && wasStarted) {
    if (newlyPressed(gamepad.buttons, previousGamepadButtons, 9)) {
      if ($('info').hidden) $('info-button').click(); else $('close-info').click();
    }
    if ($('info').hidden) {
      if (newlyPressed(gamepad.buttons, previousGamepadButtons, 1)) requestRest();
      const tools = ['shovel', 'aerator', 'auger'];
      if (newlyPressed(gamepad.buttons, previousGamepadButtons, 4)) selectTool(tools[(tools.indexOf(activeTool) + 2) % 3]);
      if (newlyPressed(gamepad.buttons, previousGamepadButtons, 5)) selectTool(tools[(tools.indexOf(activeTool) + 1) % 3]);
    }
  }
  if (!started || !$('info').hidden || restCutscene || !wasStarted) gamepadWorkReady = false;
  previousGamepadButtons = gamepad.buttons;
  if (restCutscene) { updateRestCutscene(dt); return; }
  if (started && $('info').hidden) {
    elapsed += dt; advance(state, dt); updateSwitch(dt);
    const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + Number(screenMove === 'right') - Number(screenMove === 'left') + gamepad.right + joystick.right;
    const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + Number(screenMove === 'forward') - Number(screenMove === 'back') + gamepad.forward + joystick.forward;
    const working = keys.has('Space') || screenWork || touchWorkPointer !== null || (gamepadWorkReady && gamepad.buttons[0]);
    cameraAngle += (Number(keys.has('KeyQ')) - Number(keys.has('KeyE')) - gamepad.orbit) * dt * 1.5;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + (Number(keys.has('KeyI')) - Number(keys.has('KeyK')) + gamepad.tilt) * dt, 0.3, 1.25);
    cameraDistance = THREE.MathUtils.clamp(cameraDistance + (Number(gamepad.buttons[6]) - Number(gamepad.buttons[7])) * dt * 5, 7, 20);
    const moving = (right !== 0 || forward !== 0) && !switching && !working;
    let walking = Boolean(switching && (switching.time < 0.8 || switching.time > 2.7));
    if (moving) {
      camera.getWorldDirection(viewDirection);
      const direction = cameraRelativeMovement(right, forward, Math.atan2(-viewDirection.x, -viewDirection.z));
      const dx = direction.x, dz = direction.z;
      const oldX = rig.position.x, oldZ = rig.position.z;
      const speed = Math.min(1, Math.hypot(right, forward));
      rig.position.x += dx * dt * 2.3 * speed; rig.position.z += dz * dt * 2.3 * speed;
      const radius = Math.hypot(rig.position.x, rig.position.z);
      if (radius > MOVEMENT_RADIUS) { rig.position.x *= MOVEMENT_RADIUS / radius; rig.position.z *= MOVEMENT_RADIUS / radius; }
      rig.rotation.y = Math.atan2(-dx, -dz);
      machine.position.y = Math.abs(Math.sin(elapsed * 10)) * 0.035;
      const travel = Math.hypot(rig.position.x - oldX, rig.position.z - oldZ);
      walking = travel > 0.00001;
      animateTracks(travel);
    } else machine.position.y = 0;
    currentTarget = state.phase === 0 && workTarget !== null && working && !switching ? workTarget : nearestTarget();
    const phase = PHASES[state.phase], plot = state.plots[currentTarget];
    if (phase && currentTarget !== null && working && !switching && canWork(state, plot, activeTool)) {
      if (workTarget !== currentTarget) {
        work = 0; workTarget = currentTarget;
        if (state.phase === 0) {
          const start = { x: rig.position.x, z: rig.position.z, angle: rig.rotation.y };
          snap = { start, end: digAlignment(start, plots[currentTarget], TOOL_OFFSET, MOVEMENT_RADIUS) };
        }
      }
      work += dt;
      if (state.phase === 0 && snap) {
        const pose = alignmentPose(snap.start, snap.end, work / phase.duration);
        const oldX = rig.position.x, oldZ = rig.position.z, oldAngle = rig.rotation.y;
        rig.position.x = pose.x; rig.position.z = pose.z; rig.rotation.y = pose.angle;
        const dx = rig.position.x - oldX, dz = rig.position.z - oldZ;
        const travel = -dx * Math.sin(rig.rotation.y) - dz * Math.cos(rig.rotation.y);
        const turn = rig.rotation.y - oldAngle;
        walking = Math.hypot(dx, dz) > 0.00001 || Math.abs(turn) > 0.00001;
        animateTracks(travel, turn);
      }
      attachmentPivot.rotation.x = state.phase === 0 ? 0.08 * (1 + Math.sin(elapsed * 8)) : 0;
      if (activeTool === 'auger') mounted.auger.rotation.y += dt * 8;
      if (activeTool === 'aerator' && state.phase === 1) mounted.aerator.userData.roller.rotation.x += dt * 4;
      if (work >= phase.duration) {
        setScreenWork(false);
        completeWork(state, plot); work = 0; workTarget = null; snap = null; pinnedTarget = null; attachmentPivot.rotation.x = 0;
        if (state.phase >= 6) message('Mission complete! The first harvest is ready.');
        else message(state.phase !== PHASES.indexOf(phase) ? `Objective complete. Next: ${PHASES[state.phase].title}.` : `Plot ${currentTarget + 1} complete.`);
      }
    } else { work = 0; workTarget = null; snap = null; attachmentPivot.rotation.x = 0; }
    advanceGait(gait, walking, dt);
    astronaut.position.y = gait.height;
    const flightProgress = gait.height > 0 ? (STEP_LAUNCH_SPEED - gait.velocity) / (2 * STEP_LAUNCH_SPEED) : 0;
    for (let i = 0; i < legs.length; i++) {
      const stride = Math.sin(flightProgress * Math.PI) * ((gait.steps + i) % 2 ? -1 : 1);
      legs[i].hip.rotation.x = stride * 0.35;
      legs[i].knee.rotation.x = Math.max(0, -stride) * 0.45;
    }
    const reaching = switching && switching.time >= 0.8 && switching.time < 2.7;
    for (const arm of arms) arm.rotation.x = reaching ? 0.5 + Math.sin(elapsed * 6) * 0.12 : 0;
    const night = isNight(state.minutes);
    const lighting = night ? 0.55 : 1;
    hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, 2.1 * lighting, dt);
    sun.intensity = THREE.MathUtils.lerp(sun.intensity, 2.5 * lighting, dt);
    const bg = new THREE.Color(night ? 0x59645f : 0xc8916e);
    scene.background.lerp(bg, dt * 0.4); scene.fog.color.copy(scene.background);
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
    updatePlots(); updateUI();
  }
  targetPoint.set(rig.position.x, 0.7, rig.position.z - 1.2);
  cameraPoint.set(targetPoint.x + Math.sin(cameraAngle) * Math.cos(cameraPitch) * cameraDistance, targetPoint.y + Math.sin(cameraPitch) * cameraDistance, targetPoint.z + Math.cos(cameraAngle) * Math.cos(cameraPitch) * cameraDistance);
  camera.position.lerp(cameraPoint, 0.08); camera.lookAt(targetPoint);
  renderer.render(scene, camera);
}
updatePlots(); updateUI(); requestAnimationFrame(frame);
