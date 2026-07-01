from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, 
    QLabel, QScrollArea, QFrame, QPushButton, QListWidget, 
    QListWidgetItem
)
from PyQt6.QtCore import Qt, pyqtSignal
from core.mock_data import MOCK_ALBUMS
from ui.utils import AsyncImageLabel

class SearchView(QWidget):
    # Signal: (song_data)
    play_requested = pyqtSignal(dict)
    
    def __init__(self, sp_api=None, parent=None):
        super().__init__(parent)
        self.sp_api = sp_api
        self.setObjectName("MainContent")
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(40, 20, 40, 20)
        layout.setSpacing(20)

        # Search Bar
        search_container = QWidget()
        search_layout = QHBoxLayout(search_container)
        search_layout.setContentsMargins(0, 0, 0, 0)
        
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search for songs, artists, or albums...")
        self.search_input.setStyleSheet("""
            QLineEdit {
                background-color: #ffffff;
                color: #000000;
                border-radius: 20px;
                padding: 12px 20px;
                font-size: 14px;
            }
        """)
        self.search_input.returnPressed.connect(self.on_search)
        search_layout.addWidget(self.search_input)
        layout.addWidget(search_container)

        # Search Results
        self.results_header = QLabel("Top Results")
        self.results_header.setStyleSheet("font-size: 24px; font-weight: bold; margin-top: 10px;")
        layout.addWidget(self.results_header)

        # Result List
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setStyleSheet("background: transparent; border: none;")
        
        self.results_container = QWidget()
        self.results_layout = QVBoxLayout(self.results_container)
        self.results_layout.setSpacing(10)
        self.results_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        self.scroll.setWidget(self.results_container)
        layout.addWidget(self.scroll)

    def on_search(self):
        query = self.search_input.text()
        if not query: return
        
        # Clear old results
        for i in reversed(range(self.results_layout.count())): 
            self.results_layout.itemAt(i).widget().setParent(None)
            
        print(f"Searching for {query}")
        
        tracks = []
        if self.sp_api and self.sp_api.sp:
            tracks = self.sp_api.search_tracks(query)
            self.results_header.setText(f"Results for '{query}'")
        else:
            # Fallback to mock for demo
            tracks = [
                {"id": "1", "title": f"{query} - Remix", "artist": "Artist A", "album": "Album A"},
                {"id": "2", "title": f"{query} (Original)", "artist": "Artist B", "album": "Album B"},
                {"id": "3", "title": f"Best of {query}", "artist": "Artist C", "album": "Album C"},
            ]
            self.results_header.setText("Mock Results (No API Keys Found)")
        
        for track in tracks:
            item = self._create_result_item(track)
            self.results_layout.addWidget(item)

    def _create_result_item(self, track):
        frame = QFrame()
        frame.setFixedHeight(70)
        frame.setStyleSheet("""
            QFrame {
                background-color: transparent;
                border-radius: 4px;
            }
            QFrame:hover { background-color: #2a2a2a; }
        """)
        
        layout = QHBoxLayout(frame)
        layout.setContentsMargins(10, 5, 10, 5)
        
        # Async Image Loading
        img = AsyncImageLabel(size=(50, 50), radius=4)
        if track.get('album_art'):
            img.set_url(track['album_art'])
        layout.addWidget(img)
        
        # Title & Artist
        txt_layout = QVBoxLayout()
        txt_layout.setSpacing(0)
        
        title = QLabel(track['title'])
        title.setStyleSheet("font-weight: bold; font-size: 15px;")
        txt_layout.addWidget(title)
        
        artist = QLabel(f"{track['artist']} • {track.get('album', 'Album')}")
        artist.setStyleSheet("font-size: 12px; color: #b3b3b3;")
        txt_layout.addWidget(artist)
        
        layout.addLayout(txt_layout)
        layout.addStretch()
        
        # Play Button
        play_btn = QPushButton("▶")
        play_btn.setFixedSize(40, 40)
        play_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        play_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent; 
                font-size: 20px; 
                color: #ffffff;
            }
            QPushButton:hover { color: #1db954; font-size: 24px; }
        """)
        play_btn.clicked.connect(lambda: self.play_requested.emit(track))
        layout.addWidget(play_btn)
        
        return frame
