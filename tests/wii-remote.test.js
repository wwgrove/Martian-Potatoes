import test from 'node:test';
import assert from 'node:assert/strict';
import { createWiiRemote } from '../src/wii-remote.js';
import { createWiiSpeaker, amplifyWiiSample, createWiiTestScale, WII_SPEAKER_RATE } from '../src/wii-speaker.js';
import { readGamepad } from '../src/controls.js';
import { createSidewaysDpad } from '../src/wii-motion.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function harness(failReport = null, speakerError = 0, speakerEnabled = true) {
  const reports = [], statuses = [], errors = [];
  let speakerEnableRequests = 0;
  class Device extends EventTarget {
    opened = false;
    async open() { this.opened = true; }
    async close() { this.opened = false; }
    async sendReport(id, data) {
      if (id === failReport) throw new Error('write failed');
      reports.push([id, [...data]]);
      if (id === 0x14 && (data[0] & 0x02)) speakerEnableRequests++;
      const skipAck = id === 0x14 && (speakerError === -1 || (speakerError === -2 && speakerEnableRequests === 1));
      if ((data[0] & 0x02) && !skipAck) {
        const event = new Event('inputreport');
        event.reportId = 0x22;
        const error = id === 0x16 && data[1] === 0xa2 ? Math.max(0, speakerError) : 0;
        event.data = new DataView(Uint8Array.from([0, 0, id, error]).buffer);
        this.dispatchEvent(event);
      }
      if (id === 0x15) {
        const event = new Event('inputreport');
        event.reportId = 0x20;
        event.data = new DataView(Uint8Array.from([0, 0, speakerEnabled ? 4 : 0, 0, 0, 0]).buffer);
        this.dispatchEvent(event);
      }
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
  assert.equal(remote.hasSpeaker, true);
  assert.match(statuses.at(-1), /Speaker setup acknowledged/);
  const config = reports.find(([id, data]) => id === 0x16 && data[1] === 0xa2 && data[3] === 1 && data[4] === 7);
  assert.ok(config);
  assert.equal(12000000 / (config[1][7] | config[1][8] << 8), WII_SPEAKER_RATE);
  assert.deepEqual(config[1].slice(5, 12), [0, 0, 0xd0, 0x07, 0x40, 0, 0]);
  assert.ok(reports.some(([id, data]) => id === 0x16 && data[1] === 0xa2 && data[3] === 7 && data[4] === 1 && data[5] === 2));
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
});

test('speaker setup failure does not prevent controller input and is reported', async () => {
  const { remote, device, statuses, errors } = harness(0x14);
  await remote.connect();
  assert.equal(remote.connected, true);
  assert.equal(remote.hasSpeaker, false);
  assert.match(statuses.at(-1), /speaker unavailable/);
  assert.match(errors[0].message, /speaker unavailable/);
  device.input(0, 0x01);
  assert.equal(readGamepad(remote.gamepad()).buttons[0], true);
  await assert.rejects(remote.disconnect(), /write failed/);
  assert.equal(remote.connected, false);
});

test('speaker setup checks acknowledged writes and the remote speaker status', async () => {
  for (const [errorCode, enabled, expected] of [[2, true, /rejected speaker command.*error 2/], [0, false, /speaker is disabled/], [-1, true, /speaker command 0x14 timed out/]]) {
    const { remote, statuses, errors } = harness(null, errorCode, enabled);
    await remote.connect();
    assert.equal(remote.connected, true);
    assert.equal(remote.hasSpeaker, false);
    assert.match(statuses.at(-1), expected);
    assert.ok(errors.some(error => expected.test(error.message)));
    await remote.disconnect();
  }
});

test('speaker setup retries a timed-out enable command', async () => {
  const { remote, reports, statuses } = harness(null, -2);
  await remote.connect();
  assert.equal(remote.hasSpeaker, true);
  assert.equal(reports.filter(([id, data]) => id === 0x14 && (data[0] & 0x02)).length, 2);
  assert.match(statuses.at(-1), /Speaker setup acknowledged/);
  await remote.disconnect();
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

test('speaker encodes active effects as ADPCM and stops sending after cancellation', async () => {
  const reports = [], errors = [];
  const speaker = createWiiSpeaker(async (id, data) => reports.push([id, [...data]]), error => errors.push(error));
  const buffer = { sampleRate: 6000, numberOfChannels: 1, getChannelData: () => new Float32Array(6000).fill(0.5) };
  const token = {};
  speaker.enable();
  speaker.start(token, 'test', buffer, { start: 0, end: 1 }, 1, true);
  await wait(30);
  assert.ok(reports.length >= 1);
  assert.equal(reports[0][0], 0x18);
  assert.equal(reports[0][1][0], 0xa0);
  assert.equal(reports[0][1][1], 0x77);
  speaker.setVolume('test', 0);
  await wait(20);
  assert.notDeepEqual(reports.at(-1)[1].slice(1), reports[0][1].slice(1));
  speaker.stopTrack(token);
  const count = reports.length;
  await wait(25);
  assert.equal(reports.length, count);
  assert.deepEqual(errors, []);
  speaker.stop();
});

test('Wii speaker boosts quiet audio while limiting peaks and respecting mute', () => {
  assert.equal(amplifyWiiSample(0), 0);
  assert.ok(amplifyWiiSample(0.1) > 0.37);
  assert.ok(amplifyWiiSample(-0.1) < -0.37);
  assert.equal(amplifyWiiSample(2), 1);
});

test('diagnostic tone streams without a browser audio context and stops on request', async () => {
  const reports = [], errors = [], token = {};
  const speaker = createWiiSpeaker(async (id, data) => reports.push([id, [...data]]), error => errors.push(error));
  speaker.enable();
  speaker.testTone(token);
  await wait(35);
  assert.ok(reports.length > 0);
  assert.equal(reports[0][0], 0x18);
  assert.ok(reports[0][1].slice(1).some(byte => byte !== 0));
  speaker.stopTrack(token);
  const count = reports.length;
  await wait(25);
  assert.equal(reports.length, count);
  assert.deepEqual(errors, []);
  speaker.stop();
});

test('diagnostic tone is a four-second ascending F-sharp major scale', () => {
  const samples = createWiiTestScale(), rate = 6000, perNote = rate / 2;
  assert.equal(samples.length, rate * 4);
  const offsets = [0, 2, 4, 5, 7, 9, 11, 12];
  for (let note = 0; note < offsets.length; note++) {
    const start = note * perNote + 600, end = start + 1800;
    let crossings = 0;
    for (let i = start + 1; i < end; i++) if (samples[i - 1] <= 0 && samples[i] > 0) crossings++;
    const frequency = crossings * rate / (end - start);
    const expected = 440 * 2 ** ((9 + offsets[note]) / 12);
    assert.ok(Math.abs(frequency - expected) < 4, `note ${note}: ${frequency} Hz, expected ${expected} Hz`);
  }
});
