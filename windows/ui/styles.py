# Modern Spotify Dark Theme
QSS = """
QMainWindow {
    background-color: #000000;
}

QWidget#AppRoot {
    background-color: #000000;
}

QWidget#TitleBar {
    background-color: #000000;
}

QWidget#Sidebar {
    background-color: #000000;
    max-width: 250px;
    min-width: 220px;
    padding: 10px;
}

QWidget#PlayerBar {
    background-color: #000000;
    min-height: 90px;
    border-top: 1px solid #1a1a1a;
}

QWidget#MainContent {
    background-color: #121212;
    border-radius: 8px; /* Maintain Win11 curved look but with solid bg */
    margin-right: 5px;   /* Slight gap like Win11 panels */
    margin-bottom: 5px;
}

QPushButton {
    background: transparent;
    color: #b3b3b3;
    font-weight: 600;
    text-align: left;
    padding: 12px 18px;
    border-radius: 4px;
    font-family: 'Segoe UI Variable Display', 'Segoe UI', Arial;
    font-size: 14px;
}

QPushButton:hover {
    background-color: #1a1a1a;
    color: #ffffff;
}

QPushButton#PrimaryAction {
    background-color: #1ed760;
    color: #000000;
    border-radius: 20px;
    padding: 12px 28px;
    font-weight: bold;
    font-size: 14px;
}

QPushButton#PrimaryAction:hover {
    background-color: #1fdf64;
    transform: scale(1.04);
}

QLabel {
    color: #ffffff;
    font-family: 'Segoe UI Variable Display', 'Segoe UI', Arial;
}

QLabel#SecondaryText {
    color: #b3b3b3;
    font-size: 13px;
}

/* Better Progress Bars */
QSlider::groove:horizontal {
    height: 4px;
    background: #4d4d4d;
    border-radius: 2px;
}

QSlider::handle:horizontal {
    background: #ffffff;
    width: 12px;
    height: 12px;
    margin: -4px 0;
    border-radius: 6px;
    visibility: hidden;
}

QSlider:hover::handle:horizontal {
    visibility: visible;
}

QSlider::sub-page:horizontal {
    background: #1db954;
    border-radius: 2px;
}

QSlider::sub-page:horizontal:hover {
    background: #1fdf64;
}

/* ScrollBar styling - Spotify Style */
QScrollBar:vertical {
    border: none;
    background: transparent;
    width: 12px;
}

QScrollBar::handle:vertical {
    background: #5a5a5a;
    min-height: 20px;
    border-radius: 6px;
    margin: 2px;
}

QScrollBar::handle:vertical:hover {
    background: #7a7a7a;
}
"""
