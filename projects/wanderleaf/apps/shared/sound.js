// Cozy sound for the game: a soft music-box loop and small shop sounds, all made with Web Audio (no audio files).
// Starts silent; the app turns it on after the reader's first click (browsers only allow sound after one). WLSound.on says whether it is playing.
(function () {
  let ctx = null, master = null, fx = null, echo = null, timer = null, nextBar = 0, bar = 0;
  const BPM = 74, BEAT = 60 / BPM;
  // I – vi – IV – V in C, as MIDI notes (root, then the chord tones)
  const CHORDS = [[48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62]];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function setup () {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    // A soft echo makes the music box feel like it is playing in a small room
    echo = ctx.createDelay(1); echo.delayTime.value = BEAT * 0.75;
    const back = ctx.createGain(); back.gain.value = 0.28;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800;
    echo.connect(tone); tone.connect(back); back.connect(echo); tone.connect(master);
    master.connect(ctx.destination);
    fx = ctx.createGain(); fx.gain.value = 0.22; fx.connect(ctx.destination);
  }

  // One note with a gentle attack and a long fade; `out` is where it plays (music or shop sounds)
  function note (freq, t, len, { type = 'sine', vol = 0.2, attack = 0.01, cutoff = 2400, wet = 0, out = master } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f); f.connect(g); g.connect(out);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(echo); }
    o.start(t); o.stop(t + len + 0.05);
  }

  // One bar: a warm pad, a low root, and a music-box line picked from the chord (with a few rests)
  function playBar (t) {
    const [root, ...tones] = CHORDS[bar % CHORDS.length];
    tones.forEach((m) => { note(hz(m), t, BEAT * 4.2, { type: 'triangle', vol: 0.035, attack: 0.8, cutoff: 900 }); note(hz(m) * 1.004, t, BEAT * 4.2, { type: 'triangle', vol: 0.025, attack: 0.9, cutoff: 800 }); });
    note(hz(root), t, BEAT * 2, { vol: 0.09, attack: 0.04, cutoff: 500 });
    const line = tones.map((m) => m + 12).concat(tones[0] + 24);
    for (let i = 0; i < 8; i++) {
      if (i && Math.random() < 0.3) continue;
      const m = line[(i * 3 + bar) % line.length];
      const at = t + i * BEAT / 2 + (Math.random() - 0.5) * 0.015;
      note(hz(m), at, 1.4, { vol: 0.07, wet: 0.5 });
      note(hz(m) * 2, at, 0.5, { vol: 0.015 });   // a little shimmer, like a music box tine
    }
    bar++;
  }

  function tick () {
    while (nextBar < ctx.currentTime + 0.5) { playBar(nextBar); nextBar += BEAT * 4; }
  }

  const WLSound = {
    on: false,
    toggle (want = !WLSound.on) {
      if (!ctx) setup();
      ctx.resume();
      WLSound.on = want;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(want ? 0.9 : 0, now + (want ? 1.5 : 0.6));
      clearInterval(timer); timer = null;
      if (want) { nextBar = Math.max(nextBar, now + 0.1); timer = setInterval(tick, 120); tick(); }
      return want;
    },
    // A book sold: two bright coin notes
    coin () { if (!WLSound.on) return; const t = ctx.currentTime; note(1318.5, t, 0.25, { vol: 0.12, out: fx }); note(1760, t + 0.07, 0.4, { vol: 0.1, out: fx }); },
    // Someone left without a book: one low, soft note
    miss () { if (!WLSound.on) return; note(196, ctx.currentTime, 0.35, { type: 'triangle', vol: 0.1, cutoff: 700, out: fx }); },
    // Closing time: a small rising chime
    chime () { if (!WLSound.on) return; const t = ctx.currentTime; [72, 76, 79, 84].forEach((m, i) => note(hz(m), t + i * 0.12, 1.2, { vol: 0.09, out: fx })); },
  };
  window.WLSound = WLSound;
})();
