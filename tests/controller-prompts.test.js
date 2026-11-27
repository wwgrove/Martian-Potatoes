import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { controllerChoices, defaultController, validController, gamepadPromptType, promptButtons, promptText, promptIcon, updateControllerPrompts } from '../src/controller-prompts.js';

test('controller choice defaults to PS4 and does not infer a standard gamepad brand', () => {
  assert.equal(defaultController, 'playstation');
  assert.equal(validController('ps5'), true);
  assert.equal(validController('unknown'), false);
  assert.equal(gamepadPromptType({ id: 'Xbox Wireless Controller' }, 'playstation'), 'playstation');
  assert.equal(gamepadPromptType({ id: 'Wireless Controller' }, 'xbox'), 'xbox');
  assert.equal(gamepadPromptType({ id: 'Wii Remote' }, 'xbox'), 'wii');
  assert.equal(gamepadPromptType({ id: 'Standard Gamepad' }, 'wii'), 'generic');
});

test('prompts use the actual standard button positions and sideways Wii controls', () => {
  assert.equal(promptText('playstation', 'work'), '×');
  assert.equal(promptText('xbox', 'work'), 'A');
  assert.equal(promptText('switch', 'work'), 'B');
  assert.equal(promptText('switch', 'park'), 'A');
  assert.equal(promptText('wii', 'work'), '2');
  assert.equal(promptText('wii', 'park'), '1');
  assert.equal(promptText('wii', 'tools'), 'A');
  assert.equal(promptText('wii', 'orbit'), 'HOLD B');
  assert.equal(promptText('keyboard', 'tools'), '1 / 2 / 3 / 4');
  assert.deepEqual(promptButtons('touch', 'tools'), [['TAP TOOL', 'Tap an attachment']]);
});

test('all selected controller artwork exists, with colored face buttons and white Wii icons', () => {
  for (const type of controllerChoices) for (const action of ['move', 'work', 'park', 'menu', 'orbit', 'tools', 'zoom']) {
    promptButtons(type, action).forEach((_, index) => {
      const icon = promptIcon(type, action, index);
      if (icon) assert.ok(existsSync(icon), `Missing ${icon}`);
    });
  }
  assert.match(promptIcon('playstation', 'work'), /ps4_cross\.svg/);
  assert.match(readFileSync(promptIcon('playstation', 'work'), 'utf8'), /#9CB5D6/);
  assert.match(promptIcon('xbox', 'work'), /color_a/);
  assert.match(promptIcon('wii', 'work'), /wii_button_2\.png$/);
  assert.equal(promptIcon('touch', 'work'), '');
});

test('switching prompts renders accessible icons and restores keyboard and touch labels', () => {
  const prompt = { dataset: { controlPrompt: 'work' }, replaceChildren(...children) { this.children = children; } };
  const toolKey = { hidden: false }, gamepadHelp = {}, touchAlternative = {}, info = {};
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
      return { attributes: {}, children: [], append(child) { this.children.push(child); }, classList: { add() {} }, setAttribute(name, value) { this.attributes[name] = value; } };
    }
  };
  updateControllerPrompts(document, 'playstation');
  assert.equal(prompt.children[0].children[0].alt, 'Cross button');
  assert.match(prompt.children[0].children[0].src, /ps4_cross\.svg/);
  assert.equal(toolKey.hidden, true);
  assert.equal(gamepadHelp.hidden, false);
  updateControllerPrompts(document, 'touch');
  assert.equal(prompt.children[0].textContent, '● WORK');
  assert.equal(gamepadHelp.hidden, true);
  assert.equal(touchAlternative.hidden, true);
  updateControllerPrompts(document, 'keyboard');
  assert.equal(prompt.children[0].textContent, 'SPACE');
  assert.equal(toolKey.hidden, false);
  assert.equal(info.title, 'Menu · ESC');
});
