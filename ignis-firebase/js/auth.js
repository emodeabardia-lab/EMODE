/**
 * auth.js — IGNIS Firebase Authentication
 *
 * Usernames are converted to internal Firebase emails:
 *   "admin"       → admin@ignis.local
 *   "alexandros"  → alexandros@ignis.local
 *
 * User roles + ffId are stored in Firestore → users/{uid}
 *
 * Role capabilities:
 *   admin       → full CRUD on everything
 *   firefighter → dashboard (read), own profile (edit phone/certs/status)
 */

const Auth = {

  /** In-memory current user: { uid, role, ffId, name, email } */
  _current: null,

  // ── Internal helpers ─────────────────────────────────────────────────────

  _toEmail: username => username.toLowerCase().trim().replace(/\s+/g, '.') + '@ignis.local',

  async _loadProfile(uid) {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) throw new Error('User profile not found in Firestore.');
    this._current = { uid, ...doc.data() };
    return this._current;
  },

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Log in with a plain username + password.
   * @returns {{ ok: boolean, error?: string }}
   */
  async login(username, password) {
    try {
      const email = this._toEmail(username);
      const cred  = await auth.signInWithEmailAndPassword(email, password);
      await this._loadProfile(cred.user.uid);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Invalid username or password.' };
    }
  },

  /** Sign out and redirect to login page. */
  async logout() {
    await auth.signOut();
    this._current = null;
    window.location.href = 'index.html';
  },

  /** Returns the current user object, or null if not logged in. */
  currentUser() {
    return this._current;
  },

  /** True if the logged-in user is an admin. */
  isAdmin() {
    return !!this._current && this._current.role === 'admin';
  },

  /**
   * Call at the top of any protected page.
   * Waits for Firebase to resolve auth state, then loads the user profile.
   * Redirects to index.html if not authenticated.
   * @returns {Promise<userObject>}
   */
  requireAuth() {
    return new Promise((resolve, reject) => {
      const unsub = auth.onAuthStateChanged(async firebaseUser => {
        unsub(); // stop listening after first event
        if (!firebaseUser) {
          window.location.href = 'index.html';
          return reject(new Error('Not authenticated'));
        }
        try {
          const user = await this._loadProfile(firebaseUser.uid);
          resolve(user);
        } catch (e) {
          console.error('Auth: could not load profile:', e);
          await auth.signOut();
          window.location.href = 'index.html';
          reject(e);
        }
      });
    });
  },

  /**
   * Call on the login page.
   * If the user is already signed in, redirect straight to the dashboard.
   */
  redirectIfLoggedIn() {
    return new Promise(resolve => {
      const unsub = auth.onAuthStateChanged(user => {
        unsub();
        if (user) window.location.href = 'dashboard.html';
        resolve();
      });
    });
  },
};
