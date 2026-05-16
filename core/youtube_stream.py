import yt_dlp
import os
import json

class YouTubeStreamer:
    def __init__(self, cache_dir="Cache"):
        self.cache_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), cache_dir)
        os.makedirs(self.cache_dir, exist_ok=True)
        
        # PERFORMANCE & STEALTH OPTIONS 🚀
        # We use a mobile User-Agent to avoid "Sign in to confirm you're not a bot" errors on cloud hosts
        self.ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'default_search': 'ytsearch',
            'source_address': '0.0.0.0',
            'nocheckcertificate': True,
            'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
            'referer': 'https://www.youtube.com/',
        }

    def find_track_url(self, title, artist, duration=None):
        """Find the best YouTube URL for a given track metadata."""
        query = f"{title} {artist} official audio"
        print(f"[YT] Searching for: {query}")
        
        with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
            try:
                info = ydl.extract_info(f"ytsearch1:{query}", download=False)
                if not info or 'entries' not in info or not info['entries']:
                    print("[YT] No results found.")
                    return None
                
                entry = info['entries'][0]
                url = entry.get('url')
                yt_id = entry.get('id')
                
                print(f"[YT] Found: {entry.get('title')} (ID: {yt_id})")
                return {"url": url, "id": yt_id}
            except Exception as e:
                print(f"[YT] ERROR: {e}")
                return None

    def get_download_path(self, track_id, music_dir="Music"):
        music_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), music_dir)
        return os.path.join(music_path, f"{track_id}.mp3")

# Shared instance
streamer = YouTubeStreamer()
