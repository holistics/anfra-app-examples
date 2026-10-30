// The Ask AI cat (19 Oct, Nhi): asleep, curled up above the greeting, redrawn from her reference (black line, white body,
// grey blush). Each part is its own group so it can move on its own (css/ask.css): asleep it breathes and lets out z's;
// hovered or focused, its head lifts, one eye opens, the tail flicks and a bubble says hi. A click makes ₫ notes and coins
// rain over the page. viewBox units; the head pivots at the neck.
// OG.cat.markup() → the button; OG.cat.bind(el) wires it. Colours: the --mascot-* tokens (ds/tokens.css).
(() => {
  // the tail is drawn from points so its tip can flick on its own while the root stays tucked into the body: each point is
  // [x, y, how much it follows the flick] (0 = fixed, 1 = the whole turn about the pivot)
  const TAIL = [[139, 77, 0], [128, 91, 0], [112, 98, 0.1], [96, 98, 0.3], [88, 97, 0.5], [80, 92, 0.8], [75, 91, 1], [70, 90, 1], [67, 95, 1], [69, 100, 1], [72, 106, 0.8], [80, 111, 0.4], [88, 114, 0]];
  const PIVOT = [96, 108];
  const f1 = (n) => Math.round(n * 10) / 10;
  function tail(deg) {
    const p = TAIL.map(([x, y, w]) => {
      const a = (deg * w * Math.PI) / 180, dx = x - PIVOT[0], dy = y - PIVOT[1];
      return `${f1(PIVOT[0] + dx * Math.cos(a) - dy * Math.sin(a))},${f1(PIVOT[1] + dx * Math.sin(a) + dy * Math.cos(a))}`;
    });
    const line = `M${p[0]} C${p[1]} ${p[2]} ${p[3]} C${p[4]} ${p[5]} ${p[6]} C${p[7]} ${p[8]} ${p[9]} C${p[10]} ${p[11]} ${p[12]}`;
    return { line, fill: `${line} C100,117 120,115 140,104 Z` };
  }
  // the head is drawn upright around (0, 0) and tilted onto the body as a whole: round and chubby, the cheeks wider than the
  // brow, soft ears, the eyes low and wide apart
  const CAT = `<svg class="ask-cat-svg" viewBox="0 -16 170 136" aria-hidden="true">
      <g class="c-z"><text x="78" y="2">z</text><text x="90" y="-6">z</text><text x="103" y="-13">z</text></g>
      <g class="c-torso">
        <path class="ln" d="M60,60 L70,12 C85,4 110,2 126,7 C148,15 163,38 164,62 C165,88 150,108 120,116 C108,119 96,118 88,114 C82,111 77,108 73,103 Z"/>
        <path class="ln no-fill" d="M119,50 C108,52 100,62 99,72 C98,80 101,85 104,87 C98,87 92,89 88,93"/>
        <g class="c-tail"><path class="fill" d="${tail(0).fill}"/><path class="ln no-fill" d="${tail(0).line}"/></g>
        <path class="ln no-fill" d="M147,102 C139,109 130,114 120,116 C108,119 96,118 88,114"/>
        <g class="c-paw">
          <path class="fill" d="M38,96 C38,104 44,111 52,113 C60,115 68,113 72,108 L70,96 Z"/>
          <path class="ln no-fill" d="M38,96 C38,104 44,111 52,113 C60,115 68,113 72,108"/>
        </g>
      </g>
      <g class="c-head"><g transform="translate(51 59) rotate(-22)">
        <path class="ln" d="M-36,-21 C-41,-33 -40,-44 -34.5,-47 C-29.5,-49.5 -21,-44 -14,-37.5 C-5,-40 5,-40 14,-37.5 C21,-44 29.5,-49.5 34.5,-47 C40,-44 41,-33 36,-21 C45,-13 50.5,-1 49.5,12 C48,29 27,37.5 0,37.5 C-27,37.5 -48,29 -49.5,12 C-50.5,-1 -45,-13 -36,-21 Z"/>
        <ellipse class="c-blush" cx="-30" cy="15" rx="8" ry="4.8"/>
        <ellipse class="c-blush" cx="30" cy="15" rx="8" ry="4.8"/>
        <path class="ln no-fill c-eye-l" d="M-23,4 Q-17,9.5 -11,4"/>
        <g class="c-eye-r"><path class="ln no-fill shut" d="M11,4 Q17,9.5 23,4"/>
          <g class="open"><ellipse class="pupil" cx="17" cy="5" rx="4.4" ry="5.2"/><circle class="glint" cx="18.6" cy="3" r="1.5"/></g></g>
        <path class="nose" d="M-3.2,10.5 Q0,9 3.2,10.5 Q2.6,13.6 0,14 Q-2.6,13.6 -3.2,10.5 Z"/>
        <path class="ln no-fill thin" d="M0,14 C0,17.5 -2,19.5 -5,19"/>
        <path class="ln no-fill thin" d="M0,14 C0,17.5 2,19.5 5,19"/>
      </g></g>
    </svg>`;
  const SAYS = ["What's up?", 'Mrrp?', 'Need a hand?'];
  const RAIN_SAYS = ['Make it rain!', 'Cha-ching!', 'Payday vibes'];

  const markup = () => `<button type="button" class="ask-cat" id="ask-cat" aria-label="A cat asleep. Hover to wake it, click to make it rain."><span class="ask-cat-say" id="ask-cat-say" aria-hidden="true">${SAYS[0]}</span>${CAT}</button>`;

  function bind(el) {
    if (!el) return;
    const say = el.querySelector('.ask-cat-say');
    let says = 0, rains = 0;
    const line = (t) => { say.classList.remove('pop'); void say.offsetWidth; say.textContent = t; say.classList.add('pop'); };
    // wakes on hover or focus (a new line each time after the first) and dozes off again on leave or blur
    // the tail's tip swishes twice, damped (1s); the root never moves, so the line stays joined to the body
    const tl = el.querySelectorAll('.c-tail path');
    let raf = 0;
    const flick = () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const step = (t) => {
        const u = Math.min(1, (t - t0) / 1000), d = tail(14 * Math.sin(u * Math.PI * 4) * (1 - u));
        tl[0].setAttribute('d', d.fill); tl[1].setAttribute('d', d.line);
        if (u < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const wake = () => { if (el.classList.contains('awake')) return; say.classList.remove('pop'); say.textContent = SAYS[says++ % SAYS.length]; el.classList.add('awake'); flick(); };
    const doze = () => el.classList.remove('awake');
    el.addEventListener('mouseenter', wake); el.addEventListener('focus', wake);
    // the pointer leaving puts it back to sleep unless the keyboard is on it; losing focus does unless the pointer still is
    // (:hover isn't updated yet inside mouseleave, so each handler checks only the other input)
    el.addEventListener('mouseleave', () => { if (!el.matches(':focus-visible')) doze(); });
    el.addEventListener('blur', () => { if (!el.matches(':hover')) doze(); });
    el.addEventListener('click', () => { wake(); line(RAIN_SAYS[rains++ % RAIN_SAYS.length]); rain(el); });
  }

  // ----- money rain: ₫ notes and coins in the cat's line, falling across the whole page (or, with reduced motion, a few
  // fading in and out around the cat). Each piece removes itself; the overlay goes when it is empty.
  const NOTE = '<svg viewBox="0 0 42 24"><rect class="mr-note" x="1.5" y="1.5" width="39" height="21" rx="4"/><ellipse class="mr-ln" cx="21" cy="12" rx="7.5" ry="5.5"/><text x="21" y="15.5">₫</text></svg>';
  const COIN = '<svg viewBox="0 0 24 24"><circle class="mr-coin" cx="12" cy="12" r="10.5"/><circle class="mr-ln" cx="12" cy="12" r="7"/><text x="12" y="15.8">₫</text></svg>';
  const MAX = 60;
  function rain(cat) {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let box = document.querySelector('.money-rain');
    if (!box) { box = document.createElement('div'); box.className = 'money-rain'; box.setAttribute('aria-hidden', 'true'); document.body.append(box); }
    const room = Math.max(0, MAX - box.children.length), n = Math.min(calm ? 8 : 30, room);
    const c = cat.getBoundingClientRect(), rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span'), coin = Math.random() < 0.45, d = rnd(1.6, 2.8), delay = rnd(0, 0.6);
      p.className = `mr-p${coin ? ' coin' : ''}${calm ? ' calm' : ''}`;
      p.innerHTML = `<i>${coin ? COIN : NOTE}</i>`;
      const s = p.style;
      if (calm) { s.left = `${c.left + rnd(-60, c.width + 60)}px`; s.top = `${c.top + rnd(-30, c.height + 10)}px`; s.setProperty('--delay', `${i * 0.06}s`); }
      else {
        s.left = `${rnd(0, 100)}vw`;
        s.setProperty('--d', `${d}s`); s.setProperty('--delay', `${delay}s`); s.setProperty('--r', `${rnd(-300, 300)}deg`);
        s.setProperty('--s', `${rnd(8, 26)}px`); s.setProperty('--k', rnd(0.8, 1.2).toFixed(2));
      }
      box.append(p);
      setTimeout(() => { p.remove(); if (!box.children.length) box.remove(); }, ((calm ? 1.6 : d + delay) + 0.15) * 1000);
    }
  }

  window.OG = Object.assign(window.OG || {}, { cat: { markup, bind, rain, tail, SAYS, RAIN_SAYS } });
})();
