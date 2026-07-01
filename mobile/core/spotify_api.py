import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import os
from dotenv import load_dotenv

# Load keys from the .env file if it exists
load_dotenv()

class SpotifyAPI:
    def __init__(self, client_id=None, client_secret=None):
        """
        Initialize Spotify API with developer credentials.
        If not provided, it will look for SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET environment variables.
        """
        self.client_id = client_id or os.getenv("SPOTIPY_CLIENT_ID")
        self.client_secret = client_secret or os.getenv("SPOTIPY_CLIENT_SECRET")
        
        self.sp = None
        if self.client_id and self.client_secret:
            auth_manager = SpotifyClientCredentials(
                client_id=self.client_id, 
                client_secret=self.client_secret
            )   
            self.sp = spotipy.Spotify(auth_manager=auth_manager)
        else:
            print("Spotify credentials not provided. Metadata search will be limited or mocked.")

    def search_tracks(self, query, limit=20):
        """Search for tracks using YouTube as the primary fallback engine."""
        if not self.sp:
            return self._search_youtube(query, limit)
        
        try:
            results = self.sp.search(q=query, limit=limit, type='track')
            tracks = []
            for item in results['tracks']['items']:
                tracks.append(self._format_track(item))
            return tracks
        except Exception as e:
            print(f"Spotify API fallback triggered: {e}")
            return self._search_youtube(query, limit)

    def _search_youtube(self, query, limit=10):
        """Search YouTube for metadata and streamable IDs directly."""
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'extract_flat': True,
            'skip_download': True,
            'force_generic_extractor': False,
        }
        
        print(f"Searching Global YouTube Database for: {query}...")
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Use ytsearch suffix to perform search on YouTube
                info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
                entries = info.get('entries', [])
                
                tracks = []
                for item in entries:
                    yt_id = item['id']
                    # Construct high-quality YouTube thumbnail URL manually for 100% reliability
                    thumb_url = f"https://i.ytimg.com/vi/{yt_id}/mqdefault.jpg"
                    
                    tracks.append({
                        'id': yt_id,
                        'title': item['title'],
                        'artist': item.get('uploader', 'YouTube'),
                        'album': 'YouTube Music',
                        'album_art': thumb_url,
                        'duration': int(item.get('duration', 0)),
                        'uri': f"https://www.youtube.com/watch?v={yt_id}"
                    })
                print(f"YouTube Search found {len(tracks)} results with forced thumbnails.")
                return tracks
        except Exception as e:
            print(f"YouTube Search Error: {e}")
            return []

    def find_track_url(self, title, artist, duration=None):
        """Perform a refined search and extract the direct audio stream URL."""
        import yt_dlp
        search_query = f"{title} {artist} official audio"
        print(f"Searching YouTube Stream: {search_query}...")
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'skip_download': True,
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Get info about the top result
                info = ydl.extract_info(f"ytsearch1:{search_query}", download=False)
                if 'entries' in info and len(info['entries']) > 0:
                    video_info = info['entries'][0]
                    # Direct audio stream URL
                    direct_url = video_info.get('url')
                    print(f"Stream Found! Source: {video_info.get('title')}")
                    return direct_url
        except Exception as e:
            print(f"Streaming Error: {e}")
        return None

    def get_recommendations(self, track_ids, limit=20):
        """Get recommendations based on seed track IDs."""
        if not self.sp or not track_ids:
            return []
        
        results = self.sp.recommendations(seed_tracks=track_ids[:5], limit=limit)
        return [self._format_track(item) for item in results['tracks']]

    def get_artist_top_tracks(self, artist_id):
        """Get top tracks for a specific artist."""
        if not self.sp:
            return []
        
        results = self.sp.artist_top_tracks(artist_id)
        return [self._format_track(item) for item in results['tracks']]

    def _format_track(self, item):
        """Normalize Spotify track data for our database."""
        return {
            'id': item['id'],
            'title': item['name'],
            'artist': item['artists'][0]['name'],
            'album': item['album']['name'],
            'album_art': item['album']['images'][0]['url'] if item['album']['images'] else None,
            'duration': item['duration_ms'] // 1000,
            'popularity': item.get('popularity', 0),
            'uri': item['uri']
        }

# Shared instance for easy access
# spotify_api = SpotifyAPI()
