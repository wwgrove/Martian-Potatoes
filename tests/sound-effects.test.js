import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundEffects, loadSoundVolumes, saveSoundVolumes, SOUND_VOLUME_KEY } from '../src/sound-effects.js';
import { resetProgress, SAVE_KEY } from '../src/persistence.js';

function harness(fetchAudio = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })) {
  const sources = [], gains = [], errors = [];
  const context = {
    state: 'running',
    destination: {},
    decodeAudioData: async () => ({}),
    createGain() {
      const gain = { gain: {}, connect() {}, disconnect() {} };
      gains.push(gain);
      return gain;
    },
    createBufferSource() {
      const source = {
        connect() {}, disconnect() {},
        start(...args) { this.started = args; },
        stop() { this.stopped = true; }
      };
      sources.push(source);
      return source;
    }
  };
  const sounds = createSoundEffects(() => context, fetchAudio, error => errors.push(error), () => 0);
  return { sounds, sources, gains, errors, context };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('work and irrigation loops run independently and stop when their actions stop', async () => {
  const { sounds, sources } = harness();
  sounds.setLoop('tool', 'drill');
  sounds.setLoop('water', 'water');
  await settle();
  assert.equal(sources.length, 2);
  assert.ok(sources.every(source => source.loop));
  sounds.setLoop('tool', 'drill');
  assert.equal(sources.length, 2);
  sounds.setLoop('tool', null);
  assert.equal(sources[0].stopped, true);
  assert.equal(sources[1].stopped, undefined);
  sounds.stopAll();
  assert.equal(sources[1].stopped, true);
});

test('the tiller uses its own recording without changing the plow sound', async () => {
  const { sounds, sources, context } = harness(async url => ({
    ok: true, arrayBuffer: async () => url
  }));
  context.decodeAudioData = async url => ({ url });
  sounds.setLoop('tool', 'tiller');
  await settle();
  assert.match(sources[0].buffer.url, /YTDown\.com_YouTube_Media_gK0WqCwn5W0_Plow-Dragging-Soil-Sound-Effect_001_1080p\.mp3$/);
  assert.equal(sources[0].loop, true);
  sounds.setLoop('tool', 'plow');
  await settle();
  assert.equal(sources[0].stopped, true);
  assert.match(sources[1].buffer.url, /\/Plow-Noise\.mp3$/);
  assert.equal(sources[1].loop, true);
});

test('volume adjustments affect playing and subsequent sounds without affecting other effects', async () => {
  const { sounds, gains } = harness();
  sounds.setLoop('tool', 'tiller');
  sounds.setLoop('water', 'water');
  await settle();
  const waterVolume = gains[1].gain.value;
  sounds.setVolume('tiller', 0.12);
  assert.equal(gains[0].gain.value, 0.12);
  assert.equal(gains[1].gain.value, waterVolume);
  sounds.setLoop('tool', null);
  sounds.setLoop('tool', 'tiller');
  await settle();
  assert.equal(gains[2].gain.value, 0.12);
  assert.throws(() => sounds.setVolume('tiller', 2.01), RangeError);
  assert.throws(() => sounds.setVolume('invalid', 1), RangeError);
});

test('sound levels survive a mission reset and invalid saved levels are reported', () => {
  const data = new Map(), storage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  const volumes = harness().sounds.getVolumes();
  volumes.tiller = 0.18;
  saveSoundVolumes(storage, volumes);
  storage.setItem(SAVE_KEY, 'mission');
  resetProgress(storage);
  assert.deepEqual(loadSoundVolumes(storage), volumes);
  storage.setItem(SOUND_VOLUME_KEY, '{"tiller":3}');
  assert.throws(() => loadSoundVolumes(storage), /invalid/);
  assert.throws(() => saveSoundVolumes(storage, { ...volumes, plow: -1 }), /invalid/);
  assert.throws(() => loadSoundVolumes({ getItem() { throw new Error('storage unavailable'); } }), /storage unavailable/);
  assert.throws(() => saveSoundVolumes({ setItem() { throw new Error('storage unavailable'); } }, volumes), /storage unavailable/);
});

test('a preview requested while audio resumes starts once and does not outlive cancellation', async () => {
  const { sounds, sources, context } = harness();
  let resume;
  context.state = 'suspended';
  context.resume = () => new Promise(resolve => { resume = () => { context.state = 'running'; resolve(); }; });
  sounds.setLoop('preview', 'tiller');
  resume();
  await settle();
  assert.equal(sources.length, 1);
  sounds.setLoop('preview', null);
  assert.equal(sources[0].stopped, true);

  context.state = 'suspended';
  sounds.setLoop('preview', 'plow');
  sounds.setLoop('preview', null);
  resume();
  await settle();
  assert.equal(sources.length, 1);
});

test('a later interaction can resume audio even if an earlier resume is still pending', async () => {
  const { sounds, sources, context, errors } = harness();
  let attempts = 0, rejectFirst;
  context.state = 'suspended';
  context.resume = () => {
    attempts++;
    if (attempts === 1) return new Promise((resolve, reject) => { rejectFirst = reject; });
    context.state = 'running';
    return Promise.resolve();
  };
  sounds.setLoop('tool', 'tiller');
  sounds.unlock();
  await settle();
  rejectFirst(new Error('Earlier resume was blocked'));
  await settle();
  assert.equal(attempts, 2);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, true);
  assert.equal(errors.length, 0);
});

test('stale loading cannot start a stopped loop or interrupted one-shot', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { sounds, sources } = harness(() => pending);
  sounds.setLoop('tool', 'plow');
  sounds.play('pickup');
  sounds.stopAll();
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  await settle();
  assert.equal(sources.length, 0);
});

test('one-shots use their audible segments and mute prevents playback', async () => {
  const { sounds, sources } = harness();
  sounds.play('attach');
  sounds.play('pickup');
  await settle();
  assert.equal(sources.length, 2);
  assert.equal(sources[0].loop, false);
  assert.ok(sources[0].started[1] > 2);
  assert.ok(sources[1].started[1] > 2);
  sounds.setEnabled(false);
  assert.ok(sources.every(source => source.stopped));
  sounds.play('pickup');
  sounds.setLoop('tool', 'harvest');
  await settle();
  assert.equal(sources.length, 2);
  sounds.setEnabled(true);
  sounds.setLoop('tool', 'harvest');
  await settle();
  assert.equal(sources.length, 3);
});

test('audio loading and unavailable audio contexts are reported', async () => {
  const { sounds, sources, errors } = harness(async () => ({ ok: false, status: 404 }));
  sounds.setLoop('tool', 'drill');
  await settle();
  assert.equal(sources.length, 0);
  assert.ok(errors.some(error => error.message.includes('Auger-Drill-Sound.mp3')));
  const contextErrors = [];
  const unavailable = createSoundEffects(() => { throw new Error('unsupported'); }, () => {}, error => contextErrors.push(error));
  unavailable.unlock();
  unavailable.unlock();
  assert.equal(contextErrors.length, 1);
});

test('suspended audio does not queue stale one-shots and resumes only active loops', async () => {
  const { sounds, sources, context } = harness();
  context.state = 'suspended';
  context.resume = () => new Promise(() => {});
  sounds.setLoop('tool', 'drill');
  sounds.play('pickup');
  await settle();
  assert.equal(sources.length, 0);
  context.state = 'running';
  sounds.setLoop('tool', 'drill');
  await settle();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, true);
});
