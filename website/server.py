# Global Python Backend Relay
from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import uvicorn
import os
import sys
import httpx

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

# Global client to reuse connections and prevent socket leaks
http_client = httpx.AsyncClient(timeout=None)

@app.on_event("shutdown")
async def shutdown_event():
    await http_client.aclose()

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

    try:
        # Use the global client instead of creating a new one per request
        req = http_client.build_request("GET", url, headers=headers)
        response = await http_client.send(req, stream=True, follow_redirects=True)
    except Exception as e:
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
            # We only close the response, not the global client
            await response.aclose()

    return StreamingResponse(stream_generator(), status_code=response.status_code, headers=resp_headers)


@app.get("/api/transcript")
async def get_transcript(yt_id: str):
    """Retrieve subtitles/transcript for a given YouTube video ID."""
    from youtube_transcript_api import YouTubeTranscriptApi
    try:
        print(f"Fetching transcript for YouTube ID: {yt_id}...")
        transcript_list = YouTubeTranscriptApi.list_transcripts(yt_id)
        try:
            transcript = transcript_list.find_manually_created_transcript()
        except Exception:
            try:
                transcript = transcript_list.find_generated_transcript()
            except Exception:
                transcript = next(iter(transcript_list))
                
        data = transcript.fetch()
        return data
    except Exception as e:
        print(f"Failed to fetch YouTube transcript: {e}")
        return {"error": str(e)}

@app.get("/api/transcribe_audio")
async def api_transcribe_audio(yt_id: str):
    """Fallback: transcribe audio directly using speech_recognition."""
    from speech_to_text import transcribe_audio
    import asyncio
    try:
        # Run transcription in a separate thread so it doesn't block the async event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, transcribe_audio, yt_id)
        return result
    except Exception as e:
        return {"error": str(e)}



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
