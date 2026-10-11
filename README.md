# First Frets

**Live site:** https://sampushstack.github.io/guitartuner/ (also on Firebase Hosting once set up, see below)

A friendly guitar tuner and chord coach for beginners of every age, from 10 to 70 and beyond.

## What's inside

1. **Tune**: a microphone tuner with a big needle meter and plain-language hints ("Too low. Tighten the peg"). It detects which string you're playing, or you can tap a peg on the headstock to hear the reference note. Strings tick off as they come into tune.
2. **Chords**: a five-stage path of 16 beginner chords, from one-finger Em7 up to Fmaj7. Each chord has a colour-coded finger diagram, a tip, "Hear it" and "String by string" playback, and **Check my chord**, which listens to your strum and tells you which string is quiet or wrong. Stars track the chords you can play.
3. **Changes**: a change trainer that alternates two chords with a metronome (and an optional strum), plus the classic *one-minute changes* challenge with a saved best score for each chord pair.
4. **Songs**: play-along chord loops (including the Campfire Four and a twelve-bar blues) with count-in, a highlighted bar and strum-arrow guides.

Accessibility for all ages: high-legibility type, an **Aa** larger-text toggle, a **Lefty** mode that mirrors the chord diagrams, keyboard support, light and dark themes, and reduced-motion support.

Progress (stars, best scores, practice streak) is stored in the browser's `localStorage`. Players can optionally **sign in with Google, Facebook** (or Apple, Microsoft, GitHub, X) to sync that progress across devices through Cloud Firestore. Everything works without an account.

## Running it

It's a static site with no build step and no dependencies.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

The microphone needs a secure context: `localhost` works, and so does any `https://` host (GitHub Pages, Netlify and so on). Over plain `http://` on another host, the tuner falls back to tune-by-ear reference notes.

## Moving to Firebase

The site runs on **Firebase Hosting**, with **Firebase Authentication** for social sign-in and **Cloud Firestore** for synced progress. Every push to `main` deploys through `.github/workflows/firebase-hosting.yml`, and each pull request gets a preview link.

GitHub Pages keeps running alongside it (`.github/workflows/pages.yml`), so both addresses stay live. Sign-in only appears on the Firebase address; the GitHub Pages copy works as before, with progress kept on the device.

One-time setup, all in the browser:

### 1. Create the Firebase project
1. Go to https://console.firebase.google.com and click **Create a project**. Name it (e.g. `first-frets`). Google Analytics is optional.
2. Note the **Project ID** shown under the name (e.g. `first-frets-1a2b3`).
3. Click the **Web** icon (`</>`) to add a web app. Give it a nickname and tick **Also set up Firebase Hosting**. You don't need to copy the config it shows: Firebase Hosting supplies it automatically.

### 2. Turn on the database
1. **Build → Firestore Database → Create database**. Choose **production mode** and a location near your players.
2. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.

### 3. Turn on sign-in
**Build → Authentication → Get started → Sign-in method**:
- **Google:** enable it, pick a support email, save.
- **Facebook:** create an app at https://developers.facebook.com (use case: *Authenticate and request data from users with Facebook Login*). Copy its **App ID** and **App secret** into Firebase. Copy the **OAuth redirect URI** Firebase shows into Facebook under *Facebook Login → Settings → Valid OAuth Redirect URIs*, and also add `https://YOUR-PROJECT-ID.web.app/__/auth/handler` (plus the same path on your custom domain later). Before the public can use it, Facebook requires the app to be switched to **Live**, which needs a privacy policy URL.
- **Others (optional):** Apple (needs a paid Apple Developer account), Microsoft, GitHub and X work the same way. Add their keys to `providers` in [`js/firebase-config.js`](js/firebase-config.js) to show their buttons.

### 4. Let GitHub deploy
1. In Google Cloud, open **IAM & Admin → Service Accounts** for the project: https://console.cloud.google.com/iam-admin/serviceaccounts
2. **Create service account** named `github-deploy`, with these roles: **Firebase Hosting Admin**, **Firebase Authentication Admin**, **Cloud Run Viewer**, **API Keys Viewer**.
3. Open it, go to **Keys → Add key → Create new key → JSON**. A file downloads.
4. In this repository: **Settings → Secrets and variables → Actions**.
   - **Secrets** tab → *New repository secret*: name `FIREBASE_SERVICE_ACCOUNT`, value = the whole JSON file's contents.
   - **Variables** tab → *New repository variable*: name `FIREBASE_PROJECT_ID`, value = your Project ID.
5. Delete the downloaded key file from your computer.

### 5. Go live
Merge the pull request. The site deploys to `https://YOUR-PROJECT-ID.web.app`.

### 6. Afterwards
- **Custom domain:** Firebase console → **Hosting → Add custom domain**, then follow its DNS steps. Also add the domain under **Authentication → Settings → Authorized domains**, and its `/__/auth/handler` URL to Facebook's redirect URIs.
- **GitHub Pages stays on** for now. If you later retire it: delete `.github/workflows/pages.yml`, then **Settings → Pages → Unpublish site**. Progress saved on that address stays in those browsers.

### Local testing with the emulators
```sh
npm install -g firebase-tools
firebase emulators:start --only auth,firestore --project demo-firstfrets
```
Then set `config: { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-firstfrets' }` and `useEmulators: true` in `js/firebase-config.js` and serve the folder on `localhost`. Don't commit those changes.

## How it works

- `js/audio.js`: Karplus-Strong plucked-string synthesis for reference notes and strums, metronome clicks, a look-ahead scheduler, microphone input, YIN pitch detection for the tuner (with a hum and hiss filter and a loudness gate that adapts to the room's background noise), and a pitch-class (chroma) analysis for chord checking.
- `js/data.js`: tuning, chord shapes and fingerings, learning stages and songs.
- `js/app.js`: the interface.
- `js/sync.js`: which progress syncs, and how two devices' copies merge (stars and practice days combine, best scores keep the higher).
- `js/account.js`: optional sign-in and live progress sync (Firebase Auth and Firestore). Firebase only loads when it's configured.
- `firestore.rules`: each player can read, write and delete only their own progress document, and writes are checked for shape and size.
- `css/style.css`: design tokens and styles.
