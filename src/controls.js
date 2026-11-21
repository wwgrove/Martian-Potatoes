const deadzone = value => Math.abs(value || 0) > 0.2 ? value : 0;

export function readGamepad(gamepad) {
  const pressed = index => Boolean(gamepad?.buttons[index]?.pressed);
  return {
    right: deadzone(gamepad?.axes[0]) + Number(pressed(15)) - Number(pressed(14)),
    forward: -deadzone(gamepad?.axes[1]) + Number(pressed(12)) - Number(pressed(13)),
    orbit: deadzone(gamepad?.axes[2]),
    tilt: deadzone(gamepad?.axes[3]),
    buttons: Array.from({ length: 10 }, (_, index) => pressed(index))
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
