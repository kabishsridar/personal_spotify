from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
    QScrollArea, QFrame, QPushButton, QSpacerItem, 
    QSizePolicy
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap, QIcon
from ui.utils import AsyncImageLabel

class AlbumView(QWidget):
    # Signals
    back_requested = pyqtSignal()
    play_track = pyqtSignal(dict)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("MainContent")
        self.init_ui()

    def init_ui(self):
        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(0)

        # Scroll Area for the whole content
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setStyleSheet("background: transparent; border: none;")
        
        self.content_widget = QWidget()
        self.content_layout = QVBoxLayout(self.content_widget)
        self.content_layout.setContentsMargins(30, 20, 30, 20)
        self.content_layout.setSpacing(0)

        # 1. Back Button
        self.back_btn = QPushButton("← Back")
        self.back_btn.setFixedWidth(100)
        self.back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.back_btn.setObjectName("SecondaryText")
        self.back_btn.clicked.connect(self.back_requested.emit)
        self.content_layout.addWidget(self.back_btn)
        self.content_layout.addSpacing(10)

        # 2. Hero Section (Header)
        self.hero_section = QWidget()
        hero_layout = QHBoxLayout(self.hero_section)
        hero_layout.setContentsMargins(0, 0, 0, 30)
        hero_layout.setSpacing(24)

        # Large Cover Art
        self.cover_art = AsyncImageLabel(size=(230, 230), radius=4)
        hero_layout.addWidget(self.cover_art)

        # Details
        details_layout = QVBoxLayout()
        details_layout.setAlignment(Qt.AlignmentFlag.AlignBottom)
        
        type_label = QLabel("ALBUM")
        type_label.setStyleSheet("font-size: 11px; font-weight: bold; color: #b3b3b3;")
        details_layout.addWidget(type_label)

        self.album_title = QLabel("Loading...")
        self.album_title.setStyleSheet("font-size: 80px; font-weight: 800; color: white;")
        self.album_title.setWordWrap(True)
        details_layout.addWidget(self.album_title)

        meta_layout = QHBoxLayout()
        meta_layout.setSpacing(8)
        self.artist_name = QLabel("Artist Name")
        self.artist_name.setStyleSheet("font-weight: bold; font-size: 14px;")
        meta_layout.addWidget(self.artist_name)
        
        self.meta_info = QLabel("• 2024 • 12 songs, 45 min")
        self.meta_info.setStyleSheet("color: #b3b3b3; font-size: 14px;")
        meta_layout.addWidget(self.meta_info)
        meta_layout.addStretch()
        
        details_layout.addLayout(meta_layout)
        hero_layout.addLayout(details_layout)
        
        self.content_layout.addWidget(self.hero_section)

        # 3. Controls (Play, Like, etc)
        controls_layout = QHBoxLayout()
        controls_layout.setContentsMargins(0, 0, 0, 20)
        
        self.play_btn = QPushButton("▶")
        self.play_btn.setFixedSize(56, 56)
        self.play_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.play_btn.setStyleSheet("""
            QPushButton {
                background-color: #1ed760;
                color: black;
                font-size: 24px;
                border-radius: 28px;
                padding-left: 5px;
            }
            QPushButton:hover {
                background-color: #1fdf64;
                transform: scale(1.05);
            }
        """)
        controls_layout.addWidget(self.play_btn)
        
        controls_layout.addStretch()
        self.content_layout.addLayout(controls_layout)

        # 4. Tracks Table Header
        header_frame = QFrame()
        header_frame.setFixedHeight(35)
        header_frame.setStyleSheet("border-bottom: 1px solid #2a2a2a;")
        h_layout = QHBoxLayout(header_frame)
        h_layout.setContentsMargins(15, 0, 15, 0)
        
        h_layout.addWidget(QLabel("#"), 1)
        h_layout.addWidget(QLabel("Title"), 20)
        h_layout.addWidget(QLabel("Duration"), 5)
        
        for lbl in header_frame.findChildren(QLabel):
            lbl.setStyleSheet("color: #b3b3b3; font-size: 11px; font-weight: bold; text-transform: uppercase;")
            
        self.content_layout.addWidget(header_frame)
        self.content_layout.addSpacing(10)

        # 5. Track List Container
        self.track_list_layout = QVBoxLayout()
        self.track_list_layout.setSpacing(0)
        self.content_layout.addLayout(self.track_list_layout)

        self.content_layout.addStretch()
        
        self.scroll.setWidget(self.content_widget)
        self.main_layout.addWidget(self.scroll)

    def load_album(self, album_data):
        """Set UI data for a specific album."""
        self.album_title.setText(album_data.get('title', 'Unknown Album'))
        self.artist_name.setText(album_data.get('artist', 'Unknown Artist'))
        
        if album_data.get('cover'):
            self.cover_art.set_url(album_data['cover'])
        elif album_data.get('album_art'):
            self.cover_art.set_url(album_data['album_art'])
        # For now, clear existing tracks
        for i in reversed(range(self.track_list_layout.count())): 
            self.track_list_layout.itemAt(i).widget().setParent(None)
            
        # Add tracks
        tracks = album_data.get('tracks', [])
        for i, track in enumerate(tracks):
            item = self._create_track_item(i + 1, track)
            self.track_list_layout.addWidget(item)

    def _create_track_item(self, index, track):
        frame = QFrame()
        frame.setFixedHeight(56)
        frame.setStyleSheet("""
            QFrame {
                background-color: transparent;
                border-radius: 4px;
            }
            QFrame:hover { background-color: #2a2a2a; }
        """)
        
        layout = QHBoxLayout(frame)
        layout.setContentsMargins(15, 0, 15, 0)
        
        idx = QLabel(str(index))
        idx.setFixedWidth(20)
        idx.setStyleSheet("color: #b3b3b3; font-size: 14px;")
        layout.addWidget(idx)
        
        info = QVBoxLayout()
        info.setSpacing(0)
        title = QLabel(track['title'])
        title.setStyleSheet("font-weight: 500; font-size: 14px;")
        info.addWidget(title)
        
        artist = QLabel(track.get('artist', self.artist_name.text()))
        artist.setStyleSheet("color: #b3b3b3; font-size: 12px;")
        info.addWidget(artist)
        layout.addLayout(info, 20)
        
        duration = QLabel(track.get('duration_str', '3:45'))
        duration.setStyleSheet("color: #b3b3b3; font-size: 14px;")
        layout.addWidget(duration, 5)
        
        # Make the whole item clickable
        frame.setCursor(Qt.CursorShape.PointingHandCursor)
        frame.mousePressEvent = lambda e: self.play_track.emit(track)
        
        return frame
