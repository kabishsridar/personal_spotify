# Spotify Web - Global Python Backend Relay
from fastapi import FastAPI, Response, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import uvicorn
import os
import sys
import requests
import re

# Add root project path to sys.path to import our existing modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Also add the core directory to the path
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'core'))

from core.spotify_api import SpotifyAPI
from core.youtube_stream import streamer

app = FastAPI(title="Spotify Web Backend")
sp_api = SpotifyAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STEALTH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    'Referer': 'https://www.youtube.com/',
}

# --- API Endpoints ---

@app.get("/api/search")
async def search(q: str):
    print(f"Web Request: Searching for '{q}'...")
    return sp_api.search_tracks(q, limit=20)

@app.get("/api/stream")
async def stream(title: str, artist: str):
    print(f"Web Request: Finding stream for '{title}' - '{artist}'...")
    data = streamer.find_track_url(title, artist)
    if data and data.get("url"):
        proxy_url = f"/api/proxy_stream?url={requests.utils.quote(data['url'])}"
        return {"url": proxy_url, "id": data.get("id")}
    return data

@app.get("/api/proxy_stream")
async def proxy_stream(request: Request, url: str):
    """Advanced Proxy Streamer with Byte-Range support for Mobile scrubbing."""
    range_header = request.headers.get('Range')
    
    headers = STEALTH_HEADERS.copy()
    if range_header:
        headers['Range'] = range_header

    try:
        r = requests.get(url, headers=headers, stream=True, timeout=10)
        r.raise_for_status()
        
        # Pass through important headers for mobile players
        response_headers = {
            'Content-Type': r.headers.get('Content-Type', 'audio/mpeg'),
            'Accept-Ranges': 'bytes',
        }
        
        if 'Content-Range' in r.headers:
            response_headers['Content-Range'] = r.headers['Content-Range']
        if 'Content-Length' in r.headers:
            response_headers['Content-Length'] = r.headers['Content-Length']

        def iterfile():
            for chunk in r.iter_content(chunk_size=16384):
                yield chunk

        status_code = 206 if range_header else 200
        return StreamingResponse(iterfile(), status_code=status_code, headers=response_headers)

    except Exception as e:
        print(f"PROXY ERROR: {e}")
        raise HTTPException(status_code=500, detail="Stream failed")

# --- Static File Handling ---
@app.get("/manifest_v2.json")
async def get_manifest():
    return FileResponse(os.path.join(os.path.dirname(os.path.abspath(__file__)), "manifest_v2.json"), media_type="application/manifest+json")

@app.get("/sw.js")
async def get_sw():
    return FileResponse(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sw.js"), media_type="application/javascript")

app.mount("/", StaticFiles(directory=os.path.dirname(os.path.abspath(__file__)), html=True), name="static")

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html"))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8090))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")
