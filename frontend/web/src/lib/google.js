// Sign In With Google (Google Identity Services). Loaded on demand from the Auth
// page rather than in index.html, so visitors who never sign in don't pay for it.
const SRC = 'https://accounts.google.com/gsi/client';

// Google refuses OAuth inside embedded WebViews (disallowed_useragent), and the
// mobile shell is exactly that — a Capacitor WebView on baytara.app tagged with
// `BaytaraApp/1`. Hide the button there instead of showing one that always fails.
// ponytail: UA sniff, not a capability probe — Google gives no feature test for
// this. Replace with a native flow (@codetrix-studio/capacitor-google-auth, its
// own Android/iOS client ids + release SHA-1) when the app needs Google sign-in.
export const googleSignInBlocked = () => /BaytaraApp\//.test(navigator.userAgent || '');

export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('gsi-client');
    const el = existing || Object.assign(document.createElement('script'), {
      id: 'gsi-client', src: SRC, async: true, defer: true,
    });
    el.addEventListener('load', resolve, { once: true });
    el.addEventListener('error', () => reject(new Error('gsi_unreachable')), { once: true });
    if (!existing) document.head.appendChild(el);
  });
}
