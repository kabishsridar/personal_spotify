/** Spotify Web App Logic - THEATER MODE VERSION */

// State Management
let currentTrack = null;
let isPlaying = false;
let navigationHistory = ["home"]; 
let isSeeking = false;
let isVoluming = false;
let isMuted = false;
let isVideoOpen = false;
let isQueueOpen = false;
let currentQueue = []; // Holds the list of songs the user is currently playing (e.g. from search or playlist)
let manualQueue = [];  // Manual "Play Next" queue where users add songs explicitly
let isShuffled = false;
let isRepeated = false;

// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://127.0.0.1:8000' 
    : `http://${window.location.hostname}:8000`;

// Library & Playlists
let playlists = JSON.parse(localStorage.getItem('spotify_web_playlists')) || {
    "liked": { name: "Liked Songs", tracks: [] }
};

// HOME "FOLDERS" MOCK DATA
const HOME_FOLDERS = {
    "Starboy Collection": [
        { id: "1", title: "Starboy", artist: "The Weeknd", album_art: "https://upload.wikimedia.org/wikipedia/en/3/39/The_Weeknd_-_Starboy.png" },
        { id: "2", title: "Blinding Lights", artist: "The Weeknd", album_art: "https://upload.wikimedia.org/wikipedia/en/e/e6/The_Weeknd_-_Blinding_Lights.png" }
    ],
    "Ed Sheeran Mix": [
        { id: "3", title: "Shape of You", artist: "Ed Sheeran", album_art: "https://upload.wikimedia.org/wikipedia/en/4/45/Divide_cover.png" },
        { id: "4", title: "Perfect", artist: "Ed Sheeran", album_art: "https://upload.wikimedia.org/wikipedia/en/4/45/Divide_cover.png" }
    ],
    "A.R. Rahman Classics": [
        { id: "arr1", title: "Oru Nooru Murai", artist: "Sathya Prakash & Shakthisree Gopalan", album_art: "https://i.scdn.co/image/ab67616d0000b2730a597a78377fe725841cb027" }
    ]
};

// UI Elements
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerThumb = document.getElementById('player-thumb');
const playPauseBtn = document.getElementById('play-pause-btn');
const audioEngine = document.getElementById('audio-engine');
const progressBar = document.getElementById('playback-progress');
const progressBarBg = document.querySelector('.progress-bar');
const volumeBarBg = document.querySelector('.volume-bar');
const volumeProgress = document.querySelector('.volume-progress');
const btnMute = document.getElementById('btn-mute');
const btnAddCurrent = document.getElementById('btn-add-current-playlist');
const playlistDropdown = document.getElementById('playlist-select-menu');
const dropdownList = document.getElementById('dropdown-playlist-list');
const toastMsg = document.getElementById('toast-msg');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const btnShuffle = document.getElementById('btn-shuffle');
const btnRepeat = document.getElementById('btn-repeat');
const btnToggleQueue = document.getElementById('btn-toggle-queue');
const queueSidebar = document.getElementById('queue-sidebar');
const queueList = document.getElementById('queue-list');

// Video Sidebar elements
const mainContainer = document.getElementById('main-container');
const btnCloseVideo = document.getElementById('btn-close-video');
const videoSidebar = document.getElementById('video-sidebar');
const videoIframe = document.getElementById('video-iframe');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Spotify Web Engine: THEATER MODE ONLINE 🎬🚀");
    
    // INITIALIZE VOLUME SYNC 🔊
    audioEngine.volume = 0.7;
    if (volumeProgress) volumeProgress.style.width = "70%";
    
    renderSidebarPlaylists();
    setupEventListeners();
});

function setupEventListeners() {
    playPauseBtn.addEventListener('click', togglePlay);
    btnNext.addEventListener('click', playNextTrack);
    btnPrev.addEventListener('click', playPreviousTrack);
    btnShuffle.addEventListener('click', toggleShuffle);
    btnRepeat.addEventListener('click', toggleRepeat);
    btnToggleQueue.addEventListener('click', toggleQueueSidebar);
    audioEngine.addEventListener('timeupdate', () => { if (!isSeeking) updateProgress(); });
    audioEngine.addEventListener('ended', () => {
        if (isRepeated) playTrack(currentTrack);
        else playNextTrack();
    }); 
    btnMute.addEventListener('click', toggleMute);

    // --- Theater Mode Toggling ---
    playerTitle.addEventListener('click', toggleVideoSidebar);
    btnCloseVideo.addEventListener('click', closeVideoSidebar);

    // --- Home Card Listeners ---
    document.querySelectorAll('.recent-card').forEach(card => {
        card.addEventListener('click', () => {
            const folderName = card.querySelector('span').innerText;
            if (HOME_FOLDERS[folderName]) showFolder(folderName);
            else performSearch(folderName);
        });
    });

    // --- Language Card Listeners ---
    const languageCards = {
        'card-tamil': 'Tamil Trending Hits',
        'card-hindi': 'Hindi Global Popular',
        'card-english': 'English Billboard Pop',
        'card-malayalam': 'Malayalam Top Melodies',
        'card-telugu': 'Telugu Beats Trending'
    };
    Object.keys(languageCards).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => performSearch(languageCards[id]));
    });

    document.querySelectorAll('.genre-card').forEach(card => {
        if (!Object.keys(languageCards).includes(card.id)) {
            card.addEventListener('click', () => performSearch(card.innerText));
        }
    });

    // --- Navigation & Search ---
    const webSearchInput = document.getElementById('web-search-input');
    if (webSearchInput) {
        webSearchInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') performSearch(e.target.value);
        });
    }

    document.getElementById('nav-search').addEventListener('click', () => showView('search-view'));
    document.getElementById('m-nav-home')?.addEventListener('click', () => showView('home'));
    document.getElementById('m-nav-search')?.addEventListener('click', () => showView('search-view'));
    document.getElementById('m-nav-library')?.addEventListener('click', () => showView('playlist-view'));
    
    document.getElementById('btn-back').addEventListener('click', goBack);
    document.getElementById('btn-refresh').addEventListener('click', () => location.reload());
    document.getElementById('btn-create-playlist').addEventListener('click', createPlaylist);

    btnAddCurrent.addEventListener('click', (e) => { e.stopPropagation(); togglePlaylistMenu(); });
    document.addEventListener('click', () => playlistDropdown.style.display = 'none');

    // --- Sliders ---
    progressBarBg.addEventListener('mousedown', (e) => { isSeeking = true; updateSeekFromEvent(e); });
    volumeBarBg.addEventListener('mousedown', (e) => { isVoluming = true; updateVolumeFromEvent(e); });
    window.addEventListener('mousemove', (e) => {
        if (isSeeking) updateSeekFromEvent(e);
        if (isVoluming) updateVolumeFromEvent(e);
    });
    window.addEventListener('mouseup', () => { isSeeking = false; isVoluming = false; });

    function updateSeekFromEvent(e) {
        const rect = progressBarBg.getBoundingClientRect();
        const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        progressBar.style.width = `${percent * 100}%`;
        if (audioEngine.duration) audioEngine.currentTime = percent * audioEngine.duration;
    }

    function updateVolumeFromEvent(e) {
        if (!volumeBarBg || !audioEngine) return;
        const rect = volumeBarBg.getBoundingClientRect();
        const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        
        audioEngine.volume = percent;
        if (volumeProgress) volumeProgress.style.width = `${percent * 100}%`;
        
        isMuted = (percent === 0);
        updateVolumeIcon();
    }
}

// --- Theater Mode Logic ---
function toggleVideoSidebar() {
    if (!currentTrack) return;
    isVideoOpen ? closeVideoSidebar() : openVideoSidebar();
}

function openVideoSidebar() {
    if (!currentTrack || !currentTrack.youtube_id) return;
    isVideoOpen = true;
    mainContainer.classList.add('show-video');
    videoSidebar.style.width = "400px";
    
    // Construct Direct ID YouTube embed
    videoIframe.src = `https://www.youtube.com/embed/${currentTrack.youtube_id}?autoplay=1&mute=1`;
    document.getElementById('video-sidebar-title').innerText = `Watching: ${currentTrack.title}`;
}

function closeVideoSidebar() {
    isVideoOpen = false;
    updateLayout();
    videoSidebar.style.width = "0px";
    videoIframe.src = "";
}

// --- Queue Sidebar Logic ---
function toggleQueueSidebar() {
    isQueueOpen ? closeQueueSidebar() : openQueueSidebar();
}

function openQueueSidebar() {
    isQueueOpen = true;
    updateLayout();
    queueSidebar.style.width = "300px";
    renderQueue();
}

function closeQueueSidebar() {
    isQueueOpen = false;
    updateLayout();
    queueSidebar.style.width = "0px";
}

function updateLayout() {
    mainContainer.classList.remove('show-video', 'show-queue', 'show-both');
    if (isVideoOpen && isQueueOpen) mainContainer.classList.add('show-both');
    else if (isVideoOpen) mainContainer.classList.add('show-video');
    else if (isQueueOpen) mainContainer.classList.add('show-queue');
}

function renderQueue() {
    if (!queueList) return;
    queueList.innerHTML = "";
    
    const allTracks = [...manualQueue, ...currentQueue.slice(currentQueue.findIndex(t => t.id === currentTrack?.id) + 1)];
    
    if (allTracks.length === 0) {
        queueList.innerHTML = `<p style="color: grey; font-size: 14px;">Queue is empty.</p>`;
        return;
    }

    allTracks.forEach((track, i) => {
        const item = document.createElement('div');
        item.className = "queue-item";
        item.innerHTML = `
            <img src="${track.album_art || 'https://via.placeholder.com/40'}">
            <div class="queue-item-info">
                <h4>${track.title}</h4>
                <p>${track.artist}</p>
            </div>
        `;
        item.onclick = () => playTrack(track);
        queueList.appendChild(item);
    });
}

// --- Playlist Pop-up UI ---
function togglePlaylistMenu() {
    if (playlistDropdown.style.display === 'block') {
        playlistDropdown.style.display = 'none';
        return;
    }
    dropdownList.innerHTML = "";
    Object.keys(playlists).forEach(id => {
        const item = document.createElement('div');
        item.innerText = playlists[id].name;
        item.onclick = (e) => {
            e.stopPropagation();
            addToPlaylist(id, currentTrack);
            playlistDropdown.style.display = 'none';
        };
        dropdownList.appendChild(item);
    });
    playlistDropdown.style.display = 'block';
}

function showToast(msg) {
    toastMsg.innerText = msg;
    toastMsg.style.display = 'block';
    setTimeout(() => { toastMsg.style.display = 'none'; }, 2000);
}

// --- Library & Playlist Management ---
function renderSidebarPlaylists() {
    const list = document.getElementById('sidebar-playlists');
    list.innerHTML = "";
    Object.keys(playlists).forEach(id => {
        const item = document.createElement('a');
        item.href = "#";
        item.className = "sidebar-pl-item";
        item.innerText = playlists[id].name;
        item.onclick = () => showPlaylist(id);
        list.appendChild(item);
    });
}

function createPlaylist() {
    const name = prompt("Playlist Name:");
    if (!name) return;
    const id = "pl_" + Date.now();
    playlists[id] = { name: name, tracks: [] };
    savePlaylists();
    renderSidebarPlaylists();
    showToast(`Playlist '${name}' Created ✨`);
}

function renamePlaylist(id) {
    if (!playlists[id]) return;
    const newName = prompt("Enter New Playlist Name:", playlists[id].name);
    if (!newName) return;
    
    playlists[id].name = newName;
    savePlaylists();
    renderSidebarPlaylists();
    document.getElementById('playlist-view-title').innerText = newName;
    showToast("Playlist Renamed! ✨");
}

function removeTrackFromPlaylist(plId, trackId) {
    if (!playlists[plId]) return;
    playlists[plId].tracks = playlists[plId].tracks.filter(t => t.id !== trackId);
    savePlaylists();
    showPlaylist(plId); // Re-render current view
    showToast("Track Removed! 🗑️");
}

function savePlaylists() {
    localStorage.setItem('spotify_web_playlists', JSON.stringify(playlists));
}

function addToPlaylist(id, track) {
    if (!track) return;
    if (playlists[id].tracks.some(t => t.id === track.id)) {
        showToast("Already in Playlist 🎧");
        return;
    }
    playlists[id].tracks.push(track);
    savePlaylists();
    showToast(`Added to ${playlists[id].name} ✨`);
}

function showPlaylist(id) {
    const pl = playlists[id];
    showView('playlist-view');
    
    const titleEl = document.getElementById('playlist-view-title');
    titleEl.innerText = pl.name;
    titleEl.style.cursor = "pointer";
    titleEl.title = "Click to rename";
    titleEl.onclick = () => renamePlaylist(id);
    
    document.getElementById('playlist-track-count').innerText = `${pl.tracks.length} songs saved`;
    renderTrackList(pl.tracks, document.getElementById('playlist-tracks'), id);
}

// --- Folder Management ---
function showFolder(name) {
    const tracks = HOME_FOLDERS[name];
    showView('playlist-view');
    document.getElementById('playlist-view-title').innerText = name;
    document.getElementById('playlist-track-count').innerText = `${tracks.length} songs in collection`;
    renderTrackList(tracks, document.getElementById('playlist-tracks'));
}

// --- Navigation Engine ---
function goBack() {
    if (navigationHistory.length > 1) {
        navigationHistory.pop();
        _internalShowView(navigationHistory[navigationHistory.length - 1], false);
    }
}

function showView(viewId) {
    if (navigationHistory[navigationHistory.length - 1] !== viewId) {
        navigationHistory.push(viewId);
    }
    _internalShowView(viewId, true);
    
    if (viewId === 'search-view') {
        document.getElementById('search-placeholder-content').classList.remove('hidden');
        document.getElementById('results-list').classList.add('hidden');
        document.getElementById('web-search-input').value = "";
    }
}

function _internalShowView(viewId, updateSidebar = true) {
    document.querySelectorAll('.content-view').forEach(v => v.classList.add('hidden'));
    const view = document.getElementById(viewId);
    if (view) view.classList.remove('hidden');

    if (updateSidebar) {
        document.querySelectorAll('.menu a, .mobile-nav a').forEach(a => a.classList.remove('active'));
        if (viewId === 'home') {
            document.getElementById('nav-home').classList.add('active');
            document.getElementById('m-nav-home')?.classList.add('active');
        }
        if (viewId === 'search-view') {
            document.getElementById('nav-search').classList.add('active');
            document.getElementById('m-nav-search')?.classList.add('active');
        }
        if (viewId === 'playlist-view') {
            document.getElementById('m-nav-library')?.classList.add('active');
        }
    }
}

// --- Search Engine ---
async function performSearch(query) {
    if(!query) return;
    showView('search-view');
    
    document.getElementById('search-placeholder-content').classList.add('hidden');
    document.getElementById('results-list').classList.remove('hidden');
    document.getElementById('results-list').innerHTML = `<p style="padding: 20px; color: grey;">Searching global music database for '${query}'...</p>`;

    try {
        const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
        const tracks = await response.json();
        renderTrackList(tracks, document.getElementById('results-list'));
    } catch (err) { console.error(err); }
}

function renderTrackList(tracks, container, currentPlaylistId = null) {
    container.innerHTML = "";
    
    // UPDATE GLOBAL QUEUE: When the user sees a list, it becomes the potential queue
    currentQueue = tracks; 
    
    if (tracks.length === 0) {
        container.innerHTML = `<p style="padding: 20px; color: grey;">No hits found.</p>`;
        return;
    }
    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = "recent-card";
        item.style.marginBottom = "10px";
        
        const art = track.album_art || "";
        // Use a placeholder icon if art is missing, ensuring no numbers are shown in the grid
        const artDisplay = art 
            ? `<img src="${art}" style="width:80px; height:80px; object-fit:cover; border-radius:4px;">` 
            : `<div style="width:80px;height:80px;background:#282828;display:flex;align-items:center;justify-content:center;"><i class="fas fa-music" style="color:#555;font-size:24px;"></i></div>`;

        // If in a playlist, show trash icon
        const actionHtml = currentPlaylistId 
            ? `<i class="fas fa-trash btn-remove-track" style="color: #b3b3b3; cursor: pointer; margin-right: 15px;"></i>` 
            : ``;

        item.innerHTML = `
            ${artDisplay}
            <div style="flex:1; padding-left:16px;">
                <div style="font-weight:700;">${track.title}</div>
                <div style="font-size:12px; color:#b3b3b3;">${track.artist}</div>
            </div>
            <div style="display: flex; align-items: center; margin-right: 20px; gap: 15px;">
                ${actionHtml}
                <div style="font-size:16px; color:#b3b3b3; cursor:pointer;" class="btn-queue-track" title="Add to Queue"><i class="fas fa-plus"></i></div>
                <div style="font-size:24px; color:#1db954; cursor:pointer;" class="btn-play-track"><i class="fas fa-play-circle"></i></div>
            </div>
        `;
        
        item.querySelector('.btn-play-track').onclick = () => {
             // When a user explicitly plays a song from a list, that list becomes the context queue
             currentQueue = tracks;
             playTrack(track);
        };

        item.querySelector('.btn-queue-track').onclick = (e) => {
            e.stopPropagation();
            manualQueue.push(track);
            renderQueue();
            showToast(`Added '${track.title}' to queue ✨`);
        };
        
        if (currentPlaylistId) {
            item.querySelector('.btn-remove-track').onclick = (e) => {
                e.stopPropagation();
                removeTrackFromPlaylist(currentPlaylistId, track.id);
            };
        }
        
        container.appendChild(item);
    });
}

// --- Audio & Playback ---
async function playTrack(track) {
    currentTrack = track;
    playerTitle.innerText = track.title;
    playerArtist.innerText = track.artist;
    playerThumb.src = track.album_art || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop';
    btnAddCurrent.style.display = 'block';

    try {
        const response = await fetch(`${API_BASE_URL}/api/stream?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`);
        const data = await response.json();
        
        if (data.url) {
            currentTrack.youtube_id = data.id; // Store ID for video
            audioEngine.src = data.url;
            audioEngine.play();
            isPlaying = true;
            updatePlayButton();
            
            // Sync Video if sidebar is open
            if (isVideoOpen) {
                videoIframe.src = `https://www.youtube.com/embed/${data.id}?autoplay=1&mute=1`;
                document.getElementById('video-sidebar-title').innerText = `Watching: ${track.title}`;
            }

            renderQueue();
        }
    } catch (err) { console.error(err); }
}

/** AUTO-PLAY ENGINE: Finds the next song in the order */
function playNextTrack() {
    // 1. Check manual queue first
    if (manualQueue.length > 0) {
        const nextTrack = manualQueue.shift();
        console.log("Playing from manual queue: ", nextTrack.title);
        playTrack(nextTrack);
        return;
    }

    // 2. Otherwise play from current context queue
    if (currentQueue.length === 0 || !currentTrack) return;
    
    // Find where we are in the list
    let currentIndex = currentQueue.findIndex(t => t.id === currentTrack.id);
    
    // If not found in current queue, we can't really do "next" unless we default to start
    if (currentIndex === -1) currentIndex = -1;

    let nextIndex;
    if (isShuffled) {
        nextIndex = Math.floor(Math.random() * currentQueue.length);
    } else {
        nextIndex = currentIndex + 1;
    }

    // If there's a next song, play it!
    if (nextIndex < currentQueue.length) {
        console.log("Auto-playing next track: ", currentQueue[nextIndex].title, "...");
        playTrack(currentQueue[nextIndex]);
    } else {
        console.log("End of queue reached.");
        // Optional: Loop back if it's the only playlist
        isPlaying = false;
        updatePlayButton();
    }
}

/** GO BACK: Plays the previous song */
function playPreviousTrack() {
    if (!currentTrack) return;

    // Check if we are at start of song, if so, go back one song
    if (audioEngine.currentTime > 3) {
        audioEngine.currentTime = 0;
        return;
    }

    if (currentQueue.length === 0) return;

    let currentIndex = currentQueue.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
        playTrack(currentQueue[currentIndex - 1]);
    } else {
        // Optional: Start of playlist reached
        audioEngine.currentTime = 0;
    }
}

function togglePlay() {
    if (!audioEngine.src) return;
    isPlaying ? audioEngine.pause() : audioEngine.play();
    isPlaying = !isPlaying;
    updatePlayButton();
}

function toggleMute() { isMuted = !isMuted; audioEngine.muted = isMuted; updateVolumeIcon(); }

function toggleShuffle() {
    isShuffled = !isShuffled;
    btnShuffle.style.color = isShuffled ? "#1db954" : "white";
    showToast(`Shuffle ${isShuffled ? "ON" : "OFF"} 🔀`);
}

function toggleRepeat() {
    isRepeated = !isRepeated;
    btnRepeat.style.color = isRepeated ? "#1db954" : "white";
    showToast(`Repeat ${isRepeated ? "ON" : "OFF"} 🔁`);
}

function updateVolumeIcon() {
    btnMute.className = isMuted ? "fas fa-volume-mute" : "fas fa-volume-up";
}

function updatePlayButton() {
    playPauseBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

function updateProgress() {
    if (audioEngine.duration) {
        const percent = (audioEngine.currentTime / audioEngine.duration) * 100;
        progressBar.style.width = `${percent}%`;
        document.getElementById('current-time').innerText = formatTime(audioEngine.currentTime);
        document.getElementById('total-time').innerText = formatTime(audioEngine.duration);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Final Cleanup: Duplicate definitions removed.
