export function controllerType(gamepad) {
  if (!gamepad) return 'keyboard';
  const id = (gamepad.id || '').toLowerCase();
  if (/xbox|xinput|vendor:\s*045e|045e[-:]/.test(id)) return 'xbox';
  if (/playstation|dualshock|dualsense|sony|vendor:\s*054c|054c[-:]/.test(id) || id.trim() === 'wireless controller') return 'playstation';
  return 'generic';
}

const buttons = {
  keyboard: {
    move: [['W'], ['A'], ['S'], ['D']], work: [['SPACE']], park: [['F']],
    menu: [['ESC']], orbit: [['Q'], ['E']], tools: [['1'], ['2'], ['3'], ['4']],
    zoom: [['+'], ['−']]
  },
  touch: {
    move: [['⊙ MOVE', 'Move joystick']], work: [['● WORK', 'Work button']], park: [['● PARK', 'Park tool button']],
    menu: [['☰ MENU', 'Menu button']], orbit: [['↔ SWIPE', 'Swipe to orbit']],
    tools: [['TAP TOOL', 'Tap an attachment']], zoom: [['⇔ PINCH', 'Pinch to zoom']]
  },
  playstation: {
    move: [['L STICK', 'Left stick']], work: [['×', 'Cross button']], park: [['○', 'Circle button']],
    menu: [['OPTIONS', 'Options button']], orbit: [['R STICK', 'Right stick']],
    tools: [['L1'], ['R1']], zoom: [['L2'], ['R2']]
  },
  xbox: {
    move: [['L STICK', 'Left stick']], work: [['A', 'A button']], park: [['B', 'B button']],
    menu: [['MENU', 'Menu button']], orbit: [['R STICK', 'Right stick']],
    tools: [['LB'], ['RB']], zoom: [['LT'], ['RT']]
  },
  generic: {
    move: [['L STICK', 'Left stick']], work: [['BOTTOM', 'Bottom button']], park: [['RIGHT', 'Right face button']],
    menu: [['START', 'Start button']], orbit: [['R STICK', 'Right stick']],
    tools: [['L BUMPER'], ['R BUMPER']], zoom: [['L TRIGGER'], ['R TRIGGER']]
  }
};

export function promptButtons(type, action) {
  return buttons[type][action];
}

export function promptText(type, action) {
  return promptButtons(type, action).map(([text]) => text).join(' / ');
}

export function isFaceButton(type, action) {
  return (type === 'playstation' || type === 'xbox') && (action === 'work' || action === 'park');
}

export function updateControllerPrompts(document, type) {
  document.querySelectorAll('[data-control-prompt]').forEach(element => {
    const keys = promptButtons(type, element.dataset.controlPrompt).map(([text, label]) => {
      const key = document.createElement(type === 'touch' ? 'span' : 'kbd');
      key.textContent = text;
      if (label) key.setAttribute('aria-label', label);
      if (type === 'touch') key.classList.add('touch-key');
      else if (type !== 'keyboard') key.classList.add('gamepad-key');
      if (isFaceButton(type, element.dataset.controlPrompt)) key.classList.add('gamepad-face');
      return key;
    });
    element.replaceChildren(...keys);
  });
  document.querySelectorAll('.tool kbd').forEach(key => { key.hidden = type !== 'keyboard'; });
  document.getElementById('info-button').title = type === 'touch' ? 'Menu' : `Menu · ${promptText(type, 'menu')}`;
  document.body.dataset.inputMode = type;
  document.querySelectorAll('[data-gamepad-help]').forEach(element => { element.hidden = type === 'keyboard' || type === 'touch'; });
  document.querySelectorAll('[data-touch-alternative]').forEach(element => { element.hidden = type === 'touch'; });
}
