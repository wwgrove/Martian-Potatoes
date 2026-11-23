export function setupMusic(audio, buttons, eventTarget, status) {
  buttons = Array.from(buttons);
  let enabled = true, blocked = false, failed = false, request = 0;
  audio.volume = 0.35;

  function updateButtons() {
    const text = failed ? 'MUSIC: ERROR' : !enabled ? 'MUSIC: OFF' : blocked ? 'MUSIC: START' : 'MUSIC: ON';
    const label = failed ? 'Music unavailable' : !enabled || blocked ? 'Play music' : 'Mute music';
    buttons.forEach(button => {
      button.textContent = button.dataset.musicToggle === 'icon' ? (failed ? '!' : '♫') : text;
      button.disabled = failed;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(enabled && !blocked && !failed));
    });
  }

  function reportFailure(error) {
    if (failed) return;
    failed = true;
    console.error('Unable to play background music:', error);
    status.textContent = 'Music could not load. Open the app through a web server and check browser audio support.';
    status.hidden = false;
    updateButtons();
  }

  function play() {
    if (!enabled || failed || !audio.paused) return;
    const current = ++request;
    audio.play().then(() => {
      if (current !== request) return;
      blocked = false;
      updateButtons();
    }, error => {
      if (current !== request || !enabled) return;
      if (error.name === 'NotAllowedError') {
        blocked = true;
        updateButtons();
      } else {
        reportFailure(error);
      }
    });
  }

  audio.addEventListener('error', () => reportFailure(audio.error));
  buttons.forEach(button => button.addEventListener('click', () => {
    if (enabled && !blocked) {
      enabled = false;
      request++;
      audio.pause();
    } else {
      enabled = true;
      play();
    }
    updateButtons();
  }));
  const resumeOnInteraction = event => {
    if (buttons.some(button => button === event.target)) return;
    play();
  };
  eventTarget.addEventListener('pointerdown', resumeOnInteraction, true);
  eventTarget.addEventListener('keydown', resumeOnInteraction, true);
  updateButtons();
  play();
}
