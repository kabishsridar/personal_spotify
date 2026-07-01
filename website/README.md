# 🌐 Personal Spotify - Standalone Web Version

A HTML5/JavaScript web interface running on a FastAPI Python backend relay.

## Setup Instructions

### 1. Requirements & Dependencies
Install the required python packages:
```bash
pip install -r requirements.txt
```

### 2. Startup Server
Run the FastAPI server:
```bash
python server.py
```
By default, the server runs on port `8000`.

### 3. Open in Browser
Open your browser and navigate to:
👉 **`http://localhost:8000`**

### 4. Customizing Spotify API Credentials (Optional)
Create a `.env` file in this directory:
```env
SPOTIPY_CLIENT_ID=your_client_id_here
SPOTIPY_CLIENT_SECRET=your_client_secret_here
```
*If left blank, search results fall back to scraping YouTube.*
