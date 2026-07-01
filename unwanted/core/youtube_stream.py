import yt_dlp
import os
import json
import sqlite3
import time

class YouTubeStreamer:
    def __init__(self, cache_dir="Cache"):
        self.cache_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), cache_dir)
        os.makedirs(self.cache_dir, exist_ok=True)
        
        # PERFORMANCE & STEALTH OPTIONS 🚀
        self.ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'default_search': 'ytsearch',
            'source_address': '0.0.0.0',
            'nocheckcertificate': True,
            'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
            'referer': 'https://www.youtube.com/',
            # 🔥 BLAZING-FAST PERFORMANCE TWEAKS:
            'skip_download': True,
            'extract_flat': False,
            'youtube_include_dash_manifest': False,
            'youtube_include_hls_manifest': False,
            'check_formats': None,  # Skip HTTP format checking handshake - HUGE speed up!
            'ignoreerrors': True,
            'socket_timeout': 3.0,  # Enforce strict 3.0s timeout to prevent hanging connections
        }

        # Initialize Cache Database
        self.db_path = os.path.join(self.cache_dir, "stream_cache.db")
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.create_cache_table()
        
        # In-Memory Session URL Cache (expires in 2 hours = 7200 seconds)
        self.url_cache = {}

    def create_cache_table(self):
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS youtube_id_cache (
                    query TEXT PRIMARY KEY,
                    youtube_id TEXT NOT NULL,
                    cached_at REAL NOT NULL
                )
            """)
            self.conn.commit()
        except Exception as e:
            print(f"[CACHE] Error creating table: {e}")

    def find_track_url(self, title, artist, duration=None):
        """Find the best YouTube URL for a given track metadata with Dual-Layer Caching."""
        query = f"{title} {artist}".strip().lower()
        now = time.time()
        
        # 1. Level 1: In-Memory URL Cache (Instant 0ms Playback!)
        if query in self.url_cache:
            url, yt_id, expires_at = self.url_cache[query]
            if now < expires_at:
                print(f"[CACHE L1] Instant HIT for: {query}")
                return {"url": url, "id": yt_id}
            else:
                del self.url_cache[query]
                
        # 2. Level 2: Permanent Video ID Cache (Skips search, resolves in 300ms!)
        cached_yt_id = None
        try:
            cursor = self.conn.cursor()
            cursor.execute("SELECT youtube_id FROM youtube_id_cache WHERE query = ?", (query,))
            row = cursor.fetchone()
            if row:
                cached_yt_id = row[0]
                print(f"[CACHE L2] Video ID HIT for '{query}' -> {cached_yt_id}")
        except Exception as e:
            print(f"[CACHE DB] Error reading: {e}")
            
        with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
            try:
                if cached_yt_id:
                    target_url = f"https://www.youtube.com/watch?v={cached_yt_id}"
                    info = ydl.extract_info(target_url, download=False)
                else:
                    search_query = f"{title} {artist} official audio"
                    info = ydl.extract_info(f"ytsearch1:{search_query}", download=False)
                    
                if not info:
                    return None
                    
                if 'entries' in info:
                    if not info['entries']:
                        return None
                    entry = info['entries'][0]
                else:
                    entry = info
                    
                url = entry.get('url')
                yt_id = entry.get('id')
                
                if url and yt_id:
                    # Save back to permanent Level 2 Video ID cache
                    if not cached_yt_id:
                        try:
                            cursor = self.conn.cursor()
                            cursor.execute("INSERT OR REPLACE INTO youtube_id_cache (query, youtube_id, cached_at) VALUES (?, ?, ?)", (query, yt_id, now))
                            self.conn.commit()
                            print(f"[CACHE L2] Saved '{query}' -> {yt_id}")
                        except Exception as e:
                            print(f"[CACHE DB] Error writing: {e}")
                            
                    # Save to Level 1 In-Memory URL cache (Expires in 2 hours)
                    self.url_cache[query] = (url, yt_id, now + 7200)
                    
                    return {"url": url, "id": yt_id}
            except Exception as e:
                print(f"[YT] ERROR: {e}")
                return None
        return None

    def get_download_path(self, track_id, music_dir="Music"):
        music_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), music_dir)
        return os.path.join(music_path, f"{track_id}.mp3")

# Shared instance
streamer = YouTubeStreamer()
