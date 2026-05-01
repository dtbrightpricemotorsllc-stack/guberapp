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
    // @capgo/capacitor-social-login — replaces dead codetrix-studio plugin
    // (which only supported Capacitor ≤6). Runtime init is in
    // client/src/lib/native-google-sign-in.ts via SocialLogin.initialize().
    // The webClientId is sourced from VITE_GOOGLE_WEB_CLIENT_ID, which must be
    // set in BOTH Replit Secrets and the GitHub Actions env so it's baked into
    // the production JS bundle.
    SocialLogin: {
      // Only bundle the Google provider — avoids pulling in Facebook/Twitter
      // SDKs we don't use, keeping APK size and review surface smaller.
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
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
