/** Spotify Web App Logic - PURE MOBILE PHONE EDITION 📱 */

// State Management
let currentTrack = null;
let isPlaying = false;
let navigationHistory = ["view-home"];
let currentQueue = [];
let manualQueue = [];
let isShuffled = false;
let isRepeated = false;

// API Configuration
const API_BASE_URL = '';

// Library & Playlists
let playlists = JSON.parse(localStorage.getItem('spotify_web_playlists')) || {
    "liked": { name: "Liked Songs", tracks: [] }
};

// UI Elements
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerThumb = document.getElementById('player-thumb');
const playPauseBtnMini = document.getElementById('play-pause-btn-mini');
const playPauseBtnFull = document.getElementById('play-pause-btn-full');
const audioEngine = document.getElementById('audio-engine');
const progressBar = document.getElementById('playback-progress');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');

const fullPlayer = document.getElementById('full-player');
const miniPlayerTrigger = document.getElementById('mini-player-trigger');
const btnCloseFullPlayer = document.getElementById('btn-close-full-player');
const fullPlayerArt = document.getElementById('full-player-art');
const fullPlayerTitle = document.getElementById('full-player-title');
const fullPlayerArtist = document.getElementById('full-player-artist');
const videoContainerMobile = document.getElementById('video-container-mobile');
const videoIframe = document.getElementById('video-iframe');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Spotify Mobile Engine: PHONE-ONLY MODE ONLINE 📱🚀");
    setupEventListeners();
    renderLibrary();
});

function setupEventListeners() {
    // Playback
    playPauseBtnMini.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
    playPauseBtnFull.addEventListener('click', togglePlay);
    document.getElementById('btn-next').addEventListener('click', playNextTrack);
    document.getElementById('btn-prev').addEventListener('click', playPreviousTrack);
    
    audioEngine.addEventListener('timeupdate', updateProgress);
    audioEngine.addEventListener('ended', () => {
        if (isRepeated) playTrack(currentTrack);
        else playNextTrack();
    });

    // Navigation Tabs
    document.getElementById('nav-home').addEventListener('click', () => switchTab('view-home'));
    document.getElementById('nav-search').addEventListener('click', () => switchTab('view-search'));
    document.getElementById('nav-library').addEventListener('click', () => switchTab('view-library'));

    // Player Overlay
    miniPlayerTrigger.addEventListener('click', openFullPlayer);
    btnCloseFullPlayer.addEventListener('click', closeFullPlayer);

    // Search
    const searchInput = document.getElementById('web-search-input');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch(e.target.value);
    });

    // Back Button (for playlists)
    document.getElementById('btn-back').addEventListener('click', () => switchTab('view-library'));

    // Home Cards
    document.querySelectorAll('.recent-card').forEach(card => {
        card.addEventListener('click', () => {
            const query = card.querySelector('span').innerText;
            performSearch(query);
        });
    });

    // Genre Cards
    document.querySelectorAll('.genre-card').forEach(card => {
        card.addEventListener('click', () => performSearch(card.innerText));
    });
}

// --- Navigation Logic ---
function switchTab(viewId) {
    document.querySelectorAll('.content-area').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (viewId === 'view-home') document.getElementById('nav-home').classList.add('active');
    if (viewId === 'view-search') document.getElementById('nav-search').classList.add('active');
    if (viewId === 'view-library' || viewId === 'view-playlist') document.getElementById('nav-library').classList.add('active');
}

function openFullPlayer() {
    if (!currentTrack) return;
    fullPlayer.classList.add('active');
}

function closeFullPlayer() {
    fullPlayer.classList.remove('active');
}

// --- Search & Tracks ---
async function performSearch(query) {
    if (!query) return;
    switchTab('view-search');
    const container = document.getElementById('results-list');
    document.getElementById('search-placeholder-content').classList.add('hidden');
    container.innerHTML = `<p style="padding: 20px; color: grey;">Searching for '${query}'...</p>`;

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const tracks = await response.json();
        renderTrackList(tracks, container);
    } catch (err) { console.error(err); }
}

function renderTrackList(tracks, container) {
    container.innerHTML = "";
    currentQueue = tracks;
    
    if (tracks.length === 0) {
        container.innerHTML = `<p style="padding: 20px; color: grey;">No tracks found.</p>`;
        return;
    }

    tracks.forEach(track => {
        const item = document.createElement('div');
        item.className = "recent-card";
        item.style.marginBottom = "8px";
        item.innerHTML = `
            <img src="${track.album_art || 'https://via.placeholder.com/56'}">
            <div style="flex:1;">
                <div style="font-weight:700; font-size:14px;">${track.title}</div>
                <div style="font-size:12px; color:#b3b3b3;">${track.artist}</div>
            </div>
            <i class="fas fa-play-circle" style="font-size:28px; color:#1db954; margin-right:15px;"></i>
        `;
        item.onclick = () => playTrack(track);
        container.appendChild(item);
    });
}

// --- Audio Engine ---
async function playTrack(track) {
    currentTrack = track;
    
    // Update Mini Player
    playerTitle.innerText = track.title;
    playerArtist.innerText = track.artist;
    playerThumb.src = track.album_art || '';

    // Update Full Player
    fullPlayerTitle.innerText = track.title;
    fullPlayerArtist.innerText = track.artist;
    fullPlayerArt.src = track.album_art || '';

    try {
        const response = await fetch(`/api/stream?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`);
        const data = await response.json();

        if (data.url) {
            audioEngine.src = data.url;
            audioEngine.play();
            isPlaying = true;
            updatePlayButtons();

            // Handle Video
            if (data.id) {
                videoContainerMobile.classList.remove('hidden');
                fullPlayerArt.classList.add('hidden');
                videoIframe.src = `https://www.youtube.com/embed/${data.id}?autoplay=1&mute=1`;
            } else {
                videoContainerMobile.classList.add('hidden');
                fullPlayerArt.classList.remove('hidden');
            }
        }
    } catch (err) { console.error(err); }
}

function togglePlay() {
    if (!audioEngine.src) return;
    isPlaying ? audioEngine.pause() : audioEngine.play();
    isPlaying = !isPlaying;
    updatePlayButtons();
}

function updatePlayButtons() {
    const icon = isPlaying ? 'fa-pause' : 'fa-play';
    playPauseBtnMini.className = `fas ${icon}`;
    playPauseBtnFull.innerHTML = `<i class="fas ${icon}"></i>`;
}

function updateProgress() {
    if (audioEngine.duration) {
        const percent = (audioEngine.currentTime / audioEngine.duration) * 100;
        progressBar.style.width = `${percent}%`;
        currentTimeEl.innerText = formatTime(audioEngine.currentTime);
        totalTimeEl.innerText = formatTime(audioEngine.duration);
    }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function playNextTrack() {
    let idx = currentQueue.findIndex(t => t.title === currentTrack.title);
    if (idx !== -1 && idx < currentQueue.length - 1) {
        playTrack(currentQueue[idx + 1]);
    }
}

function playPreviousTrack() {
    let idx = currentQueue.findIndex(t => t.title === currentTrack.title);
    if (idx > 0) {
        playTrack(currentQueue[idx - 1]);
    }
}

// --- Library ---
function renderLibrary() {
    const container = document.getElementById('sidebar-playlists');
    container.innerHTML = "";
    Object.keys(playlists).forEach(id => {
        const item = document.createElement('div');
        item.className = "recent-card";
        item.style.marginBottom = "10px";
        item.innerHTML = `
            <div style="width:56px; height:56px; background:#282828; display:flex; align-items:center; justify-content:center; border-radius:4px;">
                <i class="fas fa-music" style="color:#535353;"></i>
            </div>
            <div style="flex:1;">
                <div style="font-weight:700;">${playlists[id].name}</div>
                <div style="font-size:12px; color:#b3b3b3;">Playlist • ${playlists[id].tracks.length} songs</div>
            </div>
        `;
        item.onclick = () => showPlaylist(id);
        container.appendChild(item);
    });
}

function showPlaylist(id) {
    const pl = playlists[id];
    switchTab('view-playlist');
    document.getElementById('playlist-view-title').innerText = pl.name;
    document.getElementById('playlist-track-count').innerText = `${pl.tracks.length} songs`;
    renderTrackList(pl.tracks, document.getElementById('playlist-tracks'));
}
