import yt_dlp
import os
import json

class YouTubeStreamer:
    def __init__(self, cache_dir="Cache"):
        self.cache_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), cache_dir)
        os.makedirs(self.cache_dir, exist_ok=True)
        
        # Performance-optimized options for streaming
        self.ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'default_search': 'ytsearch',
            'source_address': '0.0.0.0', # Needed to avoid 403 errors occasionally
        }

    def find_track_url(self, title, artist, duration=None):
        """Find the best YouTube URL for a given track metadata."""
        query = f"{title} {artist} official audio"
        
        with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
            try:
                # Search for the query and extract info
                info = ydl.extract_info(f"ytsearch1:{query}", download=False)
                if not info['entries']:
                    return None
                
                entry = info['entries'][0]
                url = entry.get('url')
                yt_id = entry.get('id')
                
                # Check duration match if provided (e.g. within 5 seconds)
                if duration and entry.get('duration'):
                    if abs(entry['duration'] - duration) > 10:
                        # If the first result is a music video or something long, try another query
                        query_retry = f"{title} {artist} topic"
                        info_retry = ydl.extract_info(f"ytsearch1:{query_retry}", download=False)
                        if info_retry['entries']:
                            entry = info_retry['entries'][0]
                            url = entry.get('url')

                return {"url": url, "id": yt_id}
            except Exception as e:
                print(f"Error fetching YT URL: {e}")
                return None

    def get_download_path(self, track_id, music_dir="Music"):
        """Get the expected download path for a track."""
        music_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), music_dir)
        return os.path.join(music_path, f"{track_id}.mp3")

    def download_track(self, track_id, title, artist, callback=None):
        """Download track to permanent storage."""
        # This will be used in Phase 2
        pass

# Shared instance
streamer = YouTubeStreamer()
