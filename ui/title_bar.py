from PyQt6.QtWidgets import QWidget, QHBoxLayout, QPushButton, QLabel, QSpacerItem, QSizePolicy
from PyQt6.QtCore import Qt, pyqtSignal, QPoint
from PyQt6.QtGui import QIcon

class TitleBar(QWidget):
    """Custom title bar for frameless window."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.parent = parent
        self.setFixedHeight(32)
        self.setObjectName("TitleBar")
        
        self.layout = QHBoxLayout(self)
        self.layout.setContentsMargins(10, 0, 0, 0)
        self.layout.setSpacing(0)
        
        # Title/Icon
        self.title_label = QLabel("Personal Spotify")
        self.title_label.setStyleSheet("color: #b3b3b3; font-size: 12px;")
        self.layout.addWidget(self.title_label)
        
        self.layout.addSpacerItem(QSpacerItem(40, 20, QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum))
        
        # Window buttons
        self.btn_min = self._create_btn("—", "#b3b3b3", self.parent.showMinimized)
        self.btn_max = self._create_btn("▢", "#b3b3b3", self._toggle_max)
        self.btn_close = self._create_btn("✕", "#b3b3b3", self.parent.close, hover_color="#e81123")
        
        self.layout.addWidget(self.btn_min)
        self.layout.addWidget(self.btn_max)
        self.layout.addWidget(self.btn_close)
        
        self.start_pos = None

    def _create_btn(self, text, color, slot, hover_color="#333333"):
        btn = QPushButton(text)
        btn.setFixedSize(45, 32)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setStyleSheet(f"""
            QPushButton {{
                border: none;
                background-color: transparent;
                color: {color};
                font-size: 14px;
                font-family: 'Segoe UI Symbol';
            }}
            QPushButton:hover {{
                background-color: {hover_color};
                color: white;
            }}
        """)
        btn.clicked.connect(slot)
        return btn

    def _toggle_max(self):
        if self.parent.isMaximized():
            self.parent.showNormal()
            self.btn_max.setText("▢")
        else:
            self.parent.showMaximized()
            self.btn_max.setText("❐")

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.start_pos = event.globalPosition().toPoint()

    def mouseMoveEvent(self, event):
        if self.start_pos:
            delta = event.globalPosition().toPoint() - self.start_pos
            self.parent.move(self.parent.x() + delta.x(), self.parent.y() + delta.y())
            self.start_pos = event.globalPosition().toPoint()

    def mouseReleaseEvent(self, event):
        self.start_pos = None
