# 🎧 Personal Spotify - Windows Desktop App (PyQt6)

A native Windows desktop app for Personal Spotify, built with PyQt6 and MPV audio rendering.

## Setup Instructions

### 1. Requirements & Dependencies
Make sure you have Python 3.9+ installed.

Install the Python libraries:
```bash
pip install -r requirements.txt
```

### 2. Audio Decoder (libmpv-2.dll)
This application uses MPV as its native audio playback engine. It requires `libmpv-2.dll` to be present in this directory to play music.
* If `libmpv-2.dll` is missing, you can download it from the official MPV Windows builds (e.g., by shinchiro) and place the DLL file here.

### 3. Setup Spotify Credentials
If you have Spotify Developer credentials, create a `.env` file in this directory and populate:
```env
SPOTIPY_CLIENT_ID=your_client_id_here
SPOTIPY_CLIENT_SECRET=your_client_secret_here
```
*If not set up, search results will fall back to YouTube search scraping automatically.*

### 4. Running the App
Run the main startup script:
```bash
python main.py
```
