@echo off
REM Build script for packaging the Spotify web app as an Android APK

echo Building Android APK for Spotify Web App...

REM Create necessary directories
if not exist "build" mkdir build
if not exist "build\icons" mkdir build\icons

REM Copy all files to build directory
copy index.html build\ >nul
copy app.js build\ >nul
copy style.css build\ >nul
copy sw.js build\ >nul
copy manifest.json build\ >nul
copy icons\* build\icons\ >nul

REM Create a simple README with instructions
(
echo # 45 Personal Spotify - Android App
echo.
echo ## How to Convert to Android APK
echo.
echo 1. Go to https://www.pwabuilder.com
echo 2. Enter the URL where you'll host this app
echo 3. Select "Build My PWA"
echo 4. Download the Android package
echo 5. Install the APK on your Android device
echo.
echo ## Manual Installation Steps
echo.
echo 1. Host these files on a web server or use a local server:
echo    python -m http.server 8000
echo.
echo 2. Access the app at http://localhost:8000
echo.
echo 3. In Chrome on Android:
echo    - Open the app in Chrome
echo    - Tap the menu (three dots)
echo    - Select "Add to Home screen"
echo    - This will install it as an app
echo.
echo ## Features
echo - Works offline with service workers
echo - Can be installed on home screen
echo - Functions as a standalone app
) > build\README.md

echo Build complete! Check the build/ directory for the packaged app.
echo To convert to Android APK, go to https://www.pwabuilder.com