export const WII_SPEAKER_RATE = 6000;
const RATE = WII_SPEAKER_RATE;
const SAMPLES_PER_REPORT = 40;
const PERIOD = SAMPLES_PER_REPORT * 1000 / RATE;
const MAX_PENDING = 6;
const STEP_SCALE = [230, 230, 230, 230, 307, 409, 512, 614];

export function amplifyWiiSample(value) {
  return Math.tanh(Math.max(-1, Math.min(1, value)) * 4) / Math.tanh(4);
}

export function createWiiTestScale() {
  const notes = [0, 2, 4, 5, 7, 9, 11, 12], samplesPerNote = RATE / 2;
  const data = new Float32Array(samplesPerNote * notes.length);
  for (let note = 0; note < notes.length; note++) {
    const frequency = 440 * 2 ** ((9 + notes[note]) / 12);
    for (let i = 0; i < samplesPerNote; i++) {
      const envelope = Math.min(1, i / (RATE * 0.01), (samplesPerNote - 1 - i) / (RATE * 0.01));
      data[note * samplesPerNote + i] = 0.8 * envelope * Math.sin(2 * Math.PI * frequency * i / RATE);
    }
  }
  return data;
}

export function createWiiSpeaker(send, reportError, clock = () => performance.now()) {
  const tracks = new Map();
  let timer = null, nextReport = 0, pending = 0, enabled = false, generation = 0;
  let predictor = 0, step = 127;

  function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    nextReport = 0;
  }

  function schedule() {
    if (!enabled || !tracks.size || timer !== null) return;
    if (!nextReport) nextReport = clock();
    timer = setTimeout(tick, Math.max(0, nextReport - clock()));
  }

  function sample(track, time) {
    const { buffer, start, end, loop, started } = track;
    let position = start + (time - started) / 1000;
    if (position < start) return 0;
    if (loop) position = start + (position - start) % (end - start);
    else if (position >= end) return 0;
    const first = Math.floor(position * buffer.sampleRate);
    const count = Math.max(1, Math.floor(buffer.sampleRate / RATE));
    let value = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < count; i++) value += data[Math.min(first + i, data.length - 1)] || 0;
    }
    return value * track.volume / (count * buffer.numberOfChannels);
  }

  function tick() {
    timer = null;
    if (!enabled || !tracks.size) return;
    const now = clock();
    if (now - nextReport > PERIOD * 2) nextReport = now;
    if (pending < MAX_PENDING) {
      const data = new Uint8Array(21);
      data[0] = 20 << 3;
      for (let i = 0; i < SAMPLES_PER_REPORT; i++) {
        let value = 0;
        const time = nextReport + i * 1000 / RATE;
        for (const track of tracks.values()) value += sample(track, time);
        const target = Math.round(amplifyWiiSample(value) * 32767);
        const difference = target - predictor;
        const magnitude = Math.min(7, Math.floor(Math.abs(difference) * 4 / step));
        const nibble = magnitude | (difference < 0 ? 8 : 0);
        const change = Math.floor((2 * magnitude + 1) * step / 8);
        predictor = Math.max(-32768, Math.min(32767, predictor + (difference < 0 ? -change : change)));
        step = Math.max(127, Math.min(24576, Math.floor(step * STEP_SCALE[magnitude] / 256)));
        data[1 + (i >> 1)] |= nibble << (i % 2 ? 0 : 4);
      }
      const current = generation;
      pending++;
      send(0x18, data).catch(error => {
        if (current === generation) {
          stop();
          reportError(error);
        }
      }).finally(() => { pending--; });
    }
    nextReport += PERIOD;
    schedule();
  }

  function stop() {
    enabled = false;
    generation++;
    tracks.clear();
    stopTimer();
  }

  return {
    enable() { predictor = 0; step = 127; enabled = true; schedule(); },
    start(token, name, buffer, effect, volume, loop) {
      tracks.set(token, { name, buffer, start: effect.start, end: effect.end, volume, loop, started: clock() });
      schedule();
    },
    testTone(token) {
      const data = createWiiTestScale();
      const buffer = { sampleRate: RATE, numberOfChannels: 1, getChannelData: () => data };
      tracks.set(token, { name: 'test-tone', buffer, start: 0, end: data.length / RATE, volume: 1, loop: false, started: clock() });
      schedule();
    },
    stopTrack(token) { tracks.delete(token); if (!tracks.size) stopTimer(); },
    setVolume(name, volume) {
      for (const track of tracks.values()) if (track.name === name) track.volume = volume;
    },
    stop
  };
}
