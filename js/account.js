/* First Frets: optional sign-in with social accounts, and progress sync through Firestore.
   The rest of the app never depends on this file: if Firebase isn't configured or can't
   load, the account button simply stays hidden and progress stays on the device. */
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const settings = window.FIRST_FRETS_SIGN_IN || {};
const FF = window.FirstFrets;
const $ = (sel) => document.querySelector(sel);

const PROVIDERS = {
  google: { label: 'Google', make: () => new GoogleAuthProvider(), id: 'google.com' },
  facebook: { label: 'Facebook', make: () => new FacebookAuthProvider(), id: 'facebook.com' },
  apple: { label: 'Apple', make: () => { const p = new OAuthProvider('apple.com'); p.addScope('name'); return p; }, id: 'apple.com' },
  microsoft: { label: 'Microsoft', make: () => new OAuthProvider('microsoft.com'), id: 'microsoft.com' },
  github: { label: 'GitHub', make: () => new GithubAuthProvider(), id: 'github.com' },
  twitter: { label: 'X', make: () => new TwitterAuthProvider(), id: 'twitter.com' },
};

async function loadConfig() {
  if (settings.config && settings.config.apiKey) return { config: settings.config, hosted: false };
  // Firebase Hosting serves the project's web config here. Skip the request where it can't exist.
  if (/(^localhost$|^127\.0\.0\.1$|\.github\.io$)/.test(location.hostname)) return null;
  try {
    const res = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (res.ok) return { config: await res.json(), hosted: true };
  } catch (e) { /* not on Firebase Hosting */ }
  return null;
}

// Firebase loads only when sign-in is set up, so visitors without it download nothing extra.
const loaded = FF ? await loadConfig() : null;
let initializeApp, getAuth, connectAuthEmulator, onAuthStateChanged, signInWithPopup, signInWithRedirect,
  getRedirectResult, reauthenticateWithPopup, signOut, deleteUser, signInWithCredential,
  GoogleAuthProvider, FacebookAuthProvider, GithubAuthProvider, TwitterAuthProvider, OAuthProvider,
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager, doc, onSnapshot, setDoc,
  deleteDoc, serverTimestamp;
if (loaded && loaded.config && loaded.config.apiKey) {
  try {
    const [appSdk, authSdk, dbSdk] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
    ]);
    ({ initializeApp } = appSdk);
    ({ getAuth, connectAuthEmulator, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult,
      reauthenticateWithPopup, signOut, deleteUser, signInWithCredential, GoogleAuthProvider, FacebookAuthProvider,
      GithubAuthProvider, TwitterAuthProvider, OAuthProvider } = authSdk);
    ({ initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager, doc, onSnapshot,
      setDoc, deleteDoc, serverTimestamp } = dbSdk);
    start(loaded);
  } catch (e) {
    // Offline or blocked: the app carries on without accounts.
  }
}

function start({ config, hosted }) {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // On Firebase Hosting every domain serves the sign-in helper itself; using the page's own
  // domain keeps redirect sign-in working in browsers that block third-party storage.
  if (hosted && !local) config = { ...config, authDomain: location.host };

  const app = initializeApp(config);
  const auth = getAuth(app);
  // Offline cache shared safely between tabs, so the app can be open in more than one.
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  if (settings.useEmulators && local) {
    connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, location.hostname, 8080);
    // Emulator only: sign in as a made-up Google user without the pop-up (for automated tests).
    window.__firstFretsEmulator = {
      signInAs: (name, email) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name }))),
      uid: () => auth.currentUser && auth.currentUser.uid,
    };
  }

  const ui = {
    button: $('#account-btn'),
    dialog: $('#account-dialog'),
    out: $('#account-out'),
    in: $('#account-in'),
    list: $('#provider-list'),
    error: $('#account-error'),
    name: $('#account-name'),
    via: $('#account-via'),
    avatar: $('#account-avatar'),
    btnAvatar: $('#account-btn-avatar'),
    btnLabel: $('#account-btn-label'),
    sync: $('#sync-status'),
    confirm: $('#delete-confirm'),
  };

  const enabled = (settings.providers || ['google', 'facebook']).filter((k) => PROVIDERS[k]);
  for (const key of enabled) {
    const b = document.createElement('button');
    b.className = `provider provider-${key}`;
    b.type = 'button';
    b.dataset.provider = key;
    b.innerHTML = `${providerIcon(key)}<span>Continue with ${PROVIDERS[key].label}</span>`;
    b.addEventListener('click', () => signIn(key));
    ui.list.appendChild(b);
  }
  ui.button.hidden = false;
  ui.button.addEventListener('click', () => { showError(''); ui.confirm.hidden = true; ui.dialog.showModal(); });
  $('#account-close').addEventListener('click', () => ui.dialog.close());
  ui.dialog.addEventListener('click', (e) => { if (e.target === ui.dialog) ui.dialog.close(); });
  $('#sign-out').addEventListener('click', async () => { await signOut(auth); ui.dialog.close(); FF.toast('Signed out. Your progress stays on this device.'); });
  $('#delete-start').addEventListener('click', () => { ui.confirm.hidden = false; });
  $('#delete-cancel').addEventListener('click', () => { ui.confirm.hidden = true; });
  $('#delete-go').addEventListener('click', deleteAccount);

  getRedirectResult(auth).catch(handleError);

  async function signIn(key) {
    showError('');
    const provider = PROVIDERS[key].make();
    try {
      await signInWithPopup(auth, provider);
      ui.dialog.close();
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider).catch(handleError);
      } else {
        handleError(err);
      }
    }
  }

  function handleError(err) {
    const code = err && err.code;
    if (!code || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return;
    const messages = {
      'auth/account-exists-with-different-credential': 'You already have an account with this email through a different service. Sign in with the one you used first.',
      'auth/network-request-failed': 'No connection. Check your internet and try again.',
      'auth/unauthorized-domain': 'Sign-in isn’t set up for this web address yet.',
      'auth/operation-not-allowed': 'This sign-in option isn’t switched on yet.',
      'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
    };
    showError(messages[code] || 'Sign-in didn’t work. Please try again.');
    if (!ui.dialog.open) ui.dialog.showModal();
  }

  function showError(text) {
    ui.error.textContent = text;
    ui.error.hidden = !text;
  }

  // ---- progress sync ----
  let stopSync = null;
  let lastSynced = null;
  let timer = 0;
  let user = null;

  function setSync(text, ok) {
    ui.sync.textContent = text;
    ui.sync.classList.toggle('ok', !!ok);
  }

  async function push(p) {
    if (!user) return;
    lastSynced = p;
    setSync('Saving…');
    try {
      await setDoc(doc(db, 'users', user.uid), { ...p, updatedAt: serverTimestamp() });
      setSync('Progress saved to your account', true);
    } catch (e) {
      setSync('Couldn’t save just now. We’ll keep trying.');
    }
  }

  FF.onProgressChange((p) => {
    if (!user || (lastSynced && Progress.equal(p, lastSynced))) return;
    clearTimeout(timer);
    timer = setTimeout(() => push(p), 1200);
  });

  function startSync(u) {
    let first = true;
    let seen = false;
    stopSync = onSnapshot(doc(db, 'users', u.uid), { includeMetadataChanges: false }, (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      // Saved progress vanished after we had seen it: the account was deleted on another
      // device. Sign out here rather than saving this device's copy back.
      if (seen && !snap.exists()) {
        if (stopSync) { stopSync(); stopSync = null; }
        user = null;
        signOut(auth);
        FF.toast('This account was deleted on another device. You’re signed out; progress here is kept.');
        return;
      }
      seen = seen || snap.exists();
      const cloud = snap.exists() ? Progress.pick(snap.data()) : Progress.empty();
      const here = FF.progress();
      const merged = Progress.merge(here, cloud);
      if (!Progress.equal(merged, here)) FF.applyProgress(merged);
      lastSynced = cloud;
      if (!Progress.equal(merged, cloud)) push(merged);
      else setSync('Progress saved to your account', true);
      if (first && snap.exists() && !Progress.equal(here, merged)) FF.toast('Welcome back. Your progress from other devices is here.');
      first = false;
    }, () => setSync('Couldn’t reach your saved progress. Working offline.'));
  }

  onAuthStateChanged(auth, (u) => {
    if (stopSync) { stopSync(); stopSync = null; }
    clearTimeout(timer);
    user = u;
    lastSynced = null;
    ui.out.hidden = !!u;
    ui.in.hidden = !u;
    ui.button.classList.toggle('signed-in', !!u);
    if (!u) {
      ui.btnLabel.textContent = 'Sign in';
      ui.btnAvatar.hidden = true;
      return;
    }
    const first = (u.displayName || '').split(' ')[0] || 'You';
    ui.btnLabel.textContent = first;
    ui.name.textContent = u.displayName || 'Signed in';
    const via = u.providerData.map((p) => Object.values(PROVIDERS).find((x) => x.id === p.providerId)).filter(Boolean)[0];
    ui.via.textContent = via ? `Signed in with ${via.label}` : 'Signed in';
    for (const img of [ui.avatar, ui.btnAvatar]) {
      if (u.photoURL) { img.src = u.photoURL; img.hidden = false; } else img.hidden = true;
    }
    setSync('Syncing…');
    startSync(u);
  });

  async function deleteAccount() {
    if (!user) return;
    const u = user;
    // Stop syncing first, or the live listener would save this device's copy straight back.
    if (stopSync) { stopSync(); stopSync = null; }
    clearTimeout(timer);
    user = null;
    try {
      await deleteDoc(doc(db, 'users', u.uid));
      try {
        await deleteUser(u);
      } catch (err) {
        if (err.code !== 'auth/requires-recent-login') throw err;
        const key = Object.keys(PROVIDERS).find((k) => u.providerData.some((p) => p.providerId === PROVIDERS[k].id));
        await reauthenticateWithPopup(u, PROVIDERS[key].make());
        await deleteUser(u);
      }
      ui.dialog.close();
      FF.toast('Your account and saved progress are deleted. Progress on this device is kept.');
    } catch (err) {
      ui.confirm.hidden = true;
      handleError(err.code ? err : { code: 'unknown' });
      if (auth.currentUser) { user = auth.currentUser; startSync(user); }
    }
  }
}

function providerIcon(key) {
  if (key === 'google') {
    return '<svg class="provider-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  }
  const glyph = { facebook: 'ph-fill ph-facebook-logo', apple: 'ph-fill ph-apple-logo', microsoft: 'ph-fill ph-windows-logo', github: 'ph-fill ph-github-logo', twitter: 'ph-bold ph-x-logo' }[key];
  return `<i class="${glyph} provider-icon" aria-hidden="true"></i>`;
}
