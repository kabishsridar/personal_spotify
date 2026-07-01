import yt_dlp
import os
from core.database import db

class Downloader:
    def __init__(self, music_dir="Music", cache_dir="Cache"):
        self.music_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", music_dir))
        self.cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", cache_dir))
        
        os.makedirs(self.music_dir, exist_ok=True)
        os.makedirs(self.cache_dir, exist_ok=True)

    def download_song(self, track_data, is_cache=False):
        """
        Download a song from YouTube based on metadata.
        If is_cache is True, save to Cache/ instead of Music/.
        """
        target_dir = self.cache_dir if is_cache else self.music_dir
        track_id = track_data['id']
        file_path = os.path.join(target_dir, f"{track_id}.mp3")
        
        if os.path.exists(file_path):
            return file_path

        query = f"{track_data['title']} {track_data['artist']} official audio"
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(target_dir, f"{track_id}.%(ext)s"),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': True,
            'no_warnings': True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([f"ytsearch1:{query}"])
                
                # Update database
                if not is_cache:
                    db.add_song({**track_data, 'local_path': file_path})
                    # Mark as downloaded in DB
                    cursor = db.conn.cursor()
                    cursor.execute("UPDATE songs SET is_downloaded = 1 WHERE track_id = ?", (track_id,))
                    db.conn.commit()
                    
                return file_path
        except Exception as e:
            print(f"Download failed for {track_id}: {e}")
            return None

downloader = Downloader()
