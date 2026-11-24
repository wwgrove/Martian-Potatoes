import { InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from '../vendor/three.module.js';

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

export function createDottedGuide(scene) {
  const spacing = 0.4, capacity = 64;
  const dots = new InstancedMesh(new SphereGeometry(0.075, 8, 6), new MeshBasicMaterial({ color: 0x7dd5ff }), capacity);
  const transform = new Object3D();
  dots.visible = false;
  dots.frustumCulled = false;
  scene.add(dots);
  return {
    dots,
    update(start, end, time, visible) {
      const dx = end.x - start.x, dz = end.z - start.z;
      const distance = Math.hypot(dx, dz);
      dots.visible = visible && distance > 0;
      if (!dots.visible) return;
      const offset = (time * 0.6) % spacing;
      dots.count = Math.min(capacity, Math.max(0, Math.ceil((distance - offset) / spacing)));
      for (let i = 0; i < dots.count; i++) {
        const t = (i * spacing + offset) / distance;
        transform.position.set(start.x + dx * t, 1.15 + 0.2 * Math.sin(Math.PI * t), start.z + dz * t);
        transform.updateMatrix();
        dots.setMatrixAt(i, transform.matrix);
      }
      dots.instanceMatrix.needsUpdate = true;
    }
  };
}
