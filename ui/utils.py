from PyQt6.QtWidgets import QLabel
from PyQt6.QtGui import QPixmap, QImage, QPainter, QPainterPath
from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtNetwork import QNetworkAccessManager, QNetworkRequest, QNetworkReply

# Global shared manager for efficiency
_network_manager = QNetworkAccessManager()

class AsyncImageLabel(QLabel):
    """A QLabel that loads an image from a URL natively using Qt Network Manager."""
    def __init__(self, size=(100, 100), radius=4, parent=None):
        super().__init__(parent)
        self.setFixedSize(*size)
        self.radius = radius
        # Default placeholder color (Spotify Grey)
        self.setStyleSheet(f"background-color: #2b2b2b; border-radius: {radius}px;")
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.reply = None

    def set_url(self, url):
        if not url or not url.startswith("http"):
            return
            
        request = QNetworkRequest(QUrl(url))
        self.reply = _network_manager.get(request)
        self.reply.finished.connect(self._on_finished)

    def _on_finished(self):
        if self.reply and self.reply.error() == QNetworkReply.NetworkError.NoError:
            data = self.reply.readAll()
            image = QImage()
            if image.loadFromData(data):
                pixmap = QPixmap.fromImage(image)
                scaled_pixmap = pixmap.scaled(
                    self.size(), 
                    Qt.AspectRatioMode.KeepAspectRatioByExpanding, 
                    Qt.TransformationMode.SmoothTransformation
                )
                
                # Mask with rounded corners
                rounded = QPixmap(self.size())
                rounded.fill(Qt.GlobalColor.transparent)
                
                painter = QPainter(rounded)
                painter.setRenderHint(QPainter.RenderHint.Antialiasing)
                path = QPainterPath()
                path.addRoundedRect(0, 0, self.width(), self.height(), self.radius, self.radius)
                painter.setClipPath(path)
                painter.drawPixmap(0, 0, scaled_pixmap)
                painter.end()
                
                self.setPixmap(rounded)
        else:
            err_str = self.reply.errorString() if self.reply else "Unknown Error"
            print(f"Network Alert: Failed to load image - {err_str}")
        
        if self.reply:
            self.reply.deleteLater()
            self.reply = None
