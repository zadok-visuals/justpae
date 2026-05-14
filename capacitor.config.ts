import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.amazingpay.amazingpay',
  appName: 'AmazingPay',
  webDir: 'dist',

  // ADD THIS BLOCK START
  server: {
    iosScheme: 'amazingpay',
    androidScheme: 'amazingpay'
  },
  // ADD THIS BLOCK END

  ios: {
    minVersion: '13.0'
  },
  android: {
    minSdkVersion: 21,
    compileSdkVersion: 34,
    targetSdkVersion: 34
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#FF6B35',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#999999',
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: 'launch_screen',
      useDialog: true,
    },
  },
};

export default config;
