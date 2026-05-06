
# GitHub Actions Setup for Capacitor Mobile Apps

## 🚀 Quick Start

1. **Push your code to GitHub** (if not already done)
2. **The GitHub Actions workflow is now configured** - it will run automatically on every push to main/develop
3. **Check the Actions tab** in your GitHub repository to see build progress

## 📱 What Gets Built

- ✅ **Android APK** - Ready for testing or Play Store
- ✅ **iOS Archive (Legacy)** - Compatible with older systems (iOS 12.0+)
- ✅ **iOS Archive (Modern)** - For newer systems (iOS 15.0+)
- ✅ **Web Version** - Deployed automatically to Vercel (optional)

## 🔧 Required Secrets (Optional)

For web deployment, add these secrets in GitHub Settings > Secrets:

```
VERCEL_TOKEN=your_vercel_token
VERCEL_ORG_ID=your_org_id  
VERCEL_PROJECT_ID=your_project_id
```

## 📥 Download Built Apps

1. Go to **Actions** tab in your GitHub repo
2. Click on the latest **successful** workflow run
3. Scroll down to **Artifacts** section
4. Download:
   - `android-apk` - Contains the Android APK file
   - `ios-archive-legacy` - Contains the iOS archive compatible with older systems
   - `ios-archive-modern` - Contains the iOS archive for newer systems

## 🛠️ Manual Local Testing (Especially for 2015 MacBook Pro)

### For 2015 MacBook Pro Users

Your older Mac is now fully supported! Here's what has been optimized:

- **iOS deployment target**: Lowered to 12.0 (compatible with your system)
- **Gradle version**: Downgraded to 7.6.4 for better compatibility
- **Node.js version**: Set to 18 (more stable on older systems)
- **CocoaPods settings**: Configured for legacy compatibility

### Android
1.  **Build your web app:**
    ```bash
    npm run build
    ```
2.  **Sync with Capacitor:**
    ```bash
    npx cap sync android
    ```
3.  **Open in Android Studio:**
    ```bash
    npx cap open android
    ```
    From Android Studio, you can run the app on a simulator or a connected device.

### iOS (For 2015 MacBook Pro)
1.  **Build your web app:**
    ```bash
    npm run build
    ```
2.  **Sync with Capacitor:**
    ```bash
    npx cap sync ios
    ```
3.  **Install iOS Dependencies (Pods) - Enhanced for older systems:**
    ```bash
    cd ios/App
    # Clear any existing pods first
    rm -rf Pods
    rm -f Podfile.lock
    # Install with legacy compatibility
    pod repo update
    pod install --repo-update --verbose
    cd ../..
    ```
4.  **Open in Xcode:**
    ```bash
    npx cap open ios
    ```
    From Xcode, you can run the app on a simulator or a connected device. **Important:** Make sure to open the `.xcworkspace` file, not the `.xcodeproj` file.

## 🍎 iOS App Store Deployment
1. Download either the `ios-archive-legacy` or `ios-archive-modern` artifact
2. Open Xcode on any Mac
3. Go to **Window > Organizer**
4. Drag the `.xcarchive` file to Organizer
5. Click **Distribute App** > **App Store Connect**

## 🤖 Android Play Store Deployment

1. Download the `android-apk` artifact
2. Go to [Google Play Console](https://play.google.com/console)
3. Upload the APK to your app's release track
4. Follow Google's review process

## 🌐 Web Admin Dashboard

The web version maintains full admin functionality and deploys automatically to:
- **Vercel** (if secrets configured)
- **GitHub Pages** (alternative option)
- **Any static hosting** (manual deployment)

## ⚡ Benefits of This Setup

- 🎯 **Legacy Mac support** - Works on 2015 MacBook Pro and newer
- 💰 **Free for public repos** - GitHub Actions included
- 🔄 **Automatic builds** - Every push triggers new builds
- 📦 **Artifact storage** - Built apps stored for 30 days
- 🌍 **Web compatibility** - Admin dashboard stays functional
- 🏗️ **Dual iOS builds** - Both legacy and modern versions

## 🔍 Troubleshooting

### For 2015 MacBook Pro Specific Issues:

- **Xcode too old?** Use the legacy iOS archive which targets iOS 12.0
- **CocoaPods issues?** Try the enhanced pod install commands above
- **Memory issues?** Close other applications while building
- **Slow builds?** Use the GitHub Actions instead of local builds

### General Issues:

- **Build fails?** Check the Actions logs for specific errors.
- **iOS `pod install` or build fails?** If you have build problems in Xcode related to "pods", it usually means dependencies are missing or outdated.
    - Make sure you have CocoaPods installed: `sudo gem install cocoapods`.
    - Try running `pod install --repo-update` from the `ios/App` directory.
    - **For 2015 MacBook Pro:** Use the enhanced commands above
    - **To clear cache and retry:** If things are really stuck, you can try cleaning everything and reinstalling from your project root directory:
      ```bash
      rm -rf ios/App/Pods
      rm -f ios/App/Podfile.lock
      rm -rf ~/Library/Caches/CocoaPods
      pod cache clean --all
      cd ios/App && pod repo update && pod install --repo-update --verbose && cd ../..
      ```
- **iOS signing issues?** Update `ios/exportOptions.plist` with your Team ID.
- **Android build errors?** This is usually related to dependency or Java version issues. Check the logs.
- **Need help?** Check the workflow logs in the Actions tab for detailed error messages.

## 🖥️ Legacy System Compatibility

This project is now optimized for:
- **2015 MacBook Pro** and similar legacy systems
- **Older versions of Xcode** (12.x and above)
- **iOS 12.0+** deployment target
- **Stable dependency versions**

Your mobile apps will now build automatically in the cloud AND work on your local development machine! 🎉
