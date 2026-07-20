// Very basic client-side login gate - not real security, just keeps casual
// visitors out and counts how many times someone has signed in. A single
// shared login (not per-user accounts), checked entirely in the browser -
// change these two constants to change the password.
export const VALID_USERNAME = 'tokara';
export const VALID_PASSWORD = 'vineyard2026';

const LOGGED_IN_KEY = 'wc_logged_in';
const SIGN_IN_COUNT_KEY = 'wc_sign_in_count';
const LAST_SIGN_IN_KEY = 'wc_last_sign_in';

export function isLoggedIn() {
  return localStorage.getItem(LOGGED_IN_KEY) === 'true';
}

export function getSignInCount() {
  return Number(localStorage.getItem(SIGN_IN_COUNT_KEY) || 0);
}

export function getLastSignIn() {
  return localStorage.getItem(LAST_SIGN_IN_KEY);
}

// Checks credentials and, if valid, marks the browser logged in and bumps
// the sign-in counter (once per successful sign-in, not per page load -
// staying logged in across refreshes doesn't re-count).
export function attemptSignIn(username, password) {
  if (username !== VALID_USERNAME || password !== VALID_PASSWORD) return false;
  localStorage.setItem(SIGN_IN_COUNT_KEY, String(getSignInCount() + 1));
  localStorage.setItem(LAST_SIGN_IN_KEY, new Date().toISOString());
  localStorage.setItem(LOGGED_IN_KEY, 'true');
  return true;
}

export function signOut() {
  localStorage.removeItem(LOGGED_IN_KEY);
}
