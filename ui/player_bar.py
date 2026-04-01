from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QPushButton, QLabel, 
    QSlider, QSpacerItem, QSizePolicy
)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer


class PlayerBar(QWidget):
    # Signals for playback navigation
    play_pause_clicked = pyqtSignal()
    next_clicked = pyqtSignal()
    prev_clicked = pyqtSignal()
    seek_to = pyqtSignal(int)
    volume_changed = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("PlayerBar")
        self.init_ui()
        
        # Internal state
        self._is_playing = False
        self._duration = 0
        self._current_time = 0

    def init_ui(self):
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(15, 0, 15, 0)
        main_layout.setSpacing(20)

        # 1. Left Section: Song Info
        self.info_container = QWidget()
        info_layout = QHBoxLayout(self.info_container)
        info_layout.setContentsMargins(0, 0, 0, 0)
        
        self.album_art = QLabel()
        self.album_art.setFixedSize(60, 60)
        self.album_art.setStyleSheet("background-color: #282828; border-radius: 4px;")
        info_layout.addWidget(self.album_art)

        self.text_info = QWidget()
        text_layout = QVBoxLayout(self.text_info)
        text_layout.setSpacing(2)
        
        self.title_label = QLabel("Song Title")
        self.title_label.setStyleSheet("font-weight: bold; font-size: 14px; color: #ffffff;")
        text_layout.addWidget(self.title_label)
        
        self.artist_label = QLabel("Artist Name")
        self.artist_label.setStyleSheet("font-size: 12px; color: #b3b3b3;")
        self.artist_label.setObjectName("SecondaryText")
        text_layout.addWidget(self.artist_label)
        
        info_layout.addWidget(self.text_info)
        main_layout.addWidget(self.info_container)

        # 2. Middle Section: Playback Controls
        self.controls_container = QWidget()
        controls_layout = QVBoxLayout(self.controls_container)
        controls_layout.setSpacing(5)
        
        # Control Buttons
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(15)
        btn_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.shuffle_btn = self._create_btn("🔀", 18)
        self.prev_btn = self._create_btn("⏮", 24)
        self.play_btn = self._create_btn("▶", 32)
        self.next_btn = self._create_btn("⏭", 24)
        self.repeat_btn = self._create_btn("🔁", 18)
        
        self.play_btn.clicked.connect(lambda: self.play_pause_clicked.emit())
        self.next_btn.clicked.connect(lambda: self.next_clicked.emit())
        self.prev_btn.clicked.connect(lambda: self.prev_clicked.emit())

        btn_layout.addWidget(self.shuffle_btn)
        btn_layout.addWidget(self.prev_btn)
        btn_layout.addWidget(self.play_btn)
        btn_layout.addWidget(self.next_btn)
        btn_layout.addWidget(self.repeat_btn)
        
        controls_layout.addLayout(btn_layout)

        # Seek Bar
        seek_layout = QHBoxLayout()
        seek_layout.setSpacing(8)
        
        self.time_lbl = QLabel("0:00")
        self.time_lbl.setStyleSheet("font-size: 11px; color: #b3b3b3;")
        self.duration_lbl = QLabel("0:00")
        self.duration_lbl.setStyleSheet("font-size: 11px; color: #b3b3b3;")
        
        self.seek_slider = QSlider(Qt.Orientation.Horizontal)
        self.seek_slider.setRange(0, 100)
        self.seek_slider.setFixedHeight(12)
        self.seek_slider.sliderMoved.connect(lambda val: self.seek_to.emit(val))

        seek_layout.addWidget(self.time_lbl)
        seek_layout.addWidget(self.seek_slider)
        seek_layout.addWidget(self.duration_lbl)
        
        controls_layout.addLayout(seek_layout)
        main_layout.addWidget(self.controls_container, 2) # Larger stretch

        # 3. Right Section: Volume & Misc
        self.volume_container = QWidget()
        volume_layout = QHBoxLayout(self.volume_container)
        volume_layout.setSpacing(10)
        
        self.volume_icon = QLabel("🔊")
        self.volume_slider = QSlider(Qt.Orientation.Horizontal)
        self.volume_slider.setRange(0, 100)
        self.volume_slider.setValue(100)
        self.volume_slider.setFixedWidth(100)
        self.volume_slider.valueChanged.connect(lambda val: self.volume_changed.emit(val))
        
        volume_layout.addWidget(self.volume_icon)
        volume_layout.addWidget(self.volume_slider)
        
        main_layout.addWidget(self.volume_container)

    def _create_btn(self, icon_text, font_size):
        btn = QPushButton(icon_text)
        btn.setStyleSheet(f"font-size: {font_size}px; padding: 0;")
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        return btn

    def set_playing(self, is_playing):
        self._is_playing = is_playing
        self.play_btn.setText("⏸" if is_playing else "▶")

    def update_progress(self, current, duration):
        if duration <= 0: return
        self._current_time = current
        self._duration = duration
        
        # update labels
        self.time_lbl.setText(self._format_time(current))
        self.duration_lbl.setText(self._format_time(duration))
        
        # update slider (prevent jump while dragging)
        if not self.seek_slider.isSliderDown():
            self.seek_slider.setMaximum(int(duration))
            self.seek_slider.setValue(int(current))

    def update_metadata(self, title, artist, art_url=None):
        self.title_label.setText(title)
        self.artist_label.setText(artist)

    def _format_time(self, seconds):
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins}:{secs:02}"
