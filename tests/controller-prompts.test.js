import test from 'node:test';
import assert from 'node:assert/strict';
import { controllerType, promptButtons, promptText, isFaceButton, updateControllerPrompts } from '../src/controller-prompts.js';

test('identifies controller families from names or browser vendor IDs without guessing unknown devices', () => {
  assert.equal(controllerType(null), 'keyboard');
  for (const id of ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'Wireless Controller', 'DualSense Wireless Controller', '054c-0ce6']) {
    assert.equal(controllerType({ id }), 'playstation');
  }
  for (const id of ['Xbox Wireless Controller', 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'Vendor: 045e Product: 02ea']) {
    assert.equal(controllerType({ id }), 'xbox');
  }
  assert.equal(controllerType({ id: 'Standard Gamepad' }), 'generic');
  assert.equal(controllerType({ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)' }), 'generic');
  assert.equal(controllerType({ id: '' }), 'generic');
});

test('controller prompts match the supported actions and distinguish brands', () => {
  assert.deepEqual(promptButtons('playstation', 'work')[0], ['×', 'Cross button']);
  assert.deepEqual(promptButtons('playstation', 'park')[0], ['○', 'Circle button']);
  assert.equal(promptText('playstation', 'tools'), 'L1 / R1');
  assert.equal(promptText('xbox', 'work'), 'A');
  assert.equal(promptText('xbox', 'park'), 'B');
  assert.equal(promptText('xbox', 'tools'), 'LB / RB');
  assert.equal(promptText('generic', 'work'), 'BOTTOM');
  assert.equal(promptText('keyboard', 'tools'), '1 / 2 / 3 / 4');
  assert.equal(isFaceButton('playstation', 'work'), true);
  assert.equal(isFaceButton('xbox', 'park'), true);
  assert.equal(isFaceButton('keyboard', 'work'), false);
  assert.equal(isFaceButton('playstation', 'tools'), false);
});

test('switching prompts hides direct tool shortcuts and restores keyboard prompts on disconnect', () => {
  const prompt = { dataset: { controlPrompt: 'work' }, replaceChildren(...children) { this.children = children; } };
  const toolKey = { hidden: false };
  const gamepadHelp = {}, touchAlternative = {};
  const info = {};
  const document = {
    body: { dataset: {} },
    querySelectorAll(selector) {
      if (selector === '[data-control-prompt]') return [prompt];
      if (selector === '.tool kbd') return [toolKey];
      if (selector === '[data-gamepad-help]') return [gamepadHelp];
      if (selector === '[data-touch-alternative]') return [touchAlternative];
      return [];
    },
    getElementById() { return info; },
    createElement() {
      return { attributes: {}, classList: { add() {} }, setAttribute(name, value) { this.attributes[name] = value; } };
    }
  };
  updateControllerPrompts(document, 'playstation');
  assert.equal(prompt.children[0].textContent, '×');
  assert.equal(prompt.children[0].attributes['aria-label'], 'Cross button');
  assert.equal(toolKey.hidden, true);
  assert.equal(info.title, 'Menu · OPTIONS');
  assert.equal(gamepadHelp.hidden, false);
  updateControllerPrompts(document, 'xbox');
  assert.equal(prompt.children[0].textContent, 'A');
  assert.equal(info.title, 'Menu · MENU');
  updateControllerPrompts(document, 'touch');
  assert.equal(prompt.children[0].textContent, '● WORK');
  assert.equal(document.body.dataset.inputMode, 'touch');
  assert.equal(info.title, 'Menu');
  assert.equal(gamepadHelp.hidden, true);
  assert.equal(touchAlternative.hidden, true);
  updateControllerPrompts(document, 'keyboard');
  assert.equal(prompt.children[0].textContent, 'SPACE');
  assert.equal(toolKey.hidden, false);
  assert.equal(info.title, 'Menu · ESC');
  assert.equal(touchAlternative.hidden, false);
});
