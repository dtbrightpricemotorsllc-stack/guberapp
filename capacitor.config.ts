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
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // serverClientId must match the Web Application OAuth Client ID in Google Cloud Console.
      // This is used by the Android plugin to request an ID token the backend will accept.
      // Set VITE_GOOGLE_WEB_CLIENT_ID in Replit Secrets (same value as GOOGLE_CLIENT_ID) and
      // run `npx cap sync` to apply. The VITE_ prefix is required so Vite also exposes it
      // to the frontend (native-google-sign-in.ts reads import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID).
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
