package com.spotifyclone.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.spotifyclone.R
import com.spotifyclone.models.Track
import com.bumptech.glide.Glide

class TrackAdapter(
    private var tracks: List<Track>,
    private val onTrackClick: (Track) -> Unit
) : RecyclerView.Adapter<TrackAdapter.TrackViewHolder>() {

    class TrackViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.itemSongTitle)
        val artist: TextView = view.findViewById(R.id.itemSongArtist)
        val albumCover: ImageView = view.findViewById(R.id.itemAlbumCover)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TrackViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_song, parent, false)
        return TrackViewHolder(view)
    }

    override fun onBindViewHolder(holder: TrackViewHolder, position: Int) {
        val track = tracks[position]
        holder.title.text = track.title
        holder.artist.text = track.artist
        
        // Load image using Glide
        Glide.with(holder.itemView.context)
            .load(track.albumCoverUrl)
            .placeholder(R.drawable.ic_launcher_background) // fallback
            .into(holder.albumCover)

        holder.itemView.setOnClickListener {
            onTrackClick(track)
        }
    }

    override fun getItemCount() = tracks.size

    fun updateTracks(newTracks: List<Track>) {
        tracks = newTracks
        notifyDataSetChanged()
    }
}
