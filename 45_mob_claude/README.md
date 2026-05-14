# 45 Personal Spotify - Mobile App

This is a packaged version of the Spotify web app that can be converted to an Android application.

## Files Included

- `index.html` - Main HTML file
- `app.js` - JavaScript functionality
- `style.css` - Styling
- `manifest.json` - PWA manifest file
- `sw.js` - Service worker for offline functionality
- `build.sh` - Build script for Unix/Linux systems
- `build.bat` - Build script for Windows systems
- `package.json` - NPM package file
- `APK_CREATION.md` - Instructions for creating Android APK

## How to Create Android APK

### Step 1: Test the Application

1. Host the files using a local server:
   ```
   python -m http.server 8000
   ```

2. Open your browser and go to http://localhost:8000

### Step 2: Convert to Android App

You have several options:

#### Option A: PWA Builder (Easiest)
1. Go to https://www.pwabuilder.com
2. Enter your app URL
3. Click "Build My PWA"
4. Select Android platform
5. Download and install the generated APK

#### Option B: Manual Installation
1. Host the files on a web server
2. Open Chrome on Android
3. Navigate to your hosted app
4. Tap the menu (three dots) → Add to Home screen

## Features

- Works offline with service workers
- Can be installed on home screen
- Functions as a standalone app
- Mobile-optimized interface

## Requirements

- Python (for local testing)
- Web hosting (for online deployment)
- Android device (for installation)

## Support

For any issues, refer to the APK_CREATION.md file for detailed instructions on creating the Android application package.