// Runtime config shared by the web build and the Capacitor native build.
//
// On the WEB build the page is served same-origin as the API, so the game uses
// relative /api/v1/* paths and this stays untouched (API_BASE = '').
//
// On the NATIVE build the WebView origin is capacitor://localhost (not the
// deployed domain), so the game must be pointed at the deployed API origin.
// Fill in PROD_API_BASE with your deployment's origin (e.g.
// 'https://think-fast.vercel.app'). It is only applied inside the native shell,
// so setting it here never affects the web build.
(function () {
  var PROD_API_BASE = ''; // <-- set to the deployed origin for native builds

  var isNative = !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );

  if (isNative && PROD_API_BASE) {
    window.THINKFAST_API_BASE = PROD_API_BASE.replace(/\/$/, '');
  }
})();
