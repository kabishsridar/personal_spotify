import sqlite3
import os

class Database:
    def __init__(self, db_name="database.db"):
        self.db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), db_name)
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.create_tables()

    def create_tables(self):
        cursor = self.conn.cursor()
        
        # Songs table (Metadata + Local Cache Info)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS songs (
                track_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT,
                album_art TEXT,
                duration INTEGER,
                local_path TEXT,
                is_downloaded BOOLEAN DEFAULT 0
            )
        """)
        
        # Liked songs table (References track_id)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS liked_songs (
                track_id TEXT PRIMARY KEY,
                liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (track_id) REFERENCES songs (track_id)
            )
        """)
        
        # History table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (track_id) REFERENCES songs (track_id)
            )
        """)
        
        # Playlists table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Playlist-Song relationship
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playlist_songs (
                playlist_id INTEGER,
                track_id TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (playlist_id, track_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists (id),
                FOREIGN KEY (track_id) REFERENCES songs (track_id)
            )
        """)
        
        self.conn.commit()

    def add_song(self, song_data):
        """Add or update song metadata."""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO songs (track_id, title, artist, album, album_art, duration, local_path)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            song_data['id'],
            song_data['title'],
            song_data['artist'],
            song_data.get('album', ''),
            song_data.get('album_art', ''),
            song_data.get('duration', 0),
            song_data.get('local_path', None)
        ))
        self.conn.commit()

    def toggle_like(self, track_id, liked=True):
        cursor = self.conn.cursor()
        if liked:
            cursor.execute("INSERT OR IGNORE INTO liked_songs (track_id) VALUES (?)", (track_id,))
        else:
            cursor.execute("DELETE FROM liked_songs WHERE track_id = ?", (track_id,))
        self.conn.commit()

    def is_liked(self, track_id):
        cursor = self.conn.cursor()
        cursor.execute("SELECT 1 FROM liked_songs WHERE track_id = ?", (track_id,))
        return cursor.fetchone() is not None

    def add_to_history(self, track_id):
        cursor = self.conn.cursor()
        cursor.execute("INSERT INTO history (track_id) VALUES (?)", (track_id,))
        self.conn.commit()

    def get_liked_songs(self):
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT s.* FROM songs s
            JOIN liked_songs l ON s.track_id = l.track_id
            ORDER BY l.liked_at DESC
        """)
        return self._to_dict_list(cursor)

    def get_history(self, limit=50):
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT s.* FROM songs s
            JOIN history h ON s.track_id = h.track_id
            ORDER BY h.played_at DESC
            LIMIT ?
        """, (limit,))
        return self._to_dict_list(cursor)

    def _to_dict_list(self, cursor):
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

db = Database()
