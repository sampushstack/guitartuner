/* First Frets: sign-in settings.
 *
 * On Firebase Hosting the project's web config is loaded automatically from
 * /__/firebase/init.json, so `config` can stay null. Fill it in only to run the site
 * somewhere else (copy it from Firebase console > Project settings > Your apps).
 * These values identify the project; they are not secrets. Access is protected by
 * firestore.rules and the authorised domains list in Firebase Authentication.
 *
 * `providers` lists the sign-in buttons, in order. Each one must also be switched on in
 * Firebase console > Authentication > Sign-in method. Available:
 *   'google', 'facebook', 'apple', 'microsoft', 'github', 'twitter'
 */
window.FIRST_FRETS_SIGN_IN = {
  config: null,
  providers: ['google', 'facebook'],
  // For local testing only: talk to the Firebase emulators (firebase emulators:start).
  useEmulators: false,
};
