import test from 'node:test';
import assert from 'node:assert/strict';
import { createWiiRemote } from '../src/wii-remote.js';
import { readGamepad } from '../src/controls.js';
import { createSidewaysDpad } from '../src/wii-motion.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function harness(failReport = null) {
  const reports = [], statuses = [], errors = [];
  class Device extends EventTarget {
    opened = false;
    async open() { this.opened = true; }
    async close() { this.opened = false; }
    async sendReport(id, data) {
      if (id === failReport) throw new Error('write failed');
      reports.push([id, [...data]]);
      if (id === 0x17) {
        const calibration = new Uint8Array(32);
        const view = new DataView(calibration.buffer);
        for (const offset of [0, 16]) {
          for (let axis = 0; axis < 3; axis++) {
            view.setUint16(offset + axis * 2, 32000);
            view.setUint16(offset + 6 + axis * 2, axis === 1 ? 16000 : 48000);
          }
          calibration[offset + 12] = 45;
        }
        for (const offset of [0, 16]) {
          const event = new Event('inputreport');
          event.reportId = 0x21;
          event.data = new DataView(Uint8Array.from([0, 0, 0xf0, 0, 0x20 + offset, ...calibration.slice(offset, offset + 16)]).buffer);
          this.dispatchEvent(event);
        }
      }
    }
    input(first, second, gyro = null) {
      const event = new Event('inputreport');
      event.reportId = gyro ? 0x32 : 0x30;
      event.data = new DataView(Uint8Array.from([first, second, ...(gyro || [])]).buffer);
      this.dispatchEvent(event);
    }
  }
  const device = new Device();
  class HID extends EventTarget {
    async getDevices() { return []; }
    async requestDevice(options) {
      assert.deepEqual(options.filters, [{ vendorId: 0x057e, productId: 0x0330 }]);
      return [device];
    }
  }
  const remote = createWiiRemote(new HID(), status => statuses.push(status), error => errors.push(error));
  return { remote, device, reports, statuses, errors };
}

test('Wii Remote connects with two pulses, tracks tools and maps core buttons', async () => {
  const { remote, device, reports, statuses } = harness();
  await remote.connect();
  assert.match(statuses.at(-1), /Calibrate MotionPlus/);
  assert.equal(remote.hasMotion, true);
  await wait(280);
  assert.deepEqual(reports.filter(([id]) => id === 0x11).slice(-4).map(([, data]) => data[0]),
    [0x11, 0x10, 0x11, 0x10]);
  remote.setTool('auger');
  await wait(0);
  assert.equal(reports.filter(([id]) => id === 0x11).at(-1)[1][0], 0x40);
  device.input(0x12, 0x9f);
  const gamepad = readGamepad(remote.gamepad());
  assert.equal(gamepad.forward, 1);
  assert.equal(gamepad.right, 0);
  assert.equal(gamepad.buttons[0], true);
  assert.equal(gamepad.buttons[1], true);
  assert.equal(gamepad.buttons[5], true);
  assert.equal(gamepad.buttons[6], true);
  assert.equal(gamepad.buttons[7], true);
  assert.equal(gamepad.buttons[9], true);
  device.input(0x04, 0x00);
  const changed = readGamepad(remote.gamepad());
  assert.equal(changed.right, 1);
  await remote.gamepad().vibrationActuator.playEffect('dual-rumble', { duration: 500 });
  remote.setTool('sifter');
  await wait(0);
  assert.equal(reports.filter(([id]) => id === 0x11).at(-1)[1][0], 0x81);
  remote.setHapticsEnabled(false);
  await wait(0);
  assert.equal(reports.filter(([id]) => id === 0x11).at(-1)[1][0], 0x80);
  await remote.disconnect();
  assert.equal(remote.gamepad(), null);
  assert.ok(reports.every(([id, data]) =>
    ![0x14, 0x18, 0x19].includes(id) && !(id === 0x16 && data[1] === 0xa2)));
});

test('motion setup failure does not prevent controller input and is reported', async () => {
  const { remote, device, statuses, errors } = harness(0x17);
  await remote.connect();
  assert.equal(remote.connected, true);
  assert.equal(remote.hasMotion, false);
  assert.match(statuses.at(-1), /MotionPlus unavailable/);
  assert.match(errors[0].message, /MotionPlus unavailable/);
  device.input(0, 0x01);
  assert.equal(readGamepad(remote.gamepad()).buttons[0], true);
  await remote.disconnect();
  assert.equal(remote.connected, false);
});

test('sideways D-pad snaps to one direction, preferring the newest press', () => {
  const dpad = createSidewaysDpad();
  assert.equal(dpad.update(0x02), 12);
  assert.equal(dpad.update(0x06), 15);
  assert.equal(dpad.update(0x02), 12);
  assert.equal(dpad.update(0x08), 14);
  assert.equal(dpad.update(0x01), 13);
  assert.equal(dpad.update(0), null);
});

test('calibration requires still samples and B motion returns to default on release', async () => {
  const { remote, device } = harness();
  await remote.connect();
  const sample = (yaw, roll, pitch) => [
    yaw & 255, roll & 255, pitch & 255,
    ((yaw >> 8) << 2) | 3, ((roll >> 8) << 2) | 2, ((pitch >> 8) << 2) | 2
  ];
  const calibration = remote.calibrate();
  const interval = setInterval(() => device.input(0, 0, sample(8200, 8300, 8100)), 12);
  try { await calibration; } finally { clearInterval(interval); }
  device.input(0, 4, sample(8300, 8400, 8100));
  await wait(20);
  device.input(0, 4, sample(8300, 8400, 8100));
  const moved = remote.consumeMotion();
  assert.notEqual(moved.orbit, 0);
  assert.notEqual(moved.tilt, 0);
  device.input(0, 0, sample(8200, 8300, 8100));
  assert.equal(remote.consumeMotion().released, true);
  await remote.disconnect();
});

test('stopping calibration rejects the pending check and allows a new attempt', async () => {
  const { remote, statuses } = harness();
  await remote.connect();
  const pending = remote.calibrate();
  remote.stopCalibration();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.match(statuses.at(-1), /calibration stopped/);
  const next = remote.calibrate();
  remote.stopCalibration();
  await assert.rejects(next, { name: 'AbortError' });
  await remote.disconnect();
});
