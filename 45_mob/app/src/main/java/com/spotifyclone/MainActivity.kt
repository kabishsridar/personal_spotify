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

    private lateinit var spotifyService: com.spotifyclone.api.SpotifyService
    private lateinit var youtubeService: com.spotifyclone.api.YouTubeService
    private var accessToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize Services
        val retrofitSpotify = retrofit2.Retrofit.Builder()
            .baseUrl("https://api.spotify.com/")
            .addConverterFactory(retrofit2.converter.gson.GsonConverterFactory.create())
            .build()
        spotifyService = retrofitSpotify.create(com.spotifyclone.api.SpotifyService::class.java)

        val retrofitYoutube = retrofit2.Retrofit.Builder()
            .baseUrl("https://yewtu.be/") // Using a public Invidious instance
            .addConverterFactory(retrofit2.converter.gson.GsonConverterFactory.create())
            .build()
        youtubeService = retrofitYoutube.create(com.spotifyclone.api.YouTubeService::class.java)

        searchEditText = findViewById(R.id.searchEditText)
        searchButton = findViewById(R.id.searchButton)
        recyclerView = findViewById(R.id.recyclerView)
        playPauseButton = findViewById(R.id.playPauseButton)
        songTitle = findViewById(R.id.songTitle)
        songArtist = findViewById(R.id.songArtist)
        albumCover = findViewById(R.id.albumCover)

        adapter = com.spotifyclone.adapters.TrackAdapter(emptyList()) { track ->
            fetchAndPlayYoutube(track)
        }
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = adapter

        player = ExoPlayer.Builder(this).build()

        fetchSpotifyToken()

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

    private fun fetchSpotifyToken() {
        val clientId = "2db7b6fe8d994609b4d44cb6c0f3670e"
        val clientSecret = "e272bb17fef743e3917b708139ff3d3f"
        val authString = android.util.Base64.encodeToString("$clientId:$clientSecret".toByteArray(), android.util.Base64.NO_WRAP)
        
        spotifyService.getToken("Basic $authString").enqueue(object : retrofit2.Callback<com.spotifyclone.models.SpotifyTokenResponse> {
            override fun onResponse(call: retrofit2.Call<com.spotifyclone.models.SpotifyTokenResponse>, response: retrofit2.Response<com.spotifyclone.models.SpotifyTokenResponse>) {
                accessToken = response.body()?.accessToken
            }
            override fun onFailure(call: retrofit2.Call<com.spotifyclone.models.SpotifyTokenResponse>, t: Throwable) {
                Toast.makeText(this@MainActivity, "Spotify Auth Failed", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun performSearch(query: String) {
        val token = accessToken ?: return
        spotifyService.searchTracks("Bearer $token", query).enqueue(object : retrofit2.Callback<com.spotifyclone.models.SpotifySearchResponse> {
            override fun onResponse(call: retrofit2.Call<com.spotifyclone.models.SpotifySearchResponse>, response: retrofit2.Response<com.spotifyclone.models.SpotifySearchResponse>) {
                val results = response.body()?.tracks?.items?.map {
                    com.spotifyclone.models.Track(it.id, it.name, it.artists.firstOrNull()?.name ?: "Unknown", it.album.images.firstOrNull()?.url ?: "", it.durationMs)
                } ?: emptyList()
                adapter.updateTracks(results)
            }
            override fun onFailure(call: retrofit2.Call<com.spotifyclone.models.SpotifySearchResponse>, t: Throwable) {
                Toast.makeText(this@MainActivity, "Search Failed", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun fetchAndPlayYoutube(track: com.spotifyclone.models.Track) {
        val searchQuery = "${track.title} ${track.artist}"
        youtubeService.search(searchQuery).enqueue(object : retrofit2.Callback<List<com.spotifyclone.api.YouTubeSearchResult>> {
            override fun onResponse(call: retrofit2.Call<List<com.spotifyclone.api.YouTubeSearchResult>>, response: retrofit2.Response<List<com.spotifyclone.api.YouTubeSearchResult>>) {
                val videoId = response.body()?.firstOrNull()?.videoId ?: return
                youtubeService.getVideoInfo(videoId).enqueue(object : retrofit2.Callback<com.spotifyclone.api.YouTubeVideoInfo> {
                    override fun onResponse(call: retrofit2.Call<com.spotifyclone.api.YouTubeVideoInfo>, response: retrofit2.Response<com.spotifyclone.api.YouTubeVideoInfo>) {
                        val streamUrl = response.body()?.formatStreams?.firstOrNull()?.url ?: return
                        playSong(streamUrl, track.title, track.artist)
                        com.bumptech.glide.Glide.with(this@MainActivity).load(track.albumCoverUrl).into(albumCover)
                    }
                    override fun onFailure(call: retrofit2.Call<com.spotifyclone.api.YouTubeVideoInfo>, t: Throwable) {}
                })
            }
            override fun onFailure(call: retrofit2.Call<List<com.spotifyclone.api.YouTubeSearchResult>>, t: Throwable) {}
        })
    }

    fun playSong(url: String, title: String, artist: String) {
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
