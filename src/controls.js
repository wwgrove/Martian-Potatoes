const deadzone = value => Math.abs(value || 0) > 0.2 ? value : 0;

export function pressKeyboardKey(keys, event) {
  if (event.altKey || event.ctrlKey || event.metaKey || /^(Alt|Control|Meta)(Left|Right)$/.test(event.code)) {
    keys.clear();
    return false;
  }
  if (event.repeat && !keys.has(event.code)) return false;
  keys.add(event.code);
  return true;
}

export function readGamepad(gamepad) {
  const pressed = index => Boolean(gamepad?.buttons[index]?.pressed);
  const x = gamepad?.axes[0] || 0, y = gamepad?.axes[1] || 0;
  const moving = Math.hypot(x, y) > 0.2;
  return {
    right: (moving ? x : 0) + Number(pressed(15)) - Number(pressed(14)),
    forward: (moving ? -y : 0) + Number(pressed(12)) - Number(pressed(13)),
    orbit: deadzone(gamepad?.axes[2]),
    tilt: deadzone(gamepad?.axes[3]),
    buttons: Array.from({ length: 16 }, (_, index) => pressed(index))
  };
}

export function createGamepadSelector() {
  let selected = null, previous = new Map();
  return {
    update(pads) {
      const current = new Map();
      for (const pad of pads) {
        const id = `${pad.index}:${pad.id}`, input = readGamepad(pad), last = previous.get(id);
        const active = Boolean(input.right || input.forward || input.orbit || input.tilt || input.buttons.some(Boolean));
        const engaged = active && (!last?.active || input.buttons.some((pressed, index) => pressed && !last.buttons[index]));
        current.set(id, { pad, input, active, engaged, previousButtons: last?.buttons || [] });
      }
      if (!current.has(selected)) selected = current.has('1000:Wii Remote') ? '1000:Wii Remote' : current.keys().next().value;
      for (const [id, entry] of current) if (entry.engaged) selected = id;
      const choice = current.get(selected);
      previous = new Map([...current].map(([id, entry]) => [id, { active: entry.active, buttons: entry.input.buttons }]));
      return choice || null;
    }
  };
}

export function newlyPressed(current, previous, index) {
  return current[index] && !previous[index];
}

export function joystickVector(x, y, radius) {
  const distance = Math.hypot(x, y);
  if (distance < radius * 0.1) return { right: 0, forward: 0 };
  const scale = Math.min(distance, radius) / (distance * radius);
  return { right: x * scale, forward: -y * scale };
}

export function createTouchCamera() {
  const touches = new Map();
  const distance = () => {
    const [a, b] = touches.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  return {
    start(id, x, y) {
      if (touches.has(id) || touches.size >= 2) return false;
      if (touches.size) for (const touch of touches.values()) touch.moved = true;
      touches.set(id, { x, y, startX: x, startY: y, moved: touches.size > 0 });
      return true;
    },
    move(id, x, y) {
      const touch = touches.get(id);
      if (!touch) return null;
      const previousDistance = touches.size === 2 ? distance() : 0;
      const dx = x - touch.x, dy = y - touch.y;
      touch.x = x; touch.y = y;
      if (touches.size === 2) {
        const nextDistance = distance();
        return previousDistance > 0 && nextDistance > 0 ? { zoom: previousDistance / nextDistance } : null;
      }
      if (Math.hypot(x - touch.startX, y - touch.startY) > 8) touch.moved = true;
      return touch.moved ? { dx, dy } : null;
    },
    end(id, cancelled = false) {
      const touch = touches.get(id);
      if (!touch) return false;
      const tap = !cancelled && touches.size === 1 && !touch.moved;
      touches.delete(id);
      for (const remaining of touches.values()) remaining.moved = true;
      return tap;
    },
    clear() { touches.clear(); }
  };
}

export function wheelZoomDelta(deltaY, deltaMode, pinch) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 200 : 1);
  return Math.max(-1, Math.min(1, pixels * (pinch ? 0.05 : 0.025)));
}
