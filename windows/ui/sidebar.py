from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QPushButton, QLabel, 
    QSpacerItem, QSizePolicy, QListWidget, QListWidgetItem
)
from PyQt6.QtCore import Qt, pyqtSignal

class Sidebar(QWidget):
    # Signals to communicate to the main window
    navigate_to = pyqtSignal(str) # "home", "search", "library"
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("Sidebar")
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(15, 20, 15, 20)
        layout.setSpacing(8)

        # Logo/Title
        logo = QLabel("Personal Spotify 🎧")
        logo.setStyleSheet("font-size: 20px; font-weight: bold; padding: 10px; margin-bottom: 20px;")
        layout.addWidget(logo)

        # Main Navigation
        self.home_btn = self._create_nav_button("🏠  Home", "home")
        layout.addWidget(self.home_btn)

        self.search_btn = self._create_nav_button("🔍  Search", "search")
        layout.addWidget(self.search_btn)

        self.library_btn = self._create_nav_button("📚  Your Library", "library")
        layout.addWidget(self.library_btn)

        layout.addSpacing(20)

        # Playlist Header
        playlist_header = QLabel("PLAYLISTS")
        playlist_header.setObjectName("SecondaryText")
        playlist_header.setStyleSheet("font-size: 11px; padding: 10px; letter-spacing: 1px;")
        layout.addWidget(playlist_header)

        # Liked Songs Button
        self.liked_btn = self._create_nav_button("❤️  Liked Songs", "liked")
        layout.addWidget(self.liked_btn)

        # Dynamic Playlist List Placeholder
        self.playlist_list = QListWidget()
        self.playlist_list.setStyleSheet("""
            QListWidget { background: transparent; border: none; }
            QListWidget::item { color: #b3b3b3; padding: 8px; font-weight: bold; border-radius: 4px; }
            QListWidget::item:selected { background: transparent; color: #ffffff; }
            QListWidget::item:hover { color: #ffffff; }
        """)
        # Mock playlists
        for pl_name in ["Daily Mix 1", "Discover Weekly", "Top Hits"]:
            item = QListWidgetItem(pl_name)
            self.playlist_list.addItem(item)
        layout.addWidget(self.playlist_list)

        # Spacer to push items to the top
        layout.addItem(QSpacerItem(20, 40, QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Expanding))

        # Extra: Offline Status
        self.status = QLabel("● Online")
        self.status.setStyleSheet("color: #1ed760; font-size: 11px; padding: 10px;")
        layout.addWidget(self.status)

    def _create_nav_button(self, text, nav_id):
        btn = QPushButton(text)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.clicked.connect(lambda: self.navigate_to.emit(nav_id))
        return btn
