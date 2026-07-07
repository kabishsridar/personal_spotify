import os
import subprocess
import speech_recognition as sr
from pydub import AudioSegment
import tempfile

def transcribe_audio(youtube_id):
    """
    Downloads audio for a YouTube video, converts to wav, chunks it, and transcribes using Google Speech Recognition.
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, f"{youtube_id}.webm")
            wav_path = os.path.join(tmpdir, f"{youtube_id}.wav")

            # Download lowest quality audio using yt-dlp to be fast
            url = f"https://www.youtube.com/watch?v={youtube_id}"
            subprocess.run([
                "yt-dlp",
                "-f", "worstaudio",
                "--extract-audio",
                "--audio-format", "wav",
                "-o", wav_path.replace(".wav", ".%(ext)s"),
                url
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            # Load audio using pydub
            audio = AudioSegment.from_wav(wav_path)
            
            # Split into 30 second chunks
            chunk_length_ms = 30000
            chunks = [audio[i:i + chunk_length_ms] for i in range(0, len(audio), chunk_length_ms)]
            
            recognizer = sr.Recognizer()
            full_text = []

            for i, chunk in enumerate(chunks):
                chunk_path = os.path.join(tmpdir, f"chunk{i}.wav")
                chunk.export(chunk_path, format="wav")
                
                with sr.AudioFile(chunk_path) as source:
                    audio_data = recognizer.record(source)
                    try:
                        # recognize_google is free and supports multiple languages automatically or via language param
                        text = recognizer.recognize_google(audio_data)
                        
                        # Add a fake timestamp for UI rendering
                        start_time = (i * chunk_length_ms) / 1000.0
                        full_text.append({"time": start_time, "text": text})
                    except sr.UnknownValueError:
                        pass # Could not understand audio
                    except sr.RequestError as e:
                        print(f"Could not request results from Google Speech Recognition service; {e}")

            if not full_text:
                return {"error": "Transcription failed or returned no text."}
                
            return {"transcript": full_text}
            
    except Exception as e:
        print(f"Transcription error: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    # Test
    print(transcribe_audio("dQw4w9WgXcQ")) # Rickroll
