// =====================================================================
// music.js — the "music facts" the app uses to build questions.
// Nothing here touches the page; it only knows music theory.
// =====================================================================

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }; // semitones above C
const ACC_TEXT = { '-1': '♭', '0': '', '1': '♯' };

// Scale formulas = semitones above the tonic for degrees 1–8
const SCALES = {
  'major':          [0, 2, 4, 5, 7, 9, 11, 12],
  'natural minor':  [0, 2, 3, 5, 7, 8, 10, 12],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11, 12],
  'melodic minor':  [0, 2, 3, 5, 7, 9, 11, 12], // ascending form
};

const DEGREE_NAMES_MAJOR = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'leading tone'];
const DEGREE_NAMES_MINOR = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'subtonic'];

// Key signatures: positive = sharps, negative = flats
const MAJOR_KEYS = [
  { tonic: 'C', sig: 0 }, { tonic: 'G', sig: 1 }, { tonic: 'D', sig: 2 }, { tonic: 'A', sig: 3 },
  { tonic: 'E', sig: 4 }, { tonic: 'B', sig: 5 }, { tonic: 'F♯', sig: 6 }, { tonic: 'C♯', sig: 7 },
  { tonic: 'F', sig: -1 }, { tonic: 'B♭', sig: -2 }, { tonic: 'E♭', sig: -3 }, { tonic: 'A♭', sig: -4 },
  { tonic: 'D♭', sig: -5 }, { tonic: 'G♭', sig: -6 }, { tonic: 'C♭', sig: -7 },
];
const MINOR_KEYS = [
  { tonic: 'A', sig: 0 }, { tonic: 'E', sig: 1 }, { tonic: 'B', sig: 2 }, { tonic: 'F♯', sig: 3 },
  { tonic: 'C♯', sig: 4 }, { tonic: 'G♯', sig: 5 }, { tonic: 'D♯', sig: 6 }, { tonic: 'A♯', sig: 7 },
  { tonic: 'D', sig: -1 }, { tonic: 'G', sig: -2 }, { tonic: 'C', sig: -3 }, { tonic: 'F', sig: -4 },
  { tonic: 'B♭', sig: -5 }, { tonic: 'E♭', sig: -6 }, { tonic: 'A♭', sig: -7 },
];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

// ---------- small helpers ----------
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const uniq = arr => [...new Set(arr)];

// "F♯" -> { letter: 'F', acc: 1 }
function parseNote(name) {
  const letter = name[0];
  let acc = 0;
  for (const ch of name.slice(1)) {
    if (ch === '♯' || ch === '#') acc++;
    if (ch === '♭' || ch === 'b') acc--;
  }
  return { letter, acc };
}
// { letter:'F', acc:1 } -> "F♯"  (acc of ±2 shown as ♯♯ / ♭♭)
function noteName(n) {
  if (n.acc === 2) return n.letter + '♯♯';
  if (n.acc === -2) return n.letter + '♭♭';
  return n.letter + ACC_TEXT[String(n.acc)];
}

// Spell a scale correctly (one of each letter name) — returns 8 note names
function spellScale(tonic, type) {
  const t = parseNote(tonic);
  const startIdx = LETTERS.indexOf(t.letter);
  const tonicPc = NATURAL_PC[t.letter] + t.acc;
  return SCALES[type].map((semis, i) => {
    const letter = LETTERS[(startIdx + i) % 7];
    let acc = ((tonicPc + semis) - NATURAL_PC[letter]) % 12;
    if (acc > 6) acc -= 12;
    if (acc < -6) acc += 12;
    return noteName({ letter, acc });
  });
}

function sigText(sig) {
  if (sig === 0) return 'no sharps or flats';
  const n = Math.abs(sig);
  return `${n} ${sig > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}`;
}
function sigAccidentals(sig) {
  if (sig > 0) return SHARP_ORDER.slice(0, sig).map(l => l + '♯');
  if (sig < 0) return FLAT_ORDER.slice(0, -sig).map(l => l + '♭');
  return [];
}
const relativeMinorOf = majorTonic => MINOR_KEYS.find(k => k.sig === MAJOR_KEYS.find(m => m.tonic === majorTonic).sig).tonic;
const relativeMajorOf = minorTonic => MAJOR_KEYS.find(k => k.sig === MINOR_KEYS.find(m => m.tonic === minorTonic).sig).tonic;

// ---------- audio: tiny built-in synthesizer ----------
let audioCtx = null;
let soundOn = true;
function noteFreq(name, octave = 4) {
  const n = parseNote(name);
  const midi = 12 * (octave + 1) + NATURAL_PC[n.letter] + n.acc;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function playFreq(freq, when = 0, dur = 0.35) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch (e) { /* audio not available — stay silent */ }
}
function playNote(name, octave = 4, when = 0) { playFreq(noteFreq(name, octave), when); }
function playScale(notes) {
  // keep the scale rising: bump the octave when the letter wraps past B→C
  let oct = 4, prev = -1;
  notes.forEach((nm, i) => {
    const idx = LETTERS.indexOf(nm[0]);
    if (i > 0 && idx <= prev) oct++;
    prev = idx;
    playNote(nm, oct, i * 0.22);
  });
}
const playCorrect = () => { [523.25, 659.25, 783.99].forEach((f, i) => playFreq(f, i * 0.09, 0.4)); };
const playWrong = () => { playFreq(233.08, 0, 0.3); playFreq(220, 0.12, 0.4); };

// ---------- staff drawing (returns an SVG string) ----------
// Clef "base" = diatonic number of the bottom staff line (C0 = 0, so C4 = 28)
const CLEFS = {
  treble: { base: 30, glyph: '𝄞', name: 'treble' }, // bottom line E4
  bass:   { base: 18, glyph: '𝄢', name: 'bass' },   // bottom line G2
  alto:   { base: 24, glyph: '𝄡', name: 'alto' },   // bottom line F3
};
const GAP = 12; // space between staff lines

function staffSVG({ clef = 'treble', sig = 0, note = null, width = 260 }) {
  const top = 40, bottom = top + 4 * GAP;
  const yOf = step => bottom - step * (GAP / 2);
  let s = `<svg class="staff" viewBox="0 0 ${width} 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${clef} clef staff">`;
  for (let i = 0; i < 5; i++) s += `<line x1="8" x2="${width - 8}" y1="${top + i * GAP}" y2="${top + i * GAP}" class="staff-line"/>`;

  // clef glyph (font sizes/offsets tuned for Noto Music)
  const c = CLEFS[clef];
  if (clef === 'treble') s += `<text x="14" y="${yOf(2) + 0.5}" class="clef" font-size="${GAP * 4}">${c.glyph}</text>`;
  if (clef === 'bass') s += `<text x="14" y="${top + 42}" class="clef" font-size="${GAP * 4}">${c.glyph}</text>`;
  if (clef === 'alto') s += `<text x="14" y="${yOf(0)}" class="clef" font-size="${GAP * 4}">${c.glyph}</text>`;

  // key signature (positions written for treble; other clefs shift)
  const sharpSteps = [8, 5, 9, 6, 3, 7, 4];
  const flatSteps = [4, 7, 3, 6, 2, 5, 1];
  const shift = clef === 'bass' ? -2 : clef === 'alto' ? -1 : 0;
  const n = Math.abs(sig);
  for (let i = 0; i < n; i++) {
    const step = (sig > 0 ? sharpSteps[i] : flatSteps[i]) + shift;
    const x = 58 + i * 14;
    s += `<text x="${x}" y="${yOf(step) + (sig > 0 ? 4.9 : 4.6)}" class="acc" font-size="${GAP * 3}">${sig > 0 ? '♯' : '♭'}</text>`;
  }

  // a single whole note, with ledger lines if needed
  if (note) {
    const step = note.dn - c.base;
    const x = width / 2 + 30;
    for (let l = -2; l >= step; l -= 2) s += `<line x1="${x - 14}" x2="${x + 14}" y1="${yOf(l)}" y2="${yOf(l)}" class="staff-line"/>`;
    for (let l = 10; l <= step; l += 2) s += `<line x1="${x - 14}" x2="${x + 14}" y1="${yOf(l)}" y2="${yOf(l)}" class="staff-line"/>`;
    s += `<ellipse cx="${x}" cy="${yOf(step)}" rx="8" ry="5.6" transform="rotate(-20 ${x} ${yOf(step)})" class="notehead"/>`;
    s += `<ellipse cx="${x}" cy="${yOf(step)}" rx="4" ry="2.6" transform="rotate(40 ${x} ${yOf(step)})" class="notehole"/>`;
  }
  return s + '</svg>';
}
