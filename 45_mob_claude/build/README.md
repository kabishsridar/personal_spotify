# 45 Personal Spotify - Android App

## How to Convert to Android APK

1. Go to https://www.pwabuilder.com
2. Enter the URL where you'll host this app
3. Select "Build My PWA"
4. Download the Android package
5. Install the APK on your Android device

## Manual Installation Steps

1. Host these files on a web server or use a local server:
   ```
   python -m http.server 8000
   ```

2. Access the app at http://localhost:8000

3. In Chrome on Android:
   - Open the app in Chrome
   - Tap the menu (three dots)
   - Select "Add to Home screen"
   - This will install it as an app

## Features
- Works offline with service workers
- Can be installed on home screen
- Functions as a standalone app
