import type { CapacitorConfig } from '@capacitor/cli';

// Think-Fast — Capacitor (Track B). See docs/capacitor-plan.md.
//
// HARD LINE: webDir points at the STATIC game bundle (public/game/), NOT the
// server-rendered Next.js output. The game is shipped as-is and calls the
// deployed /api/v1/* API over HTTPS like any other client.
const config: CapacitorConfig = {
  appId: 'com.thinkfast.game',
  appName: 'Think-Fast',
  webDir: 'public/game',
  android: {
    // Allow the WebView to keep its own debugging affordances off in release.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#87CEEB',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: {
      // Future events/notifications. Device token is registered via the API.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
