const effects = {
  tiller: { file: 'YTDown.com_YouTube_Media_gK0WqCwn5W0_Plow-Dragging-Soil-Sound-Effect_001_1080p.mp3', start: 0, end: 1.3, volume: 0.6 },
  drill: { file: 'Auger-Drill-Sound.mp3', start: 0.65, end: 2.85, volume: 0.7 },
  attach: { file: 'Connecting-Tool-To-Body.mp3', start: 2.3, end: 2.65, volume: 0.45 },
  pickup: { file: 'Pick-Up-Potato-Sound.mp3', start: 2.1, end: 2.4, volume: 0.5 },
  plow: { file: 'Plow-Noise.mp3', start: 0.35, end: 1.9, volume: 0.23 },
  harvest: { file: 'Sifter.mp3', start: 0.08, end: 1.1, volume: 0.65 },
  water: { file: 'Watering-Noise.mp3', start: 0.05, end: 4.4, volume: 1.2 }
};

export const SOUND_VOLUME_KEY = 'martian-potatoes-sound-volumes-v1';

function validateVolumes(volumes) {
  if (!volumes || typeof volumes !== 'object' || Array.isArray(volumes) ||
      Object.keys(volumes).length !== Object.keys(effects).length ||
      Object.keys(effects).some(name => !Number.isFinite(volumes[name]) || volumes[name] < 0 || volumes[name] > 2)) {
    throw new Error('Saved sound levels are invalid.');
  }
}

export function loadSoundVolumes(storage) {
  const raw = storage.getItem(SOUND_VOLUME_KEY);
  if (raw === null) return null;
  const volumes = JSON.parse(raw);
  validateVolumes(volumes);
  return volumes;
}

export function saveSoundVolumes(storage, volumes) {
  validateVolumes(volumes);
  storage.setItem(SOUND_VOLUME_KEY, JSON.stringify(volumes));
}

export function createSoundEffects(createContext, fetchAudio, reportError, now = () => performance.now()) {
  let context = null, enabled = true, contextFailed = false, generation = 0, resumeRequest = 0;
  const volumes = Object.fromEntries(Object.entries(effects).map(([name, effect]) => [name, effect.volume]));
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
    if (context.state !== 'running' && context.state !== 'closed') {
      const request = ++resumeRequest;
      context.resume().then(() => {
        for (const [channel, entry] of loops) startLoop(channel, entry);
      }, error => { if (request === resumeRequest && context.state !== 'running') reportError(error); });
    }
  }
  function stopSource(source) {
    if (!source) return;
    const { gain } = playing.get(source);
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
    gain.gain.value = volumes[name];
    source.connect(gain); gain.connect(context.destination);
    playing.set(source, { name, gain });
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
    getVolumes() { return { ...volumes }; },
    setVolume(name, value) {
      if (!effects[name]) throw new RangeError(`Unknown sound effect: ${name}`);
      if (!Number.isFinite(value) || value < 0 || value > 2) throw new RangeError('Sound volume must be between 0 and 2.');
      volumes[name] = value;
      for (const entry of playing.values()) {
        if (entry.name === name) entry.gain.gain.value = value;
      }
    },
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
