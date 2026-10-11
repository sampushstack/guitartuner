/* First Frets: musical data: strings, chords, learning path and play-along songs. */
'use strict';

// Standard tuning, lowest (6th) string first, as MIDI note numbers.
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

const STRINGS = [
  { name: 'E', num: 6, nick: '6th, thickest' },
  { name: 'A', num: 5, nick: '5th string' },
  { name: 'D', num: 4, nick: '4th string' },
  { name: 'G', num: 3, nick: '3rd string' },
  { name: 'B', num: 2, nick: '2nd string' },
  { name: 'e', num: 1, nick: '1st, thinnest' },
];

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const FINGER_NAMES = { 1: 'Pointer', 2: 'Middle', 3: 'Ring', 4: 'Pinky' };

// frets: per string low→high. -1 = don't play, 0 = open string.
// fingers: which fretting-hand finger presses each string (0 = none).
const CHORDS = {
  Em7:   { full: 'E minor 7',  frets: [0, 2, 0, 0, 0, 0],   fingers: [0, 2, 0, 0, 0, 0], level: 1,
           tip: 'Only one finger. Middle finger on the 5th string at the 2nd fret, then strum all six strings.' },
  Em:    { full: 'E minor',    frets: [0, 2, 2, 0, 0, 0],   fingers: [0, 2, 3, 0, 0, 0], level: 1,
           tip: 'Middle and ring fingers sit side by side on the 2nd fret. Strum all six strings and let it ring.' },
  Asus2: { full: 'A sus 2',    frets: [-1, 0, 2, 2, 0, 0],  fingers: [0, 0, 1, 2, 0, 0], level: 1,
           tip: 'Skip the thickest string. Start your strum on the A string (5th) for a bright, open sound.' },
  Am:    { full: 'A minor',    frets: [-1, 0, 2, 2, 1, 0],  fingers: [0, 0, 2, 3, 1, 0], level: 2,
           tip: 'Same shape as E major, moved down one string. Keep your thumb behind the neck, not over the top.' },
  Dsus2: { full: 'D sus 2',    frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0], level: 2,
           tip: 'Play only the four thinnest strings. Aim your strum at the D string (4th).' },
  E:     { full: 'E major',    frets: [0, 2, 2, 1, 0, 0],   fingers: [0, 2, 3, 1, 0, 0], level: 2,
           tip: 'Your pointer finger goes on the 3rd string, 1st fret. Press just behind the metal fret wire.' },
  A:     { full: 'A major',    frets: [-1, 0, 2, 2, 2, 0],  fingers: [0, 0, 1, 2, 3, 0], level: 2,
           tip: 'Three fingers squeeze into the 2nd fret. Tilt them slightly so the thinnest string can still ring.' },
  D:     { full: 'D major',    frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], level: 2,
           tip: 'A little triangle shape. Strum from the D string down and avoid the two thickest strings.' },
  Dm:    { full: 'D minor',    frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], level: 2,
           tip: 'Like D major, but the pointer finger reaches back to the 1st fret on the thinnest string.' },
  G:     { full: 'G major',    frets: [3, 2, 0, 0, 0, 3],   fingers: [2, 1, 0, 0, 0, 3], level: 3,
           tip: 'A big stretch. Middle on the thickest string, ring finger way over on the thinnest. Arch your fingers.' },
  C:     { full: 'C major',    frets: [-1, 3, 2, 0, 1, 0],  fingers: [0, 3, 2, 0, 1, 0], level: 3,
           tip: 'A staircase of fingers: 3rd, 2nd, then 1st fret. Keep fingertips up so the open G string rings.' },
  Cmaj7: { full: 'C major 7',  frets: [-1, 3, 2, 0, 0, 0],  fingers: [0, 3, 2, 0, 0, 0], level: 2,
           tip: 'Make a C chord, then lift your pointer finger. Dreamy and easier than plain C.' },
  E7:    { full: 'E 7',        frets: [0, 2, 0, 1, 0, 0],   fingers: [0, 2, 0, 1, 0, 0], level: 2,
           tip: 'An E major with the ring finger lifted. Bluesy and only two fingers.' },
  A7:    { full: 'A 7',        frets: [-1, 0, 2, 0, 2, 0],  fingers: [0, 0, 2, 0, 3, 0], level: 2,
           tip: 'Two fingers with a gap between them. The open G string in the middle gives it the bluesy flavour.' },
  D7:    { full: 'D 7',        frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], level: 3,
           tip: 'An upside-down D shape. Pointer on the 2nd string, 1st fret; the other two on the 2nd fret.' },
  Fmaj7: { full: 'F major 7',  frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], level: 3,
           tip: 'The friendly cousin of the dreaded F chord. A diagonal line of three fingers; play the four thinnest strings.' },
};

// The learning path: a real sequence, easiest shapes first.
const STAGES = [
  { title: 'One & two fingers', blurb: 'Big sound, tiny effort.', chords: ['Em7', 'Em', 'Asus2'] },
  { title: 'Minor moods',       blurb: 'Your first three-finger shapes.', chords: ['Am', 'E', 'Dsus2'] },
  { title: 'The bright ones',   blurb: 'Happy-sounding chords in tight spaces.', chords: ['A', 'D', 'Dm'] },
  { title: 'Campfire kings',    blurb: 'The stretchy ones that unlock thousands of songs.', chords: ['G', 'C', 'Cmaj7'] },
  { title: 'Sevens & jazz',     blurb: 'Bluesy colours and a gentle F.', chords: ['E7', 'A7', 'D7', 'Fmaj7'] },
];

// Strum patterns are eight eighth-note slots per bar: D = down, U = up, '' = miss the strings.
const SONGS = [
  { id: 'first', title: 'First Strum', vibe: 'Slow and calm', bpm: 60,
    bars: ['Em7', 'Asus2', 'Em7', 'Asus2'],
    pattern: ['D', '', 'D', '', 'D', '', 'D', ''],
    note: 'Four slow down-strums for each chord. Perfect for day one.' },
  { id: 'rainy', title: 'Rainy Window', vibe: 'Moody minor', bpm: 66,
    bars: ['Em', 'Am', 'Em', 'Am'],
    pattern: ['D', '', 'D', '', 'D', '', 'D', 'U'],
    note: 'Add a little up-strum at the very end of each bar to lead into the next chord.' },
  { id: 'campfire', title: 'Campfire Four', vibe: 'The famous pop loop', bpm: 76,
    bars: ['G', 'Em', 'C', 'D'],
    pattern: ['D', '', 'D', 'U', '', 'U', 'D', 'U'],
    note: 'These four chords power a huge number of hit songs. Down, down-up, up-down-up.' },
  { id: 'sunny', title: 'Sunny Side', vibe: 'Bright and bouncy', bpm: 84,
    bars: ['D', 'G', 'A', 'D'],
    pattern: ['D', '', 'D', 'U', '', 'U', 'D', 'U'],
    note: 'Keep your hand swinging down and up even when you skip the strings.' },
  { id: 'sunday', title: 'Sunday Morning', vibe: 'Soft and dreamy', bpm: 72,
    bars: ['Cmaj7', 'Am', 'Fmaj7', 'G'],
    pattern: ['D', '', 'D', 'U', 'D', 'U', 'D', 'U'],
    note: 'Gentle strums. Fmaj7 is the hardest, so take it slow at first.' },
  { id: 'blues', title: 'Twelve-Bar Blues in A', vibe: 'Classic rock and roll', bpm: 88,
    bars: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'],
    pattern: ['D', '', 'D', '', 'D', '', 'D', 'U'],
    note: 'The twelve-bar blues is the shape behind decades of rock and roll. Count the bars as you go.' },
];

function chordNotes(name) {
  const c = CHORDS[name];
  return c.frets.map((f, i) => (f < 0 ? null : OPEN_STRINGS[i] + f)).filter((m) => m !== null);
}

function chordPitchClasses(name) {
  return [...new Set(chordNotes(name).map((m) => m % 12))];
}
