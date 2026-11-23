import { Vector3 } from '../vendor/three.module.js';

export function detachUpright(scene, object) {
  const direction = object.getWorldDirection(new Vector3());
  scene.attach(object);
  object.rotation.set(0, Math.atan2(direction.x, direction.z), 0);
}

export function cameraTilt(pitch, distance) {
  const orbitPitch = Math.max(0.3, pitch);
  const aimOffset = pitch < 0.3 ? distance * (Math.sin(orbitPitch) - Math.cos(orbitPitch) * Math.tan(pitch)) : 0;
  return { orbitPitch, aimOffset };
}
