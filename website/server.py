# Spotify Web - Global Python Backend Relay
from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import os
import sys

# Add root project path to sys.path to import our existing modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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

# --- API Endpoints ---

@app.get("/api/search")
async def search(q: str, limit: int = 30, offset: int = 0):
    """Bridge metadata search to YouTube."""
    print(f"Web Request: Searching for '{q}' (limit={limit}, offset={offset})...")
    results = sp_api.search_tracks(q, limit=limit, offset=offset)
    return results

@app.get("/api/stream")
async def stream(title: str, artist: str, request: Request):
    """Bridge audio stream extraction."""
    user_agent = request.headers.get("user-agent")
    print(f"Web Request: Finding stream for '{title}' - '{artist}' with UA: {user_agent}")
    data = streamer.find_track_url(title, artist, user_agent=user_agent)
    return data

@app.get("/api/proxy")
async def proxy_stream(url: str, request: Request):
    """Proxy audio stream to bypass YouTube IP-locking restrictions."""
    import httpx
    from fastapi.responses import StreamingResponse
    
    headers = {
        "User-Agent": request.headers.get("user-agent", "Mozilla/5.0"),
        "Accept-Encoding": "identity",
    }
    if "range" in request.headers:
        headers["Range"] = request.headers["range"]
        
    client = httpx.AsyncClient()
    
    try:
        # Build and send a streaming GET request directly to YouTube in one go
        req = client.build_request("GET", url, headers=headers)
        response = await client.send(req, stream=True)
    except Exception as e:
        await client.aclose()
        print(f"Proxy Connection Error: {e}")
        return Response(status_code=502, content="Failed to connect to stream source")

    # Extract critical streaming headers to forward
    content_type = response.headers.get("Content-Type", "audio/webm")
    content_range = response.headers.get("Content-Range", "")
    content_length = response.headers.get("Content-Length", "")
    
    resp_headers = {
        "Content-Type": content_type,
        "Accept-Ranges": "bytes"
    }
    if content_range:
        resp_headers["Content-Range"] = content_range
    if content_length:
        resp_headers["Content-Length"] = content_length
        
    async def stream_generator():
        try:
            async for chunk in response.aiter_bytes(chunk_size=40960):
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()
            
    return StreamingResponse(stream_generator(), status_code=response.status_code, headers=resp_headers)


# --- Static File Handling ---

# Serve the frontend files
app.mount("/", StaticFiles(directory=os.path.dirname(os.path.abspath(__file__)), html=True), name="static")

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html"))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print("\n" + "="*50)
    print(f"SPOTIFY CLOUD ENGINE IS LAUNCHING ON PORT {port}...")
    print("="*50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")
