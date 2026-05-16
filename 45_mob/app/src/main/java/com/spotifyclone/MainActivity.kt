package com.spotifyclone

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer

class MainActivity : AppCompatActivity() {

    private lateinit var searchEditText: EditText
    private lateinit var searchButton: Button
    private lateinit var recyclerView: RecyclerView
    private lateinit var playPauseButton: ImageButton
    private lateinit var songTitle: TextView
    private lateinit var songArtist: TextView
    private lateinit var albumCover: ImageView

    private var player: ExoPlayer? = null
    private var isPlaying = false
    private lateinit var adapter: com.spotifyclone.adapters.TrackAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        searchEditText = findViewById(R.id.searchEditText)
        searchButton = findViewById(R.id.searchButton)
        recyclerView = findViewById(R.id.recyclerView)
        playPauseButton = findViewById(R.id.playPauseButton)
        songTitle = findViewById(R.id.songTitle)
        songArtist = findViewById(R.id.songArtist)
        albumCover = findViewById(R.id.albumCover)

        adapter = com.spotifyclone.adapters.TrackAdapter(emptyList()) { track ->
            playSong("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", track.title, track.artist)
            com.bumptech.glide.Glide.with(this).load(track.albumCoverUrl).into(albumCover)
        }
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = adapter

        player = ExoPlayer.Builder(this).build()

        searchButton.setOnClickListener {
            val query = searchEditText.text.toString()
            if (query.isNotEmpty()) {
                performSearch(query)
            }
        }

        playPauseButton.setOnClickListener {
            togglePlayPause()
        }
    }

    private fun performSearch(query: String) {
        Toast.makeText(this, "Searching for: $query", Toast.LENGTH_SHORT).show()
        
        // Mock data to simulate Spotify API search
        val mockResults = listOf(
            com.spotifyclone.models.Track("1", "$query (Acoustic)", "Mock Artist 1", "https://via.placeholder.com/150/1DB954/FFFFFF?text=Album+1", 180000),
            com.spotifyclone.models.Track("2", "$query (Live)", "Mock Artist 2", "https://via.placeholder.com/150/191414/FFFFFF?text=Album+2", 210000),
            com.spotifyclone.models.Track("3", "$query Remix", "Mock Artist 3", "https://via.placeholder.com/150/282828/FFFFFF?text=Album+3", 190000)
        )
        adapter.updateTracks(mockResults)
    }

    fun playSong(url: String, title: String, artist: String) {
        // Here we use ExoPlayer to play the audio stream.
        // The URL should be fetched via a YouTube stream extractor concept.
        songTitle.text = title
        songArtist.text = artist

        val mediaItem = MediaItem.fromUri(url)
        player?.setMediaItem(mediaItem)
        player?.prepare()
        player?.play()
        isPlaying = true
        playPauseButton.setImageResource(android.R.drawable.ic_media_pause)
    }

    private fun togglePlayPause() {
        if (isPlaying) {
            player?.pause()
            playPauseButton.setImageResource(android.R.drawable.ic_media_play)
        } else {
            player?.play()
            playPauseButton.setImageResource(android.R.drawable.ic_media_pause)
        }
        isPlaying = !isPlaying
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
    }
}
