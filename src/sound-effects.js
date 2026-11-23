const effects = {
  drill: { file: 'Auger-Drill-Sound.mp3', start: 0.65, end: 2.85, volume: 1 },
  attach: { file: 'Connecting-Tool-To-Body.mp3', start: 2.3, end: 2.65, volume: 1 },
  pickup: { file: 'Pick-Up-Potato-Sound.mp3', start: 2.1, end: 2.4, volume: 1 },
  plow: { file: 'Plow-Noise.mp3', start: 0.35, end: 1.9, volume: 0.7 },
  harvest: { file: 'Sifter.mp3', start: 0.08, end: 1.1, volume: 1 },
  water: { file: 'Watering-Noise.mp3', start: 0.05, end: 4.4, volume: 1.2 }
};

export function createSoundEffects(createContext, fetchAudio, reportError, now = () => performance.now()) {
  let context = null, enabled = true, contextFailed = false, resumePending = false, generation = 0;
  const buffers = new Map(), loops = new Map(), playing = new Map();
  function load(name) {
    if (!buffers.has(name)) {
      const effect = effects[name];
      buffers.set(name, fetchAudio(`./assets/soundeffects/${effect.file}`)
        .then(response => {
          if (!response.ok) throw new Error(`Could not load ${effect.file}: HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then(data => context.decodeAudioData(data))
        .catch(error => { reportError(error); return null; }));
    }
    return buffers.get(name);
  }
  function unlock() {
    if (!enabled || contextFailed) return;
    if (!context) {
      try { context = createContext(); }
      catch (error) { contextFailed = true; reportError(error); return; }
      for (const name of Object.keys(effects)) load(name);
    }
    if (context.state !== 'running' && context.state !== 'closed' && !resumePending) {
      resumePending = true;
      context.resume().then(() => { resumePending = false; }, error => { resumePending = false; reportError(error); });
    }
  }
  function stopSource(source) {
    if (!source) return;
    const gain = playing.get(source);
    playing.delete(source);
    source.onended = null;
    source.stop();
    source.disconnect();
    gain.disconnect();
  }
  function start(name, buffer, loop) {
    const effect = effects[name], source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.loopStart = effect.start;
    source.loopEnd = effect.end;
    gain.gain.value = effect.volume;
    source.connect(gain); gain.connect(context.destination);
    playing.set(source, gain);
    source.onended = () => { playing.delete(source); source.disconnect(); gain.disconnect(); };
    if (loop) source.start(0, effect.start);
    else source.start(0, effect.start, effect.end - effect.start);
    return source;
  }
  function stopAll() {
    generation++;
    loops.clear();
    for (const source of [...playing.keys()]) stopSource(source);
  }
  function startLoop(channel, entry) {
    if (entry.pending || entry.source || entry.failed || context.state !== 'running') return;
    entry.pending = true;
    load(entry.name).then(buffer => {
      entry.pending = false;
      if (!buffer) entry.failed = true;
      if (buffer && enabled && context.state === 'running' && loops.get(channel) === entry) entry.source = start(entry.name, buffer, true);
    });
  }
  return {
    unlock,
    setEnabled(value) { enabled = value; if (!enabled) stopAll(); },
    setLoop(channel, name) {
      const previous = loops.get(channel);
      if (previous?.name === name) { startLoop(channel, previous); return; }
      if (!previous && !name) return;
      if (previous) { loops.delete(channel); stopSource(previous.source); }
      if (!name || !enabled) return;
      if (!effects[name]) throw new RangeError(`Unknown sound effect: ${name}`);
      unlock();
      if (!context) return;
      const entry = { name, source: null, pending: false };
      loops.set(channel, entry);
      startLoop(channel, entry);
    },
    play(name) {
      if (!enabled) return;
      if (!effects[name]) throw new RangeError(`Unknown sound effect: ${name}`);
      unlock();
      if (!context || context.state !== 'running') return;
      const current = generation, requestedAt = now();
      load(name).then(buffer => {
        if (buffer && enabled && context.state === 'running' && generation === current && now() - requestedAt < 1000) start(name, buffer, false);
      });
    },
    stopAll
  };
}
