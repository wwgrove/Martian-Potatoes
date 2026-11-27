import { createWiiSpeaker, WII_SPEAKER_RATE } from './wii-speaker.js';
import { createSidewaysDpad, createWiiMotion, parseMotionCalibration, readMotionSample } from './wii-motion.js';

const VENDOR = 0x057e, PRODUCT = 0x0330;
const LEDS = { tiller: 0x10, plow: 0x20, auger: 0x40, sifter: 0x80 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class WiiReportTimeout extends Error {}

export function createWiiRemote(hid, onStatus, onError) {
  let device = null, buttons = Array(16).fill(false), motion = null, cancelCalibration = null;
  const dpad = createSidewaysDpad();
  let rumble = false, led = LEDS.tiller, rumbleTimer = null, pulseGeneration = 0;
  let connection = 0, speakerReady = false, speakerPowered = false, hapticsEnabled = true;

  function report(error) { onError(error); }
  async function send(id, bytes) {
    if (!device?.opened) throw new Error('Wii Remote is disconnected.');
    const data = Uint8Array.from(bytes);
    data[0] = (data[0] & 0xfe) | Number(rumble);
    await device.sendReport(id, data);
  }
  function sendFeedback() {
    send(0x11, [led]).catch(report);
  }
  function cancelRumble() {
    pulseGeneration++;
    if (rumbleTimer !== null) clearTimeout(rumbleTimer);
    rumbleTimer = null;
    if (rumble) { rumble = false; if (device?.opened) sendFeedback(); }
  }
  function pulse(pattern) {
    cancelRumble();
    if (!hapticsEnabled || !device?.opened) return;
    const current = pulseGeneration;
    let index = 0;
    function step() {
      if (current !== pulseGeneration || !device?.opened) return;
      if (index >= pattern.length) { rumble = false; sendFeedback(); rumbleTimer = null; return; }
      rumble = index % 2 === 0;
      sendFeedback();
      rumbleTimer = setTimeout(step, pattern[index++]);
    }
    step();
  }
  const actuator = {
    playEffect(type, options) {
      if (type !== 'dual-rumble') return Promise.resolve('not-supported');
      pulse([options.duration]);
      return Promise.resolve('complete');
    },
    reset() { cancelRumble(); return Promise.resolve('complete'); }
  };
  const speaker = createWiiSpeaker(send, error => {
    speakerReady = false;
    report(new Error(`Wii Remote speaker failed: ${error.message}`));
  });
  function waitForReport(reportId, match, sendRequest, description) {
    const target = device;
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => finish(new WiiReportTimeout(`${description} timed out.`)), 1500);
      function finish(error, result) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        target.removeEventListener('inputreport', receive);
        if (error) reject(error); else resolve(result);
      }
      function receive(event) {
        if (event.reportId !== reportId) return;
        const result = match(event.data);
        if (result !== null) finish(result instanceof Error ? result : null, result);
      }
      target.addEventListener('inputreport', receive);
      sendRequest().catch(finish);
    });
  }
  function sendConfirmed(id, bytes) {
    const data = Uint8Array.from(bytes);
    data[0] |= 0x02;
    return waitForReport(0x22, report => {
      if (report.byteLength < 4 || report.getUint8(2) !== id) return null;
      const error = report.getUint8(3);
      return error ? new Error(`Wii Remote rejected speaker command 0x${id.toString(16)} (error ${error}).`) : true;
    }, () => send(id, data), `Wii Remote speaker command 0x${id.toString(16)}`);
  }
  async function writeRegister(address, data, bank = 0xa2, confirm = false) {
    const bytes = new Uint8Array(21);
    bytes.set([0x04, bank, 0x00, address, data.length, ...data]);
    if (confirm) await sendConfirmed(0x16, bytes);
    else await send(0x16, bytes);
    await delay(35);
  }
  function readCalibration() {
    const target = device;
    return new Promise((resolve, reject) => {
      const bytes = new Uint8Array(32), received = new Set();
      const timer = setTimeout(() => finish(new Error('MotionPlus calibration read timed out.')), 2000);
      function finish(error) {
        clearTimeout(timer);
        target.removeEventListener('inputreport', read);
        if (error) reject(error); else resolve(bytes);
      }
      function read(event) {
        if (event.reportId !== 0x21 || event.data.byteLength < 5) return;
        const info = event.data.getUint8(2);
        const offset = event.data.getUint16(3) - 0x20;
        if (offset < 0 || offset >= bytes.length) return;
        if (info & 0x0f) { finish(new Error(`MotionPlus calibration read failed (${info & 0x0f}).`)); return; }
        const count = (info >> 4) + 1;
        if (event.data.byteLength < 5 + count || offset + count > bytes.length) {
          finish(new Error('MotionPlus calibration response is incomplete.')); return;
        }
        for (let i = 0; i < count; i++) { bytes[offset + i] = event.data.getUint8(5 + i); received.add(offset + i); }
        if (received.size === bytes.length) finish();
      }
      target.addEventListener('inputreport', read);
      send(0x17, [0x04, 0xa6, 0, 0x20, 0, 32]).catch(finish);
    });
  }
  async function initMotion() {
    await writeRegister(0xf0, [0x55], 0xa4);
    await writeRegister(0xf0, [0x55], 0xa6);
    const calibration = parseMotionCalibration(await readCalibration());
    await writeRegister(0xfe, [0x04], 0xa6);
    await delay(150);
    motion = createWiiMotion(calibration);
    await send(0x12, [0x04, 0x32]);
  }
  async function initSpeaker() {
    speakerPowered = true;
    try {
      await sendConfirmed(0x14, [0x04]);
    } catch (error) {
      if (!(error instanceof WiiReportTimeout)) throw error;
      await delay(1000);
      await sendConfirmed(0x14, [0x04]);
    }
    await delay(150);
    await sendConfirmed(0x19, [0x04]);
    await delay(35);
    await writeRegister(0x09, [0x01], 0xa2, true);
    await writeRegister(0x01, [0x08], 0xa2, true);
    const divisor = 12000000 / WII_SPEAKER_RATE;
    await writeRegister(0x01, [0x00, 0x00, divisor & 0xff, divisor >> 8, 0x40, 0x00, 0x00], 0xa2, true);
    // Reset the remote's ADPCM decoder to match the encoder's initial state.
    await writeRegister(0x07, [0x02], 0xa2, true);
    await writeRegister(0x08, [0x01], 0xa2, true);
    await sendConfirmed(0x19, [0]);
    const status = await waitForReport(0x20, data => data.byteLength >= 3 ? data.getUint8(2) : null,
      () => send(0x15, [0]), 'Wii Remote speaker status');
    if (!(status & 0x04)) throw new Error('Wii Remote reports that its speaker is disabled.');
    speakerReady = true;
    speaker.enable();
  }
  function input(event) {
    if (![0x20, 0x21, 0x22, 0x30, 0x32].includes(event.reportId)) return;
    if (event.data.byteLength < 2) return;
    const a = event.data.getUint8(0), b = event.data.getUint8(1);
    buttons = Array(16).fill(false);
    buttons[0] = Boolean(b & 0x01);
    buttons[1] = Boolean(b & 0x02);
    buttons[5] = Boolean(b & 0x08);
    buttons[6] = Boolean(b & 0x10);
    buttons[7] = Boolean(a & 0x10);
    buttons[9] = Boolean(b & 0x80);
    buttons[10] = Boolean(b & 0x04);
    const direction = dpad.update(a & 0x0f);
    if (direction !== null) buttons[direction] = true;
    const data = event.reportId === 0x32 && event.data.byteLength >= 8
      ? new Uint8Array(event.data.buffer, event.data.byteOffset + 2, 6) : null;
    if (motion) motion.update(data, performance.now(), buttons[10]);
  }
  function clearDevice() {
    connection++;
    if (cancelCalibration) cancelCalibration(new Error('Wii Remote disconnected during calibration.'));
    cancelRumble();
    speaker.stop();
    speakerReady = false; speakerPowered = false;
    if (device) device.removeEventListener('inputreport', input);
    device = null;
    buttons.fill(false); dpad.clear(); motion = null;
  }
  if (hid) hid.addEventListener('disconnect', event => {
    if (event.device !== device) return;
    clearDevice();
    onStatus('Wii Remote disconnected.');
  });

  return {
    async connect() {
      if (!hid) throw new Error('WebHID is unavailable. Use a supported Chromium browser over HTTPS or localhost.');
      if (device) return;
      const authorized = (await hid.getDevices()).filter(item => item.vendorId === VENDOR && item.productId === PRODUCT);
      const selected = authorized.length === 1 ? authorized : await hid.requestDevice({ filters: [{ vendorId: VENDOR, productId: PRODUCT }] });
      if (!selected.length) { onStatus('No Wii Remote selected.'); return; }
      device = selected[0];
      const current = ++connection;
      try {
        await device.open();
        device.addEventListener('inputreport', input);
        await send(0x12, [0, 0x30]);
        await send(0x11, [led]);
        let motionError = null;
        try { await initMotion(); }
        catch (error) {
          if (current !== connection || !device?.opened) throw error;
          motion = null;
          motionError = error;
          report(new Error(`MotionPlus unavailable: ${error.message}`));
          await send(0x12, [0, 0x30]);
        }
        let speakerError = null;
        try { await initSpeaker(); }
        catch (error) {
          if (current !== connection || !device?.opened) throw error;
          speakerError = error;
          report(new Error(`Wii Remote speaker unavailable: ${error.message}`));
          if (speakerPowered) {
            try { await send(0x19, [0x04]); await send(0x14, [0]); speakerPowered = false; }
            catch (cleanupError) { report(new Error(`Could not turn off Wii Remote speaker: ${cleanupError.message}`)); }
          }
        }
        if (current !== connection) return;
        pulse([75, 80, 75]);
        const problems = [];
        if (motionError) problems.push(`MotionPlus unavailable: ${motionError.message}`);
        else problems.push('Calibrate MotionPlus before using B to move the camera.');
        if (speakerError) problems.push(`speaker unavailable: ${speakerError.message}`);
        else problems.push('Speaker setup acknowledged; test playback to confirm sound.');
        onStatus(`Wii Remote connected. ${problems.join(' ')}`);
      } catch (error) {
        const failed = device;
        clearDevice();
        if (failed?.opened) await failed.close();
        throw error;
      }
    },
    async disconnect() {
      if (!device) return;
      const closing = device;
      cancelRumble();
      speaker.stop();
      try {
        if (closing.opened && speakerPowered) {
          await send(0x19, [0x04]);
          await send(0x14, [0]);
        }
      } finally {
        clearDevice();
        if (closing.opened) await closing.close();
        onStatus('Wii Remote disconnected.');
      }
    },
    get connected() { return Boolean(device?.opened); },
    get hasSpeaker() { return speakerReady; },
    get hasMotion() { return Boolean(motion); },
    stopCalibration() {
      if (!cancelCalibration) return;
      cancelCalibration(new DOMException('Calibration stopped.', 'AbortError'));
      onStatus('MotionPlus calibration stopped.');
    },
    calibrate() {
      if (!device?.opened || !motion) return Promise.reject(new Error('Connect a Wii Remote with MotionPlus first.'));
      if (cancelCalibration) return Promise.reject(new Error('MotionPlus calibration is already running.'));
      const target = device, currentMotion = motion;
      onStatus('Hold the Wii Remote still sideways while MotionPlus calibrates.');
      return new Promise((resolve, reject) => {
        let start = 0, samples = 0, sum = [0, 0, 0], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        const timer = setTimeout(() => finish(new Error('Calibration timed out. Hold the remote still and try again.')), 8000);
        function finish(error) {
          clearTimeout(timer);
          target.removeEventListener('inputreport', collect);
          cancelCalibration = null;
          if (error) reject(error);
          else {
            currentMotion.calibrate(sum.map(value => value / samples));
            onStatus('MotionPlus calibrated. Hold B and rotate the remote to move the camera.');
            resolve();
          }
        }
        function collect(event) {
          if (event.reportId !== 0x32 || event.data.byteLength < 8) return;
          const sample = readMotionSample(new Uint8Array(event.data.buffer, event.data.byteOffset + 2, 6));
          if (!sample || !sample.slow.every(Boolean)) { start = 0; samples = 0; sum = [0, 0, 0]; min = [Infinity, Infinity, Infinity]; max = [-Infinity, -Infinity, -Infinity]; return; }
          const now = performance.now();
          if (!samples) start = now;
          samples++;
          for (let i = 0; i < 3; i++) {
            sum[i] += sample.values[i];
            min[i] = Math.min(min[i], sample.values[i]);
            max[i] = Math.max(max[i], sample.values[i]);
          }
          if (max.some((value, i) => value - min[i] > 60)) {
            start = 0; samples = 0; sum = [0, 0, 0]; min = [Infinity, Infinity, Infinity]; max = [-Infinity, -Infinity, -Infinity];
          } else if (samples >= 30 && now - start >= 1000) finish();
        }
        cancelCalibration = finish;
        target.addEventListener('inputreport', collect);
      });
    },
    consumeMotion() { return motion ? motion.consume() : { orbit: 0, tilt: 0, released: false }; },
    clearMotion() { return motion ? motion.clear() : false; },
    gamepad() {
      if (!device?.opened) return null;
      return {
        index: 1000, id: 'Wii Remote', mapping: 'standard',
        buttons: buttons.map(pressed => ({ pressed })),
        axes: [0, 0, 0, 0],
        vibrationActuator: actuator
      };
    },
    setTool(tool) {
      if (!Object.prototype.hasOwnProperty.call(LEDS, tool)) throw new RangeError(`Unknown Wii Remote tool: ${tool}`);
      if (led !== LEDS[tool]) { led = LEDS[tool]; if (device?.opened) sendFeedback(); }
    },
    setHapticsEnabled(value) { hapticsEnabled = value; if (!value) cancelRumble(); },
    stopRumble: cancelRumble,
    sound: speaker
  };
}
