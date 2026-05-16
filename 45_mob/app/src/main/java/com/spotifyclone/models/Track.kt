package com.spotifyclone.models

data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val albumCoverUrl: String,
    val durationMs: Long
)
