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
