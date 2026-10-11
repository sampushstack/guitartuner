# First Frets

**Live site:** https://sampushstack.github.io/guitartuner/

A friendly guitar tuner and chord coach for beginners of every age, from 10 to 70 and beyond.

## What's inside

1. **Tune**: a microphone tuner with a big needle meter and plain-language hints ("Too low. Tighten the peg"). It detects which string you're playing, or you can tap a peg on the headstock to hear the reference note. Strings tick off as they come into tune.
2. **Chords**: a five-stage path of 16 beginner chords, from one-finger Em7 up to Fmaj7. Each chord has a colour-coded finger diagram, a tip, "Hear it" and "String by string" playback, and **Check my chord**, which listens to your strum and tells you which string is quiet or wrong. Stars track the chords you can play.
3. **Changes**: a change trainer that alternates two chords with a metronome (and an optional strum), plus the classic *one-minute changes* challenge with a saved best score for each chord pair.
4. **Songs**: play-along chord loops (including the Campfire Four and a twelve-bar blues) with count-in, a highlighted bar and strum-arrow guides.

Accessibility for all ages: high-legibility type, an **Aa** larger-text toggle, a **Lefty** mode that mirrors the chord diagrams, keyboard support, light and dark themes, and reduced-motion support.

Progress (stars, best scores, practice streak) is stored in the browser's `localStorage` on this device only.

## Running it

It's a static site with no build step and no dependencies.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

The microphone needs a secure context: `localhost` works, and so does any `https://` host (GitHub Pages, Netlify and so on). Over plain `http://` on another host, the tuner falls back to tune-by-ear reference notes.

## Deploying

Every push to `main` publishes the site to GitHub Pages through `.github/workflows/pages.yml`. Only `index.html`, `css/`, `js/` and `vendor/` are published.

## How it works

- `js/audio.js`: Karplus-Strong plucked-string synthesis for reference notes and strums, metronome clicks, a look-ahead scheduler, microphone input, YIN pitch detection for the tuner, and a pitch-class (chroma) analysis for chord checking.
- `js/data.js`: tuning, chord shapes and fingerings, learning stages and songs.
- `js/app.js`: the interface.
- `css/style.css`: design tokens and styles.
