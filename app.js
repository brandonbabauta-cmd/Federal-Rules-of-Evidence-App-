// =====================================================================
// app.js — the quiz engine and screens.
//   1. Generators   — invent fresh questions (new key every time)
//   2. Progress     — saves scores in the browser
//   3. Sessions     — builds a set of questions
//   4. Screens      — home, quiz, results
// =====================================================================

// ---------------------------------------------------------------------
// 1. GENERATORS — each returns one question object
// ---------------------------------------------------------------------
const keyLabel = (tonic, mode) => `${tonic} ${mode}`;

// Build 4 unique choices: the answer + distractors (topped up from a backup pool)
function makeChoices(answer, distractors, backup = []) {
  const pool = uniq(distractors.filter(d => d !== answer));
  const extra = shuffle(uniq(backup.filter(d => d !== answer && !pool.includes(d))));
  return shuffle([answer, ...pool.slice(0, 3), ...extra].slice(0, 4));
}

function genNoteName() {
  const clef = pick(['treble', 'treble', 'bass', 'bass', 'alto']);
  const dn = CLEFS[clef].base + Math.floor(Math.random() * 13) - 2; // 2 ledger lines below → 1 above
  const letter = LETTERS[dn % 7];
  return {
    unit: 1, tag: 'pitch-on-staff', type: 'mc', fixedOrder: true,
    prompt: `Name this note in <b>${clef}</b> clef.`,
    svg: staffSVG({ clef, note: { dn } }),
    choices: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], answer: letter,
    explain: clef === 'treble' ? 'Treble lines: E G B D F ("Every Good Boy Does Fine"); spaces: F A C E.'
      : clef === 'bass' ? 'Bass lines: G B D F A ("Good Boys Do Fine Always"); spaces: A C E G ("All Cows Eat Grass").'
      : 'Alto lines: F A C E G — the middle line is middle C.',
    play: { name: letter, octave: Math.floor(dn / 7) },
  };
}

function genOctave() {
  const clef = pick(['treble', 'bass']);
  const dn = CLEFS[clef].base + Math.floor(Math.random() * 13) - 2;
  const letter = LETTERS[dn % 7], oct = Math.floor(dn / 7);
  const answer = letter + oct;
  const neighbor = LETTERS[(dn + 1) % 7] + Math.floor((dn + 1) / 7);
  return {
    unit: 1, tag: 'octaves', type: 'mc',
    prompt: `Name this note <b>with its octave number</b> (${clef} clef).`,
    svg: staffSVG({ clef, note: { dn } }),
    choices: makeChoices(answer, [letter + (oct + 1), letter + (oct - 1), neighbor]),
    answer,
    explain: 'Middle C = C4. Octave numbers go up at every C (B3 → C4).',
    play: { name: letter, octave: oct },
  };
}

function genKeyFromSig(mode) {
  const keys = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  const k = pick(keys);
  const clef = pick(['treble', 'bass']);
  const answer = keyLabel(k.tonic, mode);
  const near = keys.filter(o => o !== k && Math.abs(o.sig - k.sig) <= 2).map(o => keyLabel(o.tonic, mode));
  const other = mode === 'major' ? relativeMinorOf(k.tonic) + ' major' : relativeMajorOf(k.tonic) + ' minor';
  return {
    unit: mode === 'major' ? 5 : 6, tag: 'key-signatures', type: 'mc',
    prompt: `Name the <b>${mode}</b> key with this key signature.`,
    svg: staffSVG({ clef, sig: k.sig }),
    choices: makeChoices(answer, shuffle([...near, other]), keys.map(o => keyLabel(o.tonic, mode))),
    answer,
    explain: `${sigText(k.sig)}${k.sig ? ' (' + sigAccidentals(k.sig).join(' ') + ')' : ''} = ${answer}` +
      (mode === 'major' ? `, relative of ${relativeMinorOf(k.tonic)} minor.` : `, relative of ${relativeMajorOf(k.tonic)} major.`),
  };
}

function genSigForKey(mode) {
  const keys = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  const k = pick(keys);
  const answer = sigText(k.sig);
  const near = [k.sig + 1, k.sig - 1, -k.sig, k.sig + 3, k.sig - 3].filter(s => s >= -7 && s <= 7).map(sigText);
  return {
    unit: mode === 'major' ? 5 : 6, tag: 'key-signatures', type: 'mc',
    prompt: `What is the key signature of <b>${keyLabel(k.tonic, mode)}</b>?`,
    choices: makeChoices(answer, shuffle(near)),
    answer,
    explain: `${keyLabel(k.tonic, mode)}: ${answer}${k.sig ? ' — ' + sigAccidentals(k.sig).join(' ') : ''}.`,
  };
}

function genDegree(mode) {
  const keys = (mode === 'major' ? MAJOR_KEYS : MINOR_KEYS).filter(k => Math.abs(k.sig) <= 6);
  const k = pick(keys);
  const natural = spellScale(k.tonic, mode === 'major' ? 'major' : 'natural minor');
  let idx = 1 + Math.floor(Math.random() * 6); // degrees 2–7
  let names = mode === 'major' ? DEGREE_NAMES_MAJOR : DEGREE_NAMES_MINOR;
  let answer = natural[idx], name = names[idx], note = '';
  if (mode === 'minor' && idx === 6 && Math.random() < 0.5) {
    answer = spellScale(k.tonic, 'harmonic minor')[6];
    name = 'leading tone';
    note = ' In minor, the leading tone is the RAISED 7th (from harmonic minor).';
  }
  const askNumber = Math.random() < 0.3;
  if (askNumber) {
    return {
      unit: mode === 'major' ? 5 : 6, tag: 'scale-degrees', type: 'mc', fixedOrder: true,
      prompt: `In ${keyLabel(k.tonic, mode)}, the <b>${name}</b> is scale degree…`,
      choices: ['1', '2', '3', '4', '5', '6', '7'], answer: String(idx + 1),
      explain: `${name} = degree ${idx + 1}. (${natural.slice(0, 7).join(' ')})`,
    };
  }
  const distract = [...natural.slice(0, 7), mode === 'minor' && idx === 6 ? spellScale(k.tonic, 'harmonic minor')[6] : null].filter(Boolean);
  return {
    unit: mode === 'major' ? 5 : 6, tag: 'scale-degrees', type: 'mc',
    prompt: `In <b>${keyLabel(k.tonic, mode)}</b>, the ${name} is…`,
    choices: makeChoices(answer, shuffle(distract)),
    answer,
    explain: `${keyLabel(k.tonic, mode)}: ${natural.slice(0, 7).join(' ')}. The ${name} = ${answer}.${note}`,
  };
}

function genSpellScale(type) {
  const isMajor = type === 'major';
  const keys = (isMajor ? MAJOR_KEYS : MINOR_KEYS).filter(k => {
    const s = spellScale(k.tonic, type);
    return s.every(n => !n.includes('♯♯') && !n.includes('♭♭'));
  });
  const k = pick(keys);
  const answer = spellScale(k.tonic, type);
  const hint = {
    'major': 'W W H W W W H',
    'natural minor': 'Same notes as the relative major (W H W W H W W).',
    'harmonic minor': 'Natural minor with a raised 7th.',
    'melodic minor': 'Ascending: natural minor with raised 6th and 7th.',
  }[type];
  return {
    unit: isMajor ? 5 : 6, tag: isMajor ? 'major-scales' : 'minor-scales', type: 'scale',
    prompt: `Spell the <b>${k.tonic} ${type}</b> scale, ascending${type === 'melodic minor' ? ' (ascending form)' : ''}.`,
    answer,
    explain: `${k.tonic} ${type}: ${answer.join(' ')}. ${hint}`,
  };
}

function genRelative() {
  if (Math.random() < 0.5) {
    const k = pick(MAJOR_KEYS);
    const answer = relativeMinorOf(k.tonic) + ' minor';
    return {
      unit: 6, tag: 'relative-parallel', type: 'mc',
      prompt: `What is the <b>relative minor</b> of ${k.tonic} major?`,
      choices: makeChoices(answer, [k.tonic + ' minor', ...MINOR_KEYS.filter(m => Math.abs(m.sig - k.sig) === 1).map(m => m.tonic + ' minor')], MINOR_KEYS.map(m => m.tonic + ' minor')),
      answer,
      explain: `Down a minor 3rd from ${k.tonic} (degree 6). Both have ${sigText(k.sig)}.`,
    };
  }
  const k = pick(MINOR_KEYS);
  const answer = relativeMajorOf(k.tonic) + ' major';
  return {
    unit: 6, tag: 'relative-parallel', type: 'mc',
    prompt: `What is the <b>relative major</b> of ${k.tonic} minor?`,
    choices: makeChoices(answer, [k.tonic + ' major', ...MAJOR_KEYS.filter(m => Math.abs(m.sig - k.sig) === 1).map(m => m.tonic + ' major')], MAJOR_KEYS.map(m => m.tonic + ' major')),
    answer,
    explain: `Up a minor 3rd from ${k.tonic}. Both have ${sigText(k.sig)}.`,
  };
}

function genParallel() {
  const k = pick(MAJOR_KEYS.filter(m => MINOR_KEYS.some(n => n.tonic === m.tonic)));
  const minor = MINOR_KEYS.find(n => n.tonic === k.tonic);
  const answer = sigText(minor.sig);
  return {
    unit: 6, tag: 'relative-parallel', type: 'mc',
    prompt: `${k.tonic} major has ${sigText(k.sig)}. What key signature does its <b>parallel minor</b> (${k.tonic} minor) have?`,
    choices: makeChoices(answer, [sigText(k.sig), ...[minor.sig + 1, minor.sig - 1, k.sig + 3].filter(s => s >= -7 && s <= 7).map(sigText)]),
    answer,
    explain: `Parallel = same tonic. Major → minor moves 3 steps to the flat side: ${sigText(k.sig)} → ${answer}.`,
  };
}

function genCircle() {
  const cw = Math.random() < 0.5;
  const k = pick(MAJOR_KEYS.filter(m => (cw ? m.sig < 7 : m.sig > -7) && m.tonic !== 'C♭' && m.tonic !== 'C♯'));
  const target = MAJOR_KEYS.find(m => m.sig === k.sig + (cw ? 1 : -1));
  const opposite = MAJOR_KEYS.find(m => m.sig === k.sig + (cw ? -1 : 1));
  const answer = target.tonic + ' major';
  return {
    unit: 7, tag: 'circle-of-fifths', type: 'mc',
    prompt: `On the circle of fifths, one step <b>${cw ? 'clockwise' : 'counter-clockwise'}</b> from ${k.tonic} major is…`,
    choices: makeChoices(answer, [opposite ? opposite.tonic + ' major' : null, relativeMinorOf(k.tonic) + ' minor', k.tonic + ' minor'].filter(Boolean), MAJOR_KEYS.map(m => m.tonic + ' major')),
    answer,
    explain: `${cw ? 'Clockwise = up a 5th, one more sharp / one less flat' : 'Counter-clockwise = down a 5th, one more flat / one less sharp'}: ${sigText(k.sig)} → ${sigText(target.sig)}.`,
  };
}

function genCloselyRelated() {
  const k = pick(MAJOR_KEYS.filter(m => Math.abs(m.sig) <= 5));
  const rel = s => [MAJOR_KEYS.find(m => m.sig === s).tonic + ' major', MINOR_KEYS.find(m => m.sig === s).tonic + ' minor'];
  const close = [relativeMinorOf(k.tonic) + ' minor', ...rel(k.sig + 1), ...rel(k.sig - 1)];
  const far = [k.tonic + ' minor', ...rel(k.sig + 2), ...rel(k.sig - 2)].filter(x => !close.includes(x));
  const answer = pick(close);
  return {
    unit: 7, tag: 'closely-related', type: 'mc',
    prompt: `Which key is <b>closely related</b> to ${k.tonic} major?`,
    choices: makeChoices(answer, shuffle(far)),
    answer,
    explain: `${k.tonic} major's 5 closely related keys: ${close.join(', ')} (each within one accidental).`,
  };
}

// Which generators each unit uses (listed more than once = shows up more often)
const GENERATORS = {
  1: [genNoteName, genNoteName, genOctave],
  5: [() => genKeyFromSig('major'), () => genSigForKey('major'), () => genDegree('major'), () => genSpellScale('major')],
  6: [() => genKeyFromSig('minor'), () => genSigForKey('minor'), () => genDegree('minor'), genRelative, genParallel,
      () => genSpellScale(pick(['natural minor', 'harmonic minor', 'melodic minor']))],
  7: [genCircle, genCircle, genCloselyRelated],
};
const SCALE_LAB = () => genSpellScale(pick(['major', 'major', 'natural minor', 'harmonic minor', 'melodic minor']));

// ---------------------------------------------------------------------
// 2. PROGRESS — saved in this browser (localStorage)
// ---------------------------------------------------------------------
const STORE_KEY = 'mt-midterm-progress-v1';
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { units: {}, tags: {} }; }
  catch (e) { return { units: {}, tags: {} }; }
}
let progress = loadProgress();
function saveProgress() { try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) {} }
function recordAnswer(q, isRight) {
  const u = progress.units[q.unit] = progress.units[q.unit] || { seen: 0, right: 0 };
  u.seen++; if (isRight) u.right++;
  const t = progress.tags[q.tag] = progress.tags[q.tag] || { seen: 0, right: 0, unit: q.unit };
  t.seen++; if (isRight) t.right++;
  saveProgress();
}
const pct = (r, s) => (s ? Math.round((100 * r) / s) : 0);

// ---------------------------------------------------------------------
// 3. SESSIONS — a set of questions to click through
// ---------------------------------------------------------------------
let session = null;

function buildQuestions(unitId, count) {
  const written = shuffle(WRITTEN.filter(q => q.unit === unitId));
  const gens = GENERATORS[unitId] || [];
  const out = [];
  const nGen = gens.length ? Math.ceil(count / 2) : 0;
  for (let i = 0; i < nGen; i++) out.push(pick(gens)());
  out.push(...written.slice(0, count - out.length));
  while (out.length < count && gens.length) out.push(pick(gens)());
  return shuffle(out);
}

function startSession(kind, value) {
  let questions, title;
  if (kind === 'unit') {
    const u = UNITS.find(x => x.id === value);
    title = u.name;
    questions = buildQuestions(value, 10);
  } else if (kind === 'mock') {
    title = 'Mock Midterm';
    questions = shuffle(UNITS.flatMap(u => buildQuestions(u.id, 3))).slice(0, 20);
  } else if (kind === 'scales') {
    title = 'Scale Lab';
    questions = Array.from({ length: 8 }, SCALE_LAB);
  } else if (kind === 'tag') {
    title = 'Weak spot: ' + tagLabel(value);
    const unitId = progress.tags[value].unit;
    const pool = WRITTEN.filter(q => q.tag === value);
    questions = [];
    for (let i = 0; i < 40 && questions.length < 8; i++) {
      const g = (GENERATORS[unitId] || []).length ? pick(GENERATORS[unitId])() : null;
      if (g && g.tag === value) questions.push(g);
    }
    questions = shuffle([...questions, ...shuffle(pool)]).slice(0, 8);
    if (!questions.length) questions = buildQuestions(unitId, 8);
  } else if (kind === 'retry') {
    title = session.title + ' — retry misses';
    questions = value;
  }
  session = {
    kind, value, title,
    items: questions.map(q => ({ q, choices: q.type === 'mc' ? (q.fixedOrder ? q.choices : shuffle(q.choices)) : null,
      response: q.type === 'scale' ? Array(q.answer.length).fill(null) : q.type === 'order' ? [] : null,
      order: q.type === 'order' ? shuffle(q.items) : null, done: false, right: false, active: 0 })),
    idx: 0,
  };
  renderQuiz();
}

// ---------------------------------------------------------------------
// 4. SCREENS
// ---------------------------------------------------------------------
const app = document.getElementById('app');
const tagLabel = t => t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function soundButton() {
  return `<button class="icon-btn" id="sound-btn" title="Sound on/off">${soundOn ? '🔊' : '🔇'}</button>`;
}
function wireSound() {
  const b = document.getElementById('sound-btn');
  if (b) b.onclick = () => { soundOn = !soundOn; b.textContent = soundOn ? '🔊' : '🔇'; };
}

// ---------- HOME ----------
function renderHome() {
  const totals = Object.values(progress.units).reduce((a, u) => ({ seen: a.seen + u.seen, right: a.right + u.right }), { seen: 0, right: 0 });
  const overall = pct(totals.right, totals.seen);
  const weak = Object.entries(progress.tags)
    .filter(([, t]) => t.seen >= 3)
    .sort((a, b) => a[1].right / a[1].seen - b[1].right / b[1].seen)
    .slice(0, 3);

  app.innerHTML = `
    <header class="hero">
      <div class="hero-staff" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="floating-notes" aria-hidden="true"><i>♪</i><i>♫</i><i>♩</i><i>♬</i><i>♪</i><i>♫</i></div>
      <div class="hero-top">${soundButton()}</div>
      <p class="eyebrow">Music Theory · Midterm Prep</p>
      <h1>Elizabeth's Practice Room</h1>
      <p class="sub">Pick a unit, work through the questions, and watch your trackers fill up.</p>
      <div class="stats">
        <div class="ring" style="--p:${overall}"><span>${overall}%</span><small>accuracy</small></div>
        <div class="stat"><b>${totals.seen}</b><small>questions answered</small></div>
        <div class="stat"><b>${Object.keys(progress.units).length}/7</b><small>units started</small></div>
      </div>
    </header>

    <main class="home">
      ${weak.length ? `
      <section class="weak">
        <h2>Weak spots</h2>
        <div class="weak-list">
          ${weak.map(([tag, t]) => `<button class="weak-chip" data-tag="${tag}">${tagLabel(tag)} <span>${pct(t.right, t.seen)}%</span></button>`).join('')}
        </div>
      </section>` : ''}

      <h2>Units</h2>
      <div class="grid">
        ${UNITS.map(u => {
          const p = progress.units[u.id] || { seen: 0, right: 0 };
          const a = pct(p.right, p.seen);
          return `
          <button class="card" data-unit="${u.id}">
            <span class="card-num">Unit ${u.id}</span>
            <span class="card-icon">${u.icon}</span>
            <span class="card-name">${u.name}</span>
            <span class="card-blurb">${u.blurb}</span>
            <span class="bar"><span style="width:${a}%"></span></span>
            <span class="card-meta">${p.seen ? `${a}% correct · ${p.seen} answered` : 'Not started'}</span>
          </button>`;
        }).join('')}
      </div>

      <h2>Challenge modes</h2>
      <div class="grid two">
        <button class="card special" data-mode="scales">
          <span class="card-icon">🎹</span>
          <span class="card-name">Scale Lab</span>
          <span class="card-blurb">Fill in major & minor scales note by note — hear each one as you build it.</span>
        </button>
        <button class="card special gold" data-mode="mock">
          <span class="card-icon">🎼</span>
          <span class="card-name">Mock Midterm</span>
          <span class="card-blurb">20 mixed questions from every unit. No hints until the end.</span>
        </button>
      </div>

      <footer class="foot">
        <button class="link-btn" id="reset-btn">Reset all progress</button>
      </footer>
    </main>`;

  app.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => startSession('unit', Number(b.dataset.unit)));
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => startSession(b.dataset.mode));
  app.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => startSession('tag', b.dataset.tag));
  document.getElementById('reset-btn').onclick = () => {
    if (confirm('Erase all scores and start fresh?')) { progress = { units: {}, tags: {} }; saveProgress(); renderHome(); }
  };
  wireSound();
  window.scrollTo(0, 0);
}

// ---------- QUIZ ----------
function renderQuiz() {
  const s = session, it = s.items[s.idx], q = it.q;
  const answered = s.items.filter(x => x.done).length;
  const right = s.items.filter(x => x.right).length;
  const isMock = s.kind === 'mock';

  app.innerHTML = `
    <div class="quiz">
      <div class="quiz-top">
        <button class="icon-btn" id="home-btn" title="Home">← Home</button>
        <h2>${s.title}</h2>
        ${soundButton()}
      </div>

      <div class="tracker">
        <div class="tracker-row">
          <span>Question <b>${s.idx + 1}</b> of ${s.items.length}</span>
          <span>${isMock ? `${answered} answered` : `Score: <b>${right}</b> / ${answered}`}</span>
        </div>
        <div class="dots">
          ${s.items.map((x, i) => `<button class="dot ${i === s.idx ? 'current' : ''} ${x.done ? (isMock ? 'answered' : x.right ? 'right' : 'wrong') : ''}" data-jump="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`).join('')}
        </div>
      </div>

      <article class="qcard">
        <span class="tag">Unit ${q.unit} · ${tagLabel(q.tag)}</span>
        <p class="prompt">${q.prompt}</p>
        ${q.svg ? `<div class="svg-wrap">${q.svg}${q.play ? '<button class="mini-btn" id="hear-btn">▶ Hear it</button>' : ''}</div>` : ''}
        <div id="answer-area"></div>
        <div id="feedback"></div>
      </article>

      <div class="nav">
        <button class="btn ghost" id="prev-btn" ${s.idx === 0 ? 'disabled' : ''}>‹ Previous</button>
        <button class="btn" id="next-btn">${s.idx === s.items.length - 1 ? 'Finish ✓' : 'Next ›'}</button>
      </div>
    </div>`;

  renderAnswerArea();
  if (it.done) showFeedback();

  document.getElementById('home-btn').onclick = renderHome;
  document.getElementById('prev-btn').onclick = () => { s.idx--; renderQuiz(); };
  document.getElementById('next-btn').onclick = () => {
    if (s.idx === s.items.length - 1) renderResults(); else { s.idx++; renderQuiz(); }
  };
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { s.idx = Number(b.dataset.jump); renderQuiz(); });
  const hear = document.getElementById('hear-btn');
  if (hear) hear.onclick = () => playNote(q.play.name, q.play.octave);
  wireSound();
}

function renderAnswerArea() {
  const it = session.items[session.idx], q = it.q;
  const area = document.getElementById('answer-area');

  if (q.type === 'mc') {
    area.innerHTML = `<div class="choices ${q.fixedOrder ? 'letters' : ''}">${it.choices.map(c => {
      let cls = '';
      if (it.done) cls = c === q.answer && session.kind !== 'mock' ? 'right' : c === it.response ? (session.kind === 'mock' ? 'picked' : 'wrong') : '';
      return `<button class="choice ${cls}" ${it.done ? 'disabled' : ''}>${c}</button>`;
    }).join('')}</div>`;
    area.querySelectorAll('.choice').forEach((b, i) => b.onclick = () => submit(it.choices[i]));
  }

  if (q.type === 'order') {
    const remaining = it.order.filter(x => !it.response.includes(x));
    area.innerHTML = `
      <p class="hint">Tap them in order. Tap a placed item to send it back.</p>
      <div class="order-slots">${it.response.map((x, i) => {
        const cls = it.done && session.kind !== 'mock' ? (q.items[i] === x ? 'right' : 'wrong') : '';
        return `<button class="chip placed ${cls}" data-i="${i}" ${it.done ? 'disabled' : ''}><small>${i + 1}</small>${x}</button>`;
      }).join('') || '<span class="empty">Your order appears here…</span>'}</div>
      <div class="order-pool">${remaining.map(x => `<button class="chip" ${it.done ? 'disabled' : ''}>${x}</button>`).join('')}</div>
      ${!it.done ? `<button class="btn check" id="check-btn" ${remaining.length ? 'disabled' : ''}>Check order</button>` : ''}`;
    area.querySelectorAll('.order-pool .chip').forEach((b, i) => b.onclick = () => { it.response.push(remaining[i]); renderAnswerArea(); });
    area.querySelectorAll('.placed').forEach(b => b.onclick = () => { it.response.splice(Number(b.dataset.i), 1); renderAnswerArea(); });
    const c = document.getElementById('check-btn');
    if (c) c.onclick = () => submit(it.response);
  }

  if (q.type === 'scale') {
    area.innerHTML = `
      <div class="slots">${it.response.map((n, i) => {
        let cls = i === it.active && !it.done ? 'active' : '';
        if (it.done && session.kind !== 'mock') cls = n === q.answer[i] ? 'right' : 'wrong';
        return `<button class="slot ${cls}" data-i="${i}" ${it.done ? 'disabled' : ''}><small>${i + 1}</small><span>${n || ''}</span></button>`;
      }).join('')}</div>
      ${!it.done ? `
      <div class="keypad">
        <div class="letters-row">${LETTERS.map(l => `<button class="key" data-l="${l}">${l}</button>`).join('')}</div>
        <div class="acc-row">
          <button class="key acc" data-a="-1">♭</button>
          <button class="key acc" data-a="0">♮</button>
          <button class="key acc" data-a="1">♯</button>
          <button class="key acc" id="back-key">⌫</button>
          <button class="key acc" id="play-key">▶</button>
        </div>
      </div>
      <button class="btn check" id="check-btn" ${it.response.includes(null) ? 'disabled' : ''}>Check scale</button>` :
      `<button class="mini-btn" id="play-answer">▶ Hear the correct scale</button>`}`;

    area.querySelectorAll('.slot').forEach(b => b.onclick = () => { it.active = Number(b.dataset.i); renderAnswerArea(); });
    area.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
      const i = it.active;
      it.response[i] = b.dataset.l;
      playNote(b.dataset.l, 4);
      it.lastFilled = i;
      if (i < it.response.length - 1) it.active = i + 1;
      renderAnswerArea();
    });
    area.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const i = it.response[it.active] ? it.active : it.lastFilled;
      if (i == null) return;
      if (!it.response[i]) return;
      it.response[i] = it.response[i][0] + ACC_TEXT[b.dataset.a];
      playNote(it.response[i]);
      renderAnswerArea();
    });
    const back = document.getElementById('back-key');
    if (back) back.onclick = () => {
      const i = it.response[it.active] ? it.active : Math.max(0, it.active - 1);
      it.response[i] = null; it.active = i; it.lastFilled = i - 1 >= 0 ? i - 1 : null;
      renderAnswerArea();
    };
    const play = document.getElementById('play-key');
    if (play) play.onclick = () => playScale(it.response.filter(Boolean));
    const pa = document.getElementById('play-answer');
    if (pa) pa.onclick = () => playScale(q.answer);
    const c = document.getElementById('check-btn');
    if (c) c.onclick = () => submit(it.response);
  }
}

function submit(response) {
  const it = session.items[session.idx], q = it.q;
  it.response = response;
  it.done = true;
  if (q.type === 'mc') it.right = response === q.answer;
  if (q.type === 'order') it.right = response.every((x, i) => x === q.items[i]);
  if (q.type === 'scale') it.right = response.every((x, i) => x === q.answer[i]);
  recordAnswer(q, it.right);
  if (session.kind !== 'mock') {
    it.right ? playCorrect() : playWrong();
    if (it.right && q.type === 'scale') setTimeout(() => playScale(q.answer), 500);
  }
  renderQuiz();
}

function showFeedback() {
  const it = session.items[session.idx], q = it.q;
  const fb = document.getElementById('feedback');
  if (session.kind === 'mock') { fb.innerHTML = `<p class="fb neutral">Answer saved. Results at the end.</p>`; return; }
  const correctText = q.type === 'mc' ? q.answer : q.type === 'order' ? q.items.join(' → ') : q.answer.join(' ');
  fb.innerHTML = `
    <div class="fb ${it.right ? 'good' : 'bad'}">
      <b>${it.right ? pick(['Bravo!', 'Nailed it!', 'Perfect pitch!', 'Encore!']) : 'Not quite.'}</b>
      ${it.right ? '' : `<span>Correct answer: <b>${correctText}</b></span>`}
      <p>${q.explain}</p>
    </div>`;
}

// ---------- RESULTS ----------
function renderResults() {
  const s = session;
  const done = s.items.filter(x => x.done);
  const right = s.items.filter(x => x.right).length;
  const score = pct(right, s.items.length);
  const misses = s.items.filter(x => !x.right).map(x => x.q);
  const byTag = {};
  s.items.forEach(x => { const t = byTag[x.q.tag] = byTag[x.q.tag] || { r: 0, n: 0 }; t.n++; if (x.right) t.r++; });
  const msg = score >= 90 ? 'Standing ovation! 🎉' : score >= 75 ? 'Strong performance!' : score >= 50 ? 'Getting there — rehearse the misses.' : 'Time for another rehearsal.';

  app.innerHTML = `
    <div class="results">
      <div class="ring big" style="--p:${score}"><span>${score}%</span><small>${right} / ${s.items.length}</small></div>
      <h2>${msg}</h2>
      <p class="sub">${s.title}${done.length < s.items.length ? ` · ${s.items.length - done.length} skipped` : ''}</p>
      <div class="tag-table">
        ${Object.entries(byTag).map(([t, v]) => `
          <div class="tag-row"><span>${tagLabel(t)}</span><span class="bar"><span style="width:${pct(v.r, v.n)}%"></span></span><b>${v.r}/${v.n}</b></div>`).join('')}
      </div>
      ${s.kind === 'mock' ? `<h3>Review</h3><div class="review">${s.items.map((x, i) => `
          <div class="review-row ${x.right ? 'right' : 'wrong'}"><b>${i + 1}.</b> <span>${x.q.prompt.replace(/<[^>]+>/g, '')}</span>
          <em>${x.right ? '✓' : '✗ ' + (x.q.type === 'mc' ? x.q.answer : x.q.type === 'order' ? x.q.items.join(' → ') : x.q.answer.join(' '))}</em></div>`).join('')}</div>` : ''}
      <div class="nav center">
        ${misses.length ? '<button class="btn" id="retry-btn">Retry my misses</button>' : ''}
        <button class="btn ghost" id="again-btn">New set</button>
        <button class="btn ghost" id="home-btn">Home</button>
      </div>
    </div>`;

  if (score >= 75) playScale(['C', 'E', 'G', 'C']);
  const r = document.getElementById('retry-btn');
  if (r) r.onclick = () => startSession('retry', misses);
  document.getElementById('again-btn').onclick = () => startSession(s.kind === 'retry' ? 'unit' : s.kind, s.kind === 'retry' ? (misses[0]?.unit || 1) : s.value);
  document.getElementById('home-btn').onclick = renderHome;
  window.scrollTo(0, 0);
}

renderHome();
