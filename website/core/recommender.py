import random
from core.database import db
from core.spotify_api import SpotifyAPI

class Recommender:
    def __init__(self, sp_api=None):
        self.sp_api = sp_api or SpotifyAPI()

    def get_daily_mix(self, limit=20):
        """Generate a mixture of history, likes, and discovery."""
        history = db.get_history(limit=10)
        likes = db.get_liked_songs()
        
        # Determine seed tracks from likes or history
        seed_tracks = []
        if likes:
            seed_tracks = [s['track_id'] for s in random.sample(likes, min(len(likes), 5))]
        elif history:
            seed_tracks = [s['track_id'] for s in random.sample(history, min(len(history), 5))]
            
        if not seed_tracks:
            # Fallback to trending/popular if no history
            return self.get_random_discovery(limit)
            
        # Get recommendations from Spotify
        recs = self.sp_api.get_recommendations(seed_tracks, limit=limit)
        return recs

    def get_random_discovery(self, limit=20):
        """Random tracks for first-time users (mocked discovery)."""
        # In a real app, this would use Spotify categories
        # For now, search some popular genres
        queries = ["Lo-fi beats", "Top 50 Global", "Pop hits"]
        query = random.choice(queries)
        return self.sp_api.search_tracks(query, limit=limit)

recommender = Recommender()
