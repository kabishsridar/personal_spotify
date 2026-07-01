# 📱 Personal Spotify - Mobile Android App

Android mobile application built using Capacitor, wrapping a custom HTML5 player, communicating with a native Android Foreground Audio Service (`AudioService.java`).

## Setup Instructions

### 1. Compile & Sync JavaScript Changes
Make sure you have Node.js installed.
Run these commands in this directory:
```bash
npm install
npx cap sync android
```

### 2. Build the APK
Open the native project in Android Studio:
```bash
npx cap open android
```
Inside Android Studio:
* Let Gradle finish syncing.
* Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
* Locate and transfer the compiled `app-debug.apk` to your phone and install it.

### 3. Start the Backend Server (on your PC)
Run the Python FastAPI backend server to handle streams and searches:
```bash
# Install python requirements first
pip install -r requirements.txt

# Run server
cd spotify_web
python server.py
```

### 4. Connect Phone to PC Server
* Connect both your computer and your phone to the **same Wi-Fi network**.
* Find your computer's local IP address (e.g. `192.168.1.15`).
* Open the app on your phone, click on the **Cloud Config** settings panel, and enter:
  `http://192.168.1.15:8000` (substitute with your actual IP address).
* Save the config.
