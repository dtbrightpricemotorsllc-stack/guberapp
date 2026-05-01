import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.guber.app',
  appName: 'GUBER',
  webDir: 'dist/public',
  server: {
    url: 'https://guberapp.app',
    cleartext: false,
  },
  plugins: {
    Browser: {
      presentationStyle: 'popover',
    },
    PushNotifications: {
      // Present the notification as an alert when the app is in the foreground.
      // Without this the notification is silent while the app is open.
      presentationOptions: ['alert', 'badge', 'sound'],
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // The Android plugin (codetrix-studio/capacitor-google-auth) reads `clientId`
      // (or `androidClientId`) — NOT `serverClientId`. The value must be the WEB
      // Application OAuth Client ID from Google Cloud Console (same project that owns
      // the Android OAuth client with this APK's package + SHA-1). Setting both keys
      // covers the plugin's lookup chain and any future plugin version that prefers
      // `serverClientId`.
      // Set VITE_GOOGLE_WEB_CLIENT_ID in Replit Secrets and the Android build CI env,
      // then run `npx cap sync android` before building the APK.
      clientId: process.env.VITE_GOOGLE_WEB_CLIENT_ID || '',
      serverClientId: process.env.VITE_GOOGLE_WEB_CLIENT_ID || '',
      forceCodeForRefreshToken: true,
    },
  },
  ios: {
    scheme: 'guber',
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
    // Require WebView 60+ (supports Android 6.0+, matches Capacitor 8 minSdkVersion 23)
    minWebViewVersion: 60,
    buildOptions: {
      // Keystore alias — credentials are supplied at CI time via GitHub Secrets
      // See android-build-config/keystore-setup.md for full setup instructions
      keystoreAlias: 'guber',
    },
  },
};

export default config;
