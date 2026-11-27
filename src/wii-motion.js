const RAD = Math.PI / 180;

export function readMotionSample(data) {
  if (!data || data.length < 6 || !(data[5] & 0x02)) return null;
  return {
    values: [data[0] | ((data[3] & 0xfc) << 6), data[1] | ((data[4] & 0xfc) << 6), data[2] | ((data[5] & 0xfc) << 6)],
    slow: [Boolean(data[3] & 0x02), Boolean(data[4] & 0x02), Boolean(data[3] & 0x01)]
  };
}

export function parseMotionCalibration(data) {
  if (data.length !== 32) throw new Error('MotionPlus calibration data is incomplete.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return [0, 16].map(offset => {
    const degrees = data[offset + 12] * 6;
    const axes = [0, 1, 2].map(axis => {
      const zero = view.getUint16(offset + axis * 2);
      const scale = view.getUint16(offset + 6 + axis * 2);
      if (!degrees || Math.abs(scale - zero) < 1000 || zero < 20000 || zero > 40000) {
        throw new Error('MotionPlus calibration data is invalid.');
      }
      return { zero, span: scale - zero, degrees };
    });
    return axes;
  });
}

export function createWiiMotion(calibration) {
  let held = false, previousTime = null, orbit = 0, tilt = 0, released = false;
  let calibrated = false;
  const factoryZeros = calibration.map(axes => axes.map(axis => axis.zero));
  function rate(raw, slow, axis) {
    const { zero, span, degrees } = calibration[slow ? 1 : 0][axis];
    const value = (raw * 4 - zero) * degrees / span;
    return Math.abs(value) < 3 ? 0 : value * RAD;
  }
  return {
    update(data, now, pressed) {
      if (held && !pressed) released = true;
      if (!pressed || !held) previousTime = null;
      held = pressed;
      const sample = readMotionSample(data);
      if (!pressed || !calibrated || !sample) return;
      if (previousTime !== null) {
        const dt = Math.max(0, Math.min(0.05, (now - previousTime) / 1000));
        orbit -= rate(sample.values[0], sample.slow[0], 0) * dt;
        tilt += rate(sample.values[1], sample.slow[1], 1) * dt;
      }
      previousTime = now;
    },
    consume() {
      const result = { orbit, tilt, released };
      orbit = 0; tilt = 0; released = false;
      return result;
    },
    calibrate(zeros) {
      for (let axis = 0; axis < 3; axis++) {
        const offset = zeros[axis] * 4 - factoryZeros[1][axis];
        for (let mode = 0; mode < 2; mode++) calibration[mode][axis].zero = factoryZeros[mode][axis] + offset;
      }
      calibrated = true;
      previousTime = null;
      orbit = 0; tilt = 0;
    },
    clear() {
      const wasHeld = held;
      held = false; previousTime = null; orbit = 0; tilt = 0; released = false;
      return wasHeld;
    }
  };
}

export function createSidewaysDpad() {
  const directions = [
    { mask: 0x02, index: 12 },
    { mask: 0x01, index: 13 },
    { mask: 0x08, index: 14 },
    { mask: 0x04, index: 15 }
  ];
  let previous = 0, active = null;
  return {
    update(mask) {
      const newlyPressed = mask & ~previous;
      const next = directions.find(direction => newlyPressed & direction.mask);
      if (next) active = next;
      else if (!active || !(mask & active.mask)) active = directions.find(direction => mask & direction.mask) || null;
      previous = mask;
      return active ? active.index : null;
    },
    clear() { previous = 0; active = null; }
  };
}
