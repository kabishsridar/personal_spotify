from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
    QScrollArea, QGridLayout, QFrame
)
from PyQt6.QtCore import Qt, pyqtSignal
from core.mock_data import MOCK_ALBUMS, MOCK_HISTORY
from ui.utils import AsyncImageLabel

class HomeView(QWidget):
    # Signals
    album_selected = pyqtSignal(dict)
    category_selected = pyqtSignal(str) # Passes search term
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("MainContent")
        self.init_ui()

    def init_ui(self):
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(40, 20, 40, 20)
        self.layout.setSpacing(30)

        # Scroll Area for the whole page
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setStyleSheet("background: transparent; border: none;")
        
        self.container = QWidget()
        self.container_layout = QVBoxLayout(self.container)
        self.container_layout.setContentsMargins(0, 0, 0, 0)
        self.container_layout.setSpacing(35)

        # 1. Welcome Greeting
        greeting = QLabel("Good Evening")
        greeting.setStyleSheet("font-size: 32px; font-weight: bold; color: white;")
        self.container_layout.addWidget(greeting)

        # 2. Recently Played Grid
        recent_label = QLabel("Recently Played")
        recent_label.setStyleSheet("font-size: 24px; font-weight: bold; color: white;")
        self.container_layout.addWidget(recent_label)

        recent_grid = QGridLayout()
        recent_grid.setSpacing(12)
        for i, album in enumerate(MOCK_ALBUMS[:6]):
            card = self._create_recent_card(album)
            recent_grid.addWidget(card, i // 2, i % 2)
        self.container_layout.addLayout(recent_grid)

        # 3. "Made For You" Section
        self._add_section("Made For You", MOCK_ALBUMS)

        # 4. "Tamil & Hindi Discovery" (NEW!)
        tamil_hits = [
            {"title": "Tamil Top 50", "artist": "Kollywood Hits", "year": "2024", "search": "Tamil Top Hits 2024", "cover": "https://i.scdn.co/image/ab67706f0000000293da27d3b951475c7426b6e8"},
            {"title": "A.R. Rahman Essentials", "artist": "Legendary", "year": "Special", "search": "AR Rahman Hits", "cover": "https://i.scdn.co/image/ab67706f000000020a597a78377fe725841cb027"},
            {"title": "Hindi Bollywood", "artist": "Bollywood", "year": "Trending", "search": "Hindi Bollywood Hits", "cover": "https://i.scdn.co/image/ab67706f0000000201639f754719e71fba32f72a"}
        ]
        self._add_section("Discover Indian Genres", tamil_hits)

        self.container_layout.addStretch()
        self.scroll.setWidget(self.container)
        self.layout.addWidget(self.scroll)

    def _add_section(self, title, albums):
        label = QLabel(title)
        label.setStyleSheet("font-size: 24px; font-weight: bold; color: white; margin-top: 20px;")
        self.container_layout.addWidget(label)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setMinimumHeight(320)
        scroll.setStyleSheet("background: transparent; border: none;")
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        
        container = QWidget()
        layout = QHBoxLayout(container)
        layout.setSpacing(20)
        layout.setContentsMargins(0, 0, 0, 0)
        
        for album in albums:
            card = self._create_vertical_card(album)
            layout.addWidget(card)
        layout.addStretch()
        
        scroll.setWidget(container)
        self.container_layout.addWidget(scroll)

    def _create_recent_card(self, album):
        card = QFrame()
        card.setFixedSize(350, 80)
        card.setCursor(Qt.CursorShape.PointingHandCursor)
        card.setStyleSheet("""
            QFrame {
                background-color: #2b2b2b;
                border-radius: 4px;
            }
            QFrame:hover { background-color: #3b3b3b; }
        """)
        
        layout = QHBoxLayout(card)
        layout.setContentsMargins(0, 0, 10, 0)
        
        img = AsyncImageLabel(size=(80, 80), radius=4)
        if album.get('cover'):
            img.set_url(album['cover'])
        elif album.get('album_art'):
            img.set_url(album['album_art'])
        layout.addWidget(img)
        
        txt = QLabel(album['title'])
        txt.setStyleSheet("font-weight: 700; font-size: 14px; background: transparent; color: white;")
        layout.addWidget(txt)
        
        card.mousePressEvent = lambda e, a=album: self.album_selected.emit(a)
        return card

    def _create_vertical_card(self, album):
        card = QFrame()
        card.setFixedSize(200, 300)
        card.setCursor(Qt.CursorShape.PointingHandCursor)
        card.setStyleSheet("""
            QFrame {
                background-color: #181818;
                border-radius: 8px;
                padding: 12px;
            }
            QFrame:hover { background-color: #282828; }
        """)
        
        layout = QVBoxLayout(card)
        layout.setSpacing(8)
        
        img = AsyncImageLabel(size=(176, 176), radius=8)
        if album.get('cover'):
            img.set_url(album['cover'])
        elif album.get('album_art'):
            img.set_url(album['album_art'])
        layout.addWidget(img)
        
        txt = QLabel(album['title'])
        txt.setStyleSheet("font-weight: bold; font-size: 16px; color: white; margin-top: 4px;")
        txt.setWordWrap(True)
        txt.setFixedWidth(176)
        layout.addWidget(txt)
        
        sub = QLabel(f"{album['artist']} • {album['year']}")
        sub.setStyleSheet("font-size: 13px; color: #b3b3b3;")
        sub.setWordWrap(True)
        sub.setFixedWidth(176)
        layout.addWidget(sub)
        
        # If it's a category/playlist, emit the search term
        if 'search' in album:
            card.mousePressEvent = lambda e, s=album['search']: self.category_selected.emit(s)
        else:
            card.mousePressEvent = lambda e, a=album: self.album_selected.emit(a)
        
        return card
