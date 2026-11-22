import { Vector3 } from '../vendor/three.module.js';

export function detachUpright(scene, object) {
  const direction = object.getWorldDirection(new Vector3());
  scene.attach(object);
  object.rotation.set(0, Math.atan2(direction.x, direction.z), 0);
}
