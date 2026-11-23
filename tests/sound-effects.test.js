import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundEffects } from '../src/sound-effects.js';

function harness(fetchAudio = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })) {
  const sources = [], errors = [];
  const context = {
    state: 'running',
    destination: {},
    decodeAudioData: async () => ({}),
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
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
  return { sounds, sources, errors, context };
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
