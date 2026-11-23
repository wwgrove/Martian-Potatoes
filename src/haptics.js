const effects = {
  walk:       { pattern: [22], interval: 380, strong: 0.12, weak: 0.18 },
  tracks:     { pattern: [38], interval: 240, strong: 0.25, weak: 0.16 },
  till:       { pattern: [65], interval: 150, strong: 0.38, weak: 0.55 },
  furrow:     { pattern: [48], interval: 220, strong: 0.42, weak: 0.16 },
  drill:      { pattern: [35], interval: 105, strong: 0.2, weak: 0.55 },
  plant:      { pattern: [20], interval: 450, strong: 0.1, weak: 0.18 },
  hill:       { pattern: [42], interval: 180, strong: 0.34, weak: 0.23 },
  harvest:    { pattern: [24], interval: 90, strong: 0.17, weak: 0.5 },
  attach:     { pattern: [35, 45, 50], strong: 0.45, weak: 0.35 },
  complete:   { pattern: [32], strong: 0.3, weak: 0.35 },
  irrigation: { pattern: [30, 60, 30], strong: 0.25, weak: 0.35 }
};

export function createHaptics(navigator, reportError = error => console.warn('Haptic feedback unavailable:', error)) {
  let enabled = true, source = null, gamepad = null, active = null, nextPulse = 0, eventUntil = 0;
  let activeActuator = null, warned = false;
  const report = error => { if (!warned) { warned = true; reportError(error); } };
  const observe = result => {
    if (result && typeof result.then === 'function') result.then(status => {
      if (status === 'not-supported' || status === false) report(new Error('Controller vibration is not supported.'));
    }, report);
  };
  function stop() {
    if (active && source === 'touch' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(0); } catch (error) { report(error); }
    }
    if (activeActuator && typeof activeActuator.reset === 'function') {
      try { observe(activeActuator.reset()); } catch (error) { report(error); }
    } else if (activeActuator && typeof activeActuator.pulse === 'function') {
      try { observe(activeActuator.pulse(0, 0)); } catch (error) { report(error); }
    }
    active = null; activeActuator = null; nextPulse = 0; eventUntil = 0;
  }
  function emit(name, now, event) {
    const effect = effects[name];
    if (!effect) throw new RangeError(`Unknown haptic effect: ${name}`);
    const duration = effect.pattern.reduce((sum, value) => sum + value, 0);
    if (source === 'touch' && typeof navigator.vibrate === 'function') {
      try {
        if (!navigator.vibrate(effect.pattern)) report(new Error('Device vibration request was rejected.'));
      } catch (error) { report(error); }
    } else if (source === 'gamepad') {
      const actuator = gamepad?.vibrationActuator || gamepad?.hapticActuators?.[0];
      if (actuator) {
        try {
          if (typeof actuator.playEffect === 'function') {
            activeActuator = actuator;
            observe(actuator.playEffect('dual-rumble', { duration, strongMagnitude: effect.strong, weakMagnitude: effect.weak }));
          } else if (typeof actuator.pulse === 'function') {
            activeActuator = actuator;
            observe(actuator.pulse(Math.max(effect.strong, effect.weak), duration));
          }
        } catch (error) { report(error); }
      }
    }
    active = name;
    nextPulse = now + (effect.interval || duration);
    eventUntil = event ? now + duration : 0;
  }
  return {
    setEnabled(value) { if (!value) stop(); enabled = value; },
    setSource(value) { if (source !== value) { stop(); source = value; } },
    setGamepad(value) {
      if (gamepad && (!value || gamepad.index !== value.index) && source === 'gamepad') stop();
      gamepad = value;
    },
    update(name, now) {
      if (!enabled || !source) return;
      if (eventUntil > now) return;
      eventUntil = 0;
      if (!name) { if (active) stop(); return; }
      if (active !== name || now >= nextPulse) emit(name, now, false);
    },
    trigger(name, now) { if (enabled && source) emit(name, now, true); },
    stop
  };
}
