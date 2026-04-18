import sys
import os
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QHBoxLayout, 
    QVBoxLayout, QStackedWidget
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QPainter, QPen, QColor, QPixmap, QIcon

from ui.styles import QSS
from ui.title_bar import TitleBar
from ui.sidebar import Sidebar
from ui.player_bar import PlayerBar
from ui.home import HomeView
from ui.search import SearchView
from ui.album_view import AlbumView
from core.audio_player import player_engine
from core.spotify_api import SpotifyAPI
from core.youtube_stream import streamer
from core.database import db

class SpotifyApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Personal Spotify 🎧")
        self.resize(1100, 750)
        
        # Windows 11 Frameless Logic
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setStyleSheet(QSS)
        
        # Core Components
        self.sp_api = SpotifyAPI() 
        self.player = player_engine
        
        if not self.player.player:
            print("WARNING: Audio engine failed to load. Playback will be disabled.")
        
        # UI State
        self.current_song = None
        self.history_stack = [] # For back navigation
        
        self.history_timer = QTimer(self)
        self.history_timer.setSingleShot(True)
        self.history_timer.timeout.connect(self._save_to_history)
        
        # Progress Timer (Update Seek Bar)
        self.progress_timer = QTimer(self)
        self.progress_timer.setInterval(500)
        self.progress_timer.timeout.connect(self._update_progress_ui)
        self.progress_timer.start()

        self.init_ui()

    def init_ui(self):
        # Central Widget
        self.central_widget = QWidget()
        self.central_widget.setObjectName("AppRoot")
        self.setCentralWidget(self.central_widget)
        
        # Root Layout (Vertical)
        self.root_layout = QVBoxLayout(self.central_widget)
        self.root_layout.setContentsMargins(0, 0, 0, 0)
        self.root_layout.setSpacing(0)

        # 1. Custom Title Bar
        self.title_bar = TitleBar(self)
        self.root_layout.addWidget(self.title_bar)

        # 2. Main Area (Horizontal: Sidebar + Content)
        self.main_area = QWidget()
        self.main_area_layout = QHBoxLayout(self.main_area)
        self.main_area_layout.setContentsMargins(0, 0, 0, 0)
        self.main_area_layout.setSpacing(0)

        # Sidebar
        self.sidebar = Sidebar()
        self.sidebar.navigate_to.connect(self.navigate)
        self.main_area_layout.addWidget(self.sidebar)

        # Content Views (Stacked)
        self.content_stack = QStackedWidget()
        self.content_stack.setObjectName("MainContent")
        
        self.home_view = HomeView()
        self.search_view = SearchView(sp_api=self.sp_api)
        self.album_view = AlbumView()
        
        # Connect Signals
        self.home_view.album_selected.connect(self.show_album_details)
        self.home_view.category_selected.connect(self.handle_category_search)
        self.search_view.play_requested.connect(self.handle_play_request)
        self.album_view.back_requested.connect(self.go_back)
        self.album_view.play_track.connect(self.handle_play_request)
        
        self.content_stack.addWidget(self.home_view)   # index 0
        self.content_stack.addWidget(self.search_view) # index 1
        self.content_stack.addWidget(self.album_view)  # index 2
        
        self.main_area_layout.addWidget(self.content_stack)
        self.root_layout.addWidget(self.main_area)

        # 3. Player Bar (Bottom)
        self.player_bar = PlayerBar()
        self.player_bar.play_pause_clicked.connect(self.toggle_play)
        self.player_bar.volume_changed.connect(self.player.set_volume)
        self.player_bar.seek_to.connect(self.player.seek)
        
        self.root_layout.addWidget(self.player_bar)

    def navigate(self, nav_id):
        """Handle sidebar navigation."""
        if nav_id == "home":
            self.content_stack.setCurrentIndex(0)
            self.history_stack = []
        elif nav_id == "search":
            self.content_stack.setCurrentIndex(1)
            self.history_stack = []
            self.search_view.search_input.setFocus()

    def show_album_details(self, album_data):
        """Navigate to Album View with specific data."""
        self.album_view.load_album(album_data)
        self.content_stack.setCurrentIndex(2)
        self.history_stack.append(0)

    def go_back(self):
        if self.history_stack:
            prev_idx = self.history_stack.pop()
            self.content_stack.setCurrentIndex(prev_idx)

    def handle_category_search(self, search_term):
        """Navigate to search and trigger a term."""
        self.navigate("search")
        self.search_view.search_input.setText(search_term)
        self.search_view.on_search()

    def handle_play_request(self, song_data):
        """Find YouTube URL and start playback."""
        print(f"Finding stream for: {song_data['title']} - {song_data['artist']}")
        url = streamer.find_track_url(
            song_data['title'], 
            song_data['artist'], 
            song_data.get('duration')
        )
        if url:
            self.play_song(song_data, url)

    def toggle_play(self):
        if not self.player or not self.player.player:
            return
        self.player.toggle()
        self.player_bar.set_playing(self.player.is_playing)

    def play_song(self, song_data, url):
        """Start playing a song and update UI."""
        self.current_song = song_data
        self.player.play(url)
        self.player_bar.set_playing(True)
        self.player_bar.update_metadata(song_data['title'], song_data['artist'])
        self.history_timer.start(30000)

    def _update_progress_ui(self):
        if self.player and self.player.player and self.player.is_playing:
            self.player_bar.update_progress(self.player.current_time, self.player.duration)

    def _save_to_history(self):
        if self.current_song:
            db.add_song(self.current_song)
            db.add_to_history(self.current_song['id'])

    def paintEvent(self, event):
        """Draw a subtle border for the frameless window."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = self.rect()
        painter.setPen(QPen(QColor(40, 40, 40), 1))
        painter.drawRect(rect.adjusted(0, 0, -1, -1))

    def _setup_tray(self):
        from PyQt6.QtWidgets import QSystemTrayIcon, QMenu
        from PyQt6.QtGui import QAction
        
        self.tray_icon = QSystemTrayIcon(self)
        
        # Create a dynamic Spotify Green icon for the tray
        icon_pixmap = QPixmap(64, 64)
        icon_pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(icon_pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setBrush(QColor("#1db954"))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(4, 4, 56, 56)
        painter.end()
        
        self.tray_icon.setIcon(QIcon(icon_pixmap))
        self.tray_icon.setToolTip("Personal Spotify")
        
        tray_menu = QMenu()
        show_action = QAction("Show App", self)
        show_action.triggered.connect(self.showNormal)
        quit_action = QAction("Quit", self)
        quit_action.triggered.connect(QApplication.instance().quit)
        
        tray_menu.addAction(show_action)
        tray_menu.addSeparator()
        tray_menu.addAction(quit_action)
        
        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setApplicationName("Personal Spotify")
    window = SpotifyApp()
    window._setup_tray()
    window.show()
    sys.exit(app.exec())
