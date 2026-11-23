import test from 'node:test';
import assert from 'node:assert/strict';
import { setupMusic } from '../src/music.js';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.calls = 0;
    this.block = false;
  }
  play() {
    this.calls++;
    if (this.block) return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
}

class FakeButton extends EventTarget {
  constructor(style) {
    super();
    this.dataset = { musicToggle: style };
    this.attributes = {};
  }
  setAttribute(name, value) { this.attributes[name] = value; }
}

test('music starts on interaction after autoplay is blocked and respects mute', async () => {
  const audio = new FakeAudio(), button = new FakeButton('text'), events = new EventTarget();
  audio.block = true;
  setupMusic(audio, [button], events, { hidden: true });
  await Promise.resolve();
  assert.equal(button.textContent, 'MUSIC: START');
  audio.block = false;
  events.dispatchEvent(new Event('pointerdown'));
  await Promise.resolve();
  assert.equal(audio.paused, false);
  assert.equal(button.textContent, 'MUSIC: ON');
  button.dispatchEvent(new Event('click'));
  assert.equal(audio.paused, true);
  assert.equal(button.textContent, 'MUSIC: OFF');
  events.dispatchEvent(new Event('keydown'));
  assert.equal(audio.calls, 2);
  button.dispatchEvent(new Event('click'));
  await Promise.resolve();
  assert.equal(audio.paused, false);
  assert.equal(button.textContent, 'MUSIC: ON');
});

test('a late autoplay rejection cannot override a successful interaction', async () => {
  const audio = new FakeAudio(), button = new FakeButton('text'), events = new EventTarget();
  let rejectFirst;
  audio.play = function () {
    this.calls++;
    if (this.calls === 1) return new Promise((resolve, reject) => { rejectFirst = reject; });
    this.paused = false;
    return Promise.resolve();
  };
  setupMusic(audio, [button], events, { hidden: true });
  events.dispatchEvent(new Event('pointerdown'));
  await Promise.resolve();
  rejectFirst(new DOMException('Autoplay blocked', 'NotAllowedError'));
  await Promise.resolve();
  assert.equal(audio.paused, false);
  assert.equal(button.textContent, 'MUSIC: ON');
});

test('a media failure is reported rather than treated as blocked autoplay', async () => {
  const audio = new FakeAudio(), button = new FakeButton('text'), events = new EventTarget();
  const status = { hidden: true, textContent: '' };
  const originalError = console.error;
  audio.play = () => Promise.reject(new DOMException('Unsupported audio', 'NotSupportedError'));
  try {
    console.error = () => {};
    setupMusic(audio, [button], events, status);
    await Promise.resolve();
    assert.equal(button.textContent, 'MUSIC: ERROR');
    assert.equal(button.disabled, true);
    assert.equal(status.hidden, false);
    assert.match(status.textContent, /web server/);
  } finally {
    console.error = originalError;
  }
});
