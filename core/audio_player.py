import os
import sys

# Windows PATH Fix for libmpv
if os.name == 'nt':
    # Search in project root (one level up from /core)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_root not in os.environ["PATH"]:
        os.environ["PATH"] = project_root + os.pathsep + os.environ["PATH"]

import mpv

class AudioPlayer:
    def __init__(self, callback_on_end=None):
        """
        Initialize the MPV player instance.
        If mpv.dll is not found, it won't work on Windows without careful setup.
        """
        try:
            self.player = mpv.MPV(
                ytdl=True,
                input_default_bindings=True,
                input_vo_keyboard=True,
                osc=False # Disable internal OSC to use our custom UI
            )
            # Register callbacks
            self.player.observe_property('time-pos', self._on_time_pos)
            self.player.observe_property('duration', self._on_duration)
            self.player.event_callback('end-file', self._on_end_file)
            
            self.on_end = callback_on_end
            self.current_time = 0
            self.duration = 0
            self.is_playing = False
        except Exception as e:
            print(f"Failed to initialize MPV: {e}")
            print("Make sure libmpv-2.dll is available in the system path or project root.")
            self.player = None

    def play(self, url):
        """Play a URL (stream or local path)."""
        if not self.player:
            return
        
        self.player.play(url)
        self.is_playing = True

    def pause(self):
        if self.player:
            self.player.pause = True
            self.is_playing = False

    def resume(self):
        if self.player:
            self.player.pause = False
            self.is_playing = True

    def stop(self):
        if self.player:
            self.player.stop()
            self.is_playing = False

    def toggle(self):
        if self.player:
            self.player.pause = not self.player.pause
            self.is_playing = not self.player.pause

    def seek(self, position):
        """Seek to position in seconds."""
        if self.player:
            self.player.seek(position, reference='absolute')

    def set_volume(self, value):
        """Set volume (0-100)."""
        if self.player:
            self.player.volume = value

    def _on_time_pos(self, name, value):
        if value:
            self.current_time = value

    def _on_duration(self, name, value):
        if value:
            self.duration = value

    def _on_end_file(self, event):
        if self.on_end:
            self.on_end()

player_engine = AudioPlayer()
