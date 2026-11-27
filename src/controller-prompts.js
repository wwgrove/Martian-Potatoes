const keyboard = {
  move: [['W'], ['A'], ['S'], ['D']], work: [['SPACE']], park: [['F']],
  menu: [['ESC']], orbit: [['Q'], ['E']], tools: [['1'], ['2'], ['3'], ['4']], zoom: [['+'], ['−']]
};
const touch = {
  move: [['⊙ MOVE', 'Move joystick']], work: [['● WORK', 'Work button']], park: [['● PARK', 'Park tool button']],
  menu: [['☰ MENU', 'Menu button']], orbit: [['↔ SWIPE', 'Swipe to orbit']],
  tools: [['TAP TOOL', 'Tap an attachment']], zoom: [['⇔ PINCH', 'Pinch to zoom']]
};
const playstation = {
  move: [['L STICK', 'Left stick', 'playstation_stick_l']], work: [['×', 'Cross button', 'playstation_button_color_cross']],
  park: [['○', 'Circle button', 'playstation_button_color_circle']], menu: [['OPTIONS', 'Options button', 'playstation4_button_options']],
  orbit: [['R STICK', 'Right stick', 'playstation_stick_r']],
  tools: [['L1', 'L1', 'playstation_trigger_l1'], ['R1', 'R1', 'playstation_trigger_r1']],
  zoom: [['L2', 'L2', 'playstation_trigger_l2'], ['R2', 'R2', 'playstation_trigger_r2']]
};
const xbox = {
  move: [['L STICK', 'Left stick', 'xbox_stick_l']], work: [['A', 'A button', 'xbox_button_color_a']],
  park: [['B', 'B button', 'xbox_button_color_b']], menu: [['MENU', 'Menu button', 'xbox_button_menu']],
  orbit: [['R STICK', 'Right stick', 'xbox_stick_r']], tools: [['LB', 'Left bumper', 'xbox_lb'], ['RB', 'Right bumper', 'xbox_rb']],
  zoom: [['LT', 'Left trigger', 'xbox_lt'], ['RT', 'Right trigger', 'xbox_rt']]
};
function nintendo(prefix) {
  return {
    move: [['L STICK', 'Left stick', `${prefix}_stick_l`]],
    work: [['B', 'B button', `${prefix}_button_b`]], park: [['A', 'A button', `${prefix}_button_a`]],
    menu: [['+', 'Plus button', `${prefix}_button_plus`]], orbit: [['R STICK', 'Right stick', `${prefix}_stick_r`]],
    tools: [['L', 'L button', `${prefix}_button_l`], ['R', 'R button', `${prefix}_button_r`]],
    zoom: [['ZL', 'ZL button', `${prefix}_button_zl`], ['ZR', 'ZR button', `${prefix}_button_zr`]]
  };
}
const buttons = {
  keyboard, touch, playstation, xbox,
  ps3: { ...playstation, menu: [['START', 'Start button', 'playstation3_button_start']] },
  ps5: { ...playstation, menu: [['OPTIONS', 'Options button', 'playstation5_button_options']] },
  switch: nintendo('switch'), switch2: nintendo('switch'), wiiu: nintendo('wiiu'),
  steamdeck: {
    move: [['L STICK', 'Left stick', 'steamdeck_stick_l']], work: [['A', 'A button', 'steamdeck_button_a']],
    park: [['B', 'B button', 'steamdeck_button_b']], menu: [['OPTIONS', 'Options button', 'steamdeck_button_options']],
    orbit: [['R STICK', 'Right stick', 'steamdeck_stick_r']],
    tools: [['L1', 'L1', 'steamdeck_button_l1'], ['R1', 'R1', 'steamdeck_button_r1']],
    zoom: [['L2', 'L2', 'steamdeck_button_l2'], ['R2', 'R2', 'steamdeck_button_r2']]
  },
  steam: {
    move: [['STICK', 'Stick', 'steam_stick']], work: [['A', 'A button', 'steam_button_color_a']],
    park: [['B', 'B button', 'steam_button_color_b']], menu: [['START', 'Start button', 'steam_button_start_icon']],
    orbit: [['R PAD', 'Right pad', 'steam_pad']], tools: [['LB', 'Left bumper', 'steam_lb'], ['RB', 'Right bumper', 'steam_rb']],
    zoom: [['LT', 'Left trigger', 'steam_lt'], ['RT', 'Right trigger', 'steam_rt']]
  },
  gamecube: {
    move: [['STICK', 'Control stick', 'gamecube_stick']], work: [['B', 'Bottom button (B)', 'gamecube_button_color_b']],
    park: [['A', 'Right face button (A)', 'gamecube_button_color_a']], menu: [['START', 'Start button', 'gamecube_button_start']],
    orbit: [['C STICK', 'C stick', 'gamecube_stick_color_c']],
    tools: [['L BUMPER'], ['R BUMPER']], zoom: [['L', 'L trigger', 'gamecube_trigger_l'], ['R', 'R trigger', 'gamecube_trigger_r']]
  },
  wii: {
    move: [['D-PAD', 'Directional pad', 'wii_dpad']], work: [['2', '2 button', 'wii_button_2']],
    park: [['1', '1 button', 'wii_button_1']], menu: [['HOME', 'Home button', 'wii_button_home']],
    orbit: [['HOLD B', 'Hold B and rotate the remote', 'wii_button_b']], tools: [['A', 'A button', 'wii_button_a']],
    zoom: [['+', 'Plus button', 'wii_button_plus'], ['−', 'Minus button', 'wii_button_minus']]
  },
  generic: {
    move: [['L STICK', 'Left stick']], work: [['BOTTOM', 'Bottom button']], park: [['RIGHT', 'Right face button']],
    menu: [['START', 'Start button']], orbit: [['R STICK', 'Right stick']],
    tools: [['L BUMPER'], ['R BUMPER']], zoom: [['L TRIGGER'], ['R TRIGGER']]
  }
};

export const controllerChoices = ['playstation', 'ps5', 'ps3', 'xbox', 'switch', 'switch2', 'wiiu', 'wii', 'gamecube', 'steamdeck', 'steam', 'generic'];
export const defaultController = 'playstation';
export const controllerStorageKey = 'martian-potatoes-controller';
export function validController(type) { return controllerChoices.includes(type); }
export function gamepadPromptType(gamepad, selectedController) {
  if (gamepad?.id === 'Wii Remote') return 'wii';
  return selectedController === 'wii' ? 'generic' : selectedController;
}

const folders = {
  playstation: 'PlayStation Series', ps5: 'PlayStation Series', ps3: 'PlayStation Series',
  xbox: 'Xbox Series', switch: 'Nintendo Switch', switch2: 'Nintendo Switch 2',
  wiiu: 'Nintendo WiiU', wii: 'Nintendo Wii', gamecube: 'Nintendo Gamecube',
  steamdeck: 'Steam Deck', steam: 'Steam Controller'
};
export function promptButtons(type, action) { return buttons[type][action]; }
export function promptText(type, action) { return promptButtons(type, action).map(([text]) => text).join(' / '); }
export function isFaceButton(type, action) {
  return ['playstation', 'ps3', 'ps5', 'xbox'].includes(type) && (action === 'work' || action === 'park');
}
export function promptIcon(type, action, index = 0) {
  if (type === 'playstation' && index === 0 && (action === 'work' || action === 'park')) {
    return `assets/controller-prompts/PlayStation Series/ps4_${action === 'work' ? 'cross' : 'circle'}.svg`;
  }
  const icon = promptButtons(type, action)[index]?.[2];
  return icon ? `assets/controller-prompts/${folders[type]}/${icon}.png` : '';
}

export function updateControllerPrompts(document, type) {
  document.querySelectorAll('[data-control-prompt]').forEach(element => {
    const action = element.dataset.controlPrompt;
    const keys = promptButtons(type, action).map(([text, label], index) => {
      const icon = promptIcon(type, action, index);
      const key = document.createElement(icon || type === 'touch' ? 'span' : 'kbd');
      if (icon) {
        const image = document.createElement('img');
        image.src = icon; image.alt = label || text; image.className = 'controller-icon';
        key.append(image);
        if (type === 'wii' && action === 'orbit') key.append(document.createTextNode(' HOLD'));
      } else {
        key.textContent = text;
        if (label) key.setAttribute('aria-label', label);
        if (type === 'touch') key.classList.add('touch-key');
        else if (type !== 'keyboard') key.classList.add('gamepad-key');
        if (isFaceButton(type, action)) key.classList.add('gamepad-face');
      }
      return key;
    });
    element.replaceChildren(...keys);
  });
  document.querySelectorAll('.tool kbd').forEach(key => { key.hidden = type !== 'keyboard'; });
  document.getElementById('info-button').title = type === 'touch' ? 'Menu' : `Menu · ${promptText(type, 'menu')}`;
  document.body.dataset.inputMode = type;
  document.querySelectorAll('[data-tool-control-label]').forEach(element => { element.textContent = type === 'wii' ? 'SELECT REQUIRED TOOL' : 'CHANGE TOOL'; });
  document.querySelectorAll('[data-tool-hint]').forEach(element => { element.textContent = type === 'wii' ? 'SELECTS REQUIRED TOOL' : 'TO SWITCH'; });
  document.querySelectorAll('[data-gamepad-help]').forEach(element => { element.hidden = type === 'keyboard' || type === 'touch'; });
  document.querySelectorAll('[data-touch-alternative]').forEach(element => { element.hidden = type === 'touch'; });
}
