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
let prefetchedStreamCache = new Map(); // trackId -> { source, url }
let autoplayRecommendations = []; // Related tracks for autoplay
let hasPrefetchedNext = false;
let isBackupPlaying = false; // Flag to track if we fell back to the YouTube iframe
let backupEndTimer = null; // Timer to auto-advance to next song on iframe play end
let lastSyncedSecond = -1; // Prevent spamming seek commands to YouTube iframe
let isLoadingTrack = false; // Suppress spurious pause events during track loading
let currentSearchQuery = "";
let currentSearchOffset = 0;
let isSearchLoading = false;
let hasMoreSearchSongs = true;
let ytPlayer = null; // YouTube IFrame API player instance
let videoSyncInterval = null; // Interval for smooth video-audio sync
let isVideoBuffering = false; // Track video buffer state

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout")), ms);
        promise.then(
            (res) => { clearTimeout(timer); resolve(res); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

// API Configuration
// TIP: When running on a phone, you must set 'backend_ip' in localStorage to your computer's local IP (e.g., 192.168.1.10) or a cloud backend URL
let savedIp = localStorage.getItem('backend_ip');
let API_BASE_URL = window.location.origin; // Default to host origin

if (savedIp) {
    if (savedIp.startsWith('http://') || savedIp.startsWith('https://')) {
        API_BASE_URL = savedIp;
    } else if (savedIp.includes('.') && !savedIp.match(/^[0-9.]+$/)) {
        API_BASE_URL = `https://${savedIp}`;
    } else {
        API_BASE_URL = `http://${savedIp}:8000`;
    }
} else {
    // If no saved IP, default to local machine if running locally
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        API_BASE_URL = 'http://127.0.0.1:8000';
    }
}

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
    // Ensure the page can receive keyboard events even if no element is focused
    // Make body focusable and set initial focus
    if (!document.body.hasAttribute('tabindex')) {
        document.body.setAttribute('tabindex', '0');
    }
    document.body.focus();
    console.log("Spotify Web Engine: THEATER MODE ONLINE 🎬🚀");

    // Initialize YouTube IFrame API for proper synchronization
    initializeYouTubeAPI();

    // INITIALIZE VOLUME SYNC 🔊
    audioEngine.volume = 0.7;
    if (volumeProgress) volumeProgress.style.width = "70%";

    renderSidebarPlaylists();
    setupEventListeners();
});

// YouTube IFrame API initialization
function initializeYouTubeAPI() {
    // Load YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // API will call this function when ready
    window.onYouTubeIframeAPIReady = function() {
        console.log("YouTube IFrame API ready for synchronization");
    };

    // Listen to YouTube player state changes
    window.onYouTubeStateChange = function(event) {
        const state = event.data;
        switch(state) {
            case 1: // Playing
                isVideoBuffering = false;
                break;
            case 2: // Paused
                isVideoBuffering = false;
                break;
            case 3: // Buffering
                isVideoBuffering = true;
                break;
            case 5: // Cued
                isVideoBuffering = false;
                break;
        }
    };
}

// Keyboard Shortcuts Handler
function handleKeyboardShortcuts(e) {
    // Don't trigger shortcuts when typing in inputs or editable elements
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    // Normalise key identifier — prefer e.code (physical key) then fall back to e.key
    const key = e.code || e.key;

    // Keys we handle — always prevent default to stop browser scroll/navigation
    const handled = {
        'Space': true, ' ': true,
        'ArrowUp': true, 'Up': true,
        'ArrowDown': true, 'Down': true,
        'ArrowLeft': true, 'Left': true,
        'ArrowRight': true, 'Right': true,
        'KeyL': true, 'l': true,
        'KeyS': true, 's': true,
        'KeyM': true, 'm': true,
        'KeyV': true, 'v': true,
        'KeyQ': true, 'q': true,
        'KeyN': true, 'n': true,
        'KeyP': true, 'p': true,
        'KeyR': true, 'r': true,
        'KeyF': true, 'f': true,
        'Slash': true, '?': true,
    };
    if (!handled[key]) return;

    e.preventDefault();
    e.stopPropagation();

    // Blur the currently focused element so Space doesn't re-click buttons
    if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
    }

    if (key === 'Space' || key === ' ') {
        togglePlay();

    } else if (key === 'ArrowUp' || key === 'Up') {
        adjustVolume(0.1);

    } else if (key === 'ArrowDown' || key === 'Down') {
        adjustVolume(-0.1);

    } else if (key === 'ArrowLeft' || key === 'Left') {
        if (audioEngine.src && !isSeeking) {
            audioEngine.currentTime = Math.max(0, audioEngine.currentTime - 10);
            showToast('⏪ -10s');
            if (isVideoOpen) syncVideoIframeToAudio();
        } else if (isBackupPlaying) {
            // For backup YouTube player, seek via postMessage
            if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [Math.max(0, (ytPlayer ? ytPlayer.getCurrentTime() : 0) - 10), true] }), '*'); } catch(e) {}
            }
            showToast('⏪ -10s');
        }

    } else if (key === 'ArrowRight' || key === 'Right') {
        if (audioEngine.src && !isSeeking) {
            audioEngine.currentTime = Math.min(audioEngine.duration || audioEngine.currentTime + 60, audioEngine.currentTime + 10);
            showToast('⏩ +10s');
            if (isVideoOpen) syncVideoIframeToAudio();
        } else if (isBackupPlaying) {
            if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [(ytPlayer ? ytPlayer.getCurrentTime() : 0) + 10, true] }), '*'); } catch(e) {}
            }
            showToast('⏩ +10s');
        }

    } else if (key === 'KeyL' || key === 'l') {
        toggleRepeat();  // toggleRepeat already shows toast

    } else if (key === 'KeyS' || key === 's') {
        toggleShuffle(); // toggleShuffle already shows toast

    } else if (key === 'KeyM' || key === 'm') {
        toggleMute();
        showToast(isMuted ? '🔇 Muted' : '🔊 Unmuted');

    } else if (key === 'KeyV' || key === 'v') {
        toggleVideoSidebar();

    } else if (key === 'KeyQ' || key === 'q') {
        toggleQueueSidebar();

    } else if (key === 'KeyN' || key === 'n') {
        playNextTrack();

    } else if (key === 'KeyP' || key === 'p') {
        playPreviousTrack();

    } else if (key === 'KeyR' || key === 'r') {
        restartTrack();

    } else if (key === 'KeyF' || key === 'f') {
        // Fullscreen the video panel if open, otherwise the page
        const videoContainer = document.querySelector('.video-container');
        const target = (isVideoOpen && videoContainer) ? videoContainer : document.documentElement;
        if (target.requestFullscreen) target.requestFullscreen();
        else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();

    } else if (key === 'Slash' || key === '?') {
        const modal = document.getElementById('shortcuts-modal');
        if (modal) modal.classList.toggle('hidden');
    }
}


// Volume adjustment helper
function adjustVolume(delta) {
    if (!audioEngine) return;
    const oldVolume = audioEngine.volume;
    let newVolume = oldVolume + delta;
    // Clamp between 0 and 1
    newVolume = Math.max(0, Math.min(1, newVolume));
    audioEngine.volume = newVolume;
    // Un-mute if muted and user is raising volume
    if (isMuted && delta > 0) {
        isMuted = false;
        audioEngine.muted = false;
    }
    if (newVolume < 0.01) {
        isMuted = true;
        audioEngine.muted = true;
    }
    if (volumeProgress) volumeProgress.style.width = `${newVolume * 100}%`;
    updateVolumeIcon();
    showToast(`Volume: ${Math.round(newVolume * 100)}%`);
}

function setupEventListeners() {
    // Ensure focus for keyboard shortcuts after any UI changes
    if (!document.body.hasAttribute('tabindex')) {
        document.body.setAttribute('tabindex', '0');
    }
    document.body.focus();
    playPauseBtn.addEventListener('click', togglePlay);
    btnNext.addEventListener('click', playNextTrack);
    btnPrev.addEventListener('click', playPreviousTrack);
    btnShuffle.addEventListener('click', toggleShuffle);
    btnRepeat.addEventListener('click', toggleRepeat);
    btnToggleQueue.addEventListener('click', toggleQueueSidebar);
    audioEngine.addEventListener('timeupdate', () => { if (!isSeeking) updateProgress(); });

    // Keyboard Shortcuts
    window.addEventListener('keydown', handleKeyboardShortcuts, true);

    // Airtight Video-Audio Synchronization Event Listeners
    audioEngine.addEventListener('waiting', () => {
        if (isVideoOpen && !isSeeking) {
            if (ytPlayer) {
                ytPlayer.pauseVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); } catch(e) {}
            }
        }
    });
    audioEngine.addEventListener('playing', () => {
        if (isVideoOpen && !isSeeking) {
            if (ytPlayer) {
                ytPlayer.playVideo();
            } else if (videoIframe && videoIframe.src) {
                try {
                    videoIframe.contentWindow.postMessage(
                        JSON.stringify({
                            event: 'command',
                            func: 'seekTo',
                            args: [audioEngine.currentTime, true]
                        }),
                        '*'
                    );
                    videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                } catch(e) {}
            }
        }
    });
    audioEngine.addEventListener('pause', () => {
        // Suppress spurious pause events fired by audioEngine.load() during track switching
        if (isLoadingTrack || isSeeking) return;
        if (isVideoOpen) {
            if (ytPlayer) {
                ytPlayer.pauseVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); } catch(e) {}
            }
        }
    });
    audioEngine.addEventListener('ended', () => {
        if (isRepeated) playTrack(currentTrack);
        else playNextTrack();
    });
    audioEngine.addEventListener('error', (e) => {
        console.warn("Audio engine encountered error. Falling back to official YouTube Player in sidebar...", e);
        const ytId = currentTrack?.youtube_id;
        if (ytId) {
            isBackupPlaying = true;
            showToast("Direct stream failed, using backup player... 🔄");

            // Open the video sidebar so the user can see/control the video
            if (!isVideoOpen) {
                toggleVideoSidebar();
            }
            videoIframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&controls=0&enablejsapi=1`;
            isPlaying = true;
            updatePlayButton();

            // Auto-advance timer when backup ends
            if (backupEndTimer) clearTimeout(backupEndTimer);
            if (currentTrack && currentTrack.duration) {
                const durationMs = currentTrack.duration * 1000;
                console.log(`[Backup] Setting auto-advance timer for duration: ${currentTrack.duration}s`);
                backupEndTimer = setTimeout(() => {
                    if (isBackupPlaying && isPlaying) {
                        console.log("[Backup] Song ended, auto-advancing to next track.");
                        playNextTrack();
                    }
                }, durationMs);
            }
        } else {
            showToast("Playback error: no backup video ID found.");
        }
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

    document.getElementById('nav-home')?.addEventListener('click', () => showView('home'));
    document.getElementById('nav-search')?.addEventListener('click', () => showView('search-view'));
    document.getElementById('nav-library')?.addEventListener('click', () => showView('playlist-view'));
    document.getElementById('m-nav-home')?.addEventListener('click', () => showView('home'));
    document.getElementById('m-nav-search')?.addEventListener('click', () => showView('search-view'));
    document.getElementById('m-nav-library')?.addEventListener('click', () => showView('playlist-view'));
    
    document.getElementById('btn-back').addEventListener('click', goBack);
    document.getElementById('btn-refresh').addEventListener('click', () => location.reload());
    document.getElementById('btn-create-playlist').addEventListener('click', createPlaylist);

    // --- Connect Modal Listeners ---
    const btnConnect = document.getElementById('btn-connect-mobile');
    const connectModal = document.getElementById('connect-modal');
    const btnSaveIp = document.getElementById('btn-save-ip');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const inputIp = document.getElementById('input-backend-ip');

    if (btnConnect) {
        btnConnect.addEventListener('click', () => {
            inputIp.value = localStorage.getItem('backend_ip') || "";
            connectModal.classList.remove('hidden');
        });
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => connectModal.classList.add('hidden'));
    }

    if (btnSaveIp) {
        btnSaveIp.addEventListener('click', () => {
            const ip = inputIp.value.trim();
            if (ip) {
                localStorage.setItem('backend_ip', ip);
                showToast("Connected to Computer! 🚀");
                setTimeout(() => location.reload(), 1000); // Reload to apply new connection
            } else {
                localStorage.removeItem('backend_ip');
                location.reload();
            }
            connectModal.classList.add('hidden');
        });
    }

    btnAddCurrent.addEventListener('click', (e) => { e.stopPropagation(); togglePlaylistMenu(); });
    document.addEventListener('click', () => playlistDropdown.style.display = 'none');

    // --- Sliders ---
    progressBarBg.addEventListener('mousedown', (e) => { isSeeking = true; updateSeekFromEvent(e); });
    volumeBarBg.addEventListener('mousedown', (e) => { isVoluming = true; updateVolumeFromEvent(e); });
    window.addEventListener('mousemove', (e) => {
        if (isSeeking) updateSeekFromEvent(e);
        if (isVoluming) updateVolumeFromEvent(e);
    });
    window.addEventListener('mouseup', () => {
        if (isSeeking) {
            isSeeking = false;
            syncVideoIframeToAudio();
        }
        isVoluming = false;
    });

    function updateSeekFromEvent(e) {
        const rect = progressBarBg.getBoundingClientRect();
        const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        progressBar.style.width = `${percent * 100}%`;
        
        const totalDuration = audioEngine.duration || (currentTrack ? currentTrack.duration : 0);
        if (totalDuration) {
            const seconds = percent * totalDuration;
            if (audioEngine.duration) {
                audioEngine.currentTime = seconds;
            }

            // If using backup end timer, we must recalculate the remaining duration!
            if (isBackupPlaying) {
                if (backupEndTimer) clearTimeout(backupEndTimer);
                if (isPlaying) {
                    const remainingMs = (totalDuration - seconds) * 1000;
                    backupEndTimer = setTimeout(() => {
                        if (isBackupPlaying && isPlaying) {
                            playNextTrack();
                        }
                    }, remainingMs);
                }
            }
        }
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

    // Custom Video Fullscreen listener
    const btnFullscreenVideo = document.getElementById('btn-fullscreen-video');
    const videoContainer = document.querySelector('.video-container');
    if (btnFullscreenVideo && videoContainer) {
        btnFullscreenVideo.addEventListener('click', () => {
            if (videoContainer.requestFullscreen) {
                videoContainer.requestFullscreen();
            } else if (videoContainer.webkitRequestFullscreen) {
                videoContainer.webkitRequestFullscreen();
            } else if (videoContainer.msRequestFullscreen) {
                videoContainer.msRequestFullscreen();
            }
        });
    }

    // Scroll listener on main-content for infinite scroll pagination
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.addEventListener('scroll', () => {
            const searchView = document.getElementById('search-view');
            if (searchView && !searchView.classList.contains('hidden')) {
                // Trigger load when user scrolls within 120px of the bottom
                if (mainContent.scrollTop + mainContent.clientHeight >= mainContent.scrollHeight - 120) {
                    loadMoreSearchSongs();
                }
            }
        });
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

    // Use YouTube IFrame API for better sync control
    const startSec = audioEngine.currentTime || 0;

    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        // If API is ready, use it for precise control
        ytPlayer.stopVideo();

        // Create player with exact start time
        ytPlayer.loadVideoById({
            videoId: currentTrack.youtube_id,
            startSeconds: startSec,
            endSeconds: currentTrack.duration || undefined
        });

        // Wait a moment for video to load, then start sync interval
        setTimeout(() => {
            if (isPlaying) {
                ytPlayer.playVideo();
            }

            // Start smooth sync interval
            if (videoSyncInterval) clearInterval(videoSyncInterval);
            videoSyncInterval = setInterval(() => {
                if (!isVideoBuffering && !isSeeking && isPlaying && ytPlayer) {
                    const audioTime = audioEngine.currentTime;
                    const ytTime = ytPlayer.getCurrentTime() || 0;
                    const drift = Math.abs(audioTime - ytTime);

                    // Only sync if drift is more than 0.3 seconds (stricter)
                    if (drift > 0.3) {
                        ytPlayer.seekTo(audioTime, true);
                        console.log(`[Sync] Corrected ${drift.toFixed(2)}s drift`);
                    }
                }
            }, 250); // Check every 250ms for tighter sync
        }, 300);
    } else {
        // Fallback to iframe embed with precise start time
        videoIframe.src = `https://www.youtube.com/embed/${currentTrack.youtube_id}?autoplay=1&controls=0&enablejsapi=1&start=${startSec.toFixed(1)}`;

        // Launch a sync worker to keep iframe in sync via postMessage
        if (videoSyncInterval) clearInterval(videoSyncInterval);
        videoSyncInterval = setInterval(() => {
            if (isPlaying && videoIframe && videoIframe.contentWindow) {
                try {
                    const audioTime = audioEngine.currentTime;
                    videoIframe.contentWindow.postMessage(
                        JSON.stringify({
                            event: 'command',
                            func: 'seekTo',
                            args: [audioTime, false]
                        }),
                        '*'
                    );
                } catch(e) {}
            }
        }, 500);
    }

    document.getElementById('video-sidebar-title').innerText = `Watching: ${currentTrack.title}`;

    // Force focus on body to ensure keyboard shortcuts work
    document.body.focus();
}

function closeVideoSidebar() {
    isVideoOpen = false;

    // Clear sync interval
    if (videoSyncInterval) {
        clearInterval(videoSyncInterval);
        videoSyncInterval = null;
    }

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
    
    // Reset infinite scroll variables
    currentSearchQuery = query;
    currentSearchOffset = 20; // Page 1 fetches 20 tracks (0 to 19), next offset is 20
    isSearchLoading = false;
    hasMoreSearchSongs = true;
    
    const existingEndMsg = document.getElementById('search-end-msg');
    if (existingEndMsg) existingEndMsg.remove();
    
    const existingLoader = document.getElementById('search-loading-dots');
    if (existingLoader) existingLoader.remove();
    
    document.getElementById('search-placeholder-content').classList.add('hidden');
    document.getElementById('results-list').classList.remove('hidden');
    document.getElementById('results-list').innerHTML = `<p style="padding: 20px; color: grey;">Searching global music database for '${query}'...</p>`;

    try {
        const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}&limit=20&offset=0`);
        const tracks = await response.json();
        renderTrackList(tracks, document.getElementById('results-list'));
    } catch (err) { console.error(err); }
}

async function loadMoreSearchSongs() {
    if (isSearchLoading || !hasMoreSearchSongs || !currentSearchQuery) return;
    
    isSearchLoading = true;
    const list = document.getElementById('results-list');
    const mainContent = document.querySelector('.main-content');
    
    // Show three dots animated loader
    let loader = document.getElementById('search-loading-dots');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'search-loading-dots';
        loader.className = 'loading-dots';
        loader.innerHTML = '<span></span><span></span><span></span>';
        list.appendChild(loader);
    } else {
        loader.classList.remove('hidden');
    }
    
    // Smoothly scroll down to show the loader dots
    mainContent.scrollTo({
        top: mainContent.scrollHeight,
        behavior: 'smooth'
    });

    try {
        const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(currentSearchQuery)}&limit=40&offset=${currentSearchOffset}`);
        const tracks = await response.json();
        
        // Hide loader
        loader.classList.add('hidden');
        
        if (!tracks || tracks.length === 0) {
            hasMoreSearchSongs = false;
            showSearchEndMessage();
            return;
        }
        
        // Append new tracks to our DOM and queue!
        appendTracksToSearch(tracks);
        
        currentSearchOffset += tracks.length;
        
        // If we got fewer tracks than requested, we've reached the end
        if (tracks.length < 40) {
            hasMoreSearchSongs = false;
            showSearchEndMessage();
        }
    } catch(err) {
        console.error("Failed to load more search results:", err);
        loader.classList.add('hidden');
    } finally {
        isSearchLoading = false;
    }
}

function appendTracksToSearch(newTracks) {
    const container = document.getElementById('results-list');
    const loader = document.getElementById('search-loading-dots');
    
    // Append to global queue
    currentQueue = currentQueue.concat(newTracks);
    const updatedQueue = currentQueue;
    
    newTracks.forEach((track) => {
        const item = document.createElement('div');
        item.className = "recent-card";
        item.style.marginBottom = "10px";
        
        const art = track.album_art || "";
        const artDisplay = art 
            ? `<img src="${art}" style="width:80px; height:80px; object-fit:cover; border-radius:4px;">` 
            : `<div style="width:80px;height:80px;background:#282828;display:flex;align-items:center;justify-content:center;"><i class="fas fa-music" style="color:#555;font-size:24px;"></i></div>`;

        item.innerHTML = `
            ${artDisplay}
            <div style="flex:1; padding-left:16px;">
                <div style="font-weight:700;">${track.title}</div>
                <div style="font-size:12px; color:#b3b3b3;">${track.artist}</div>
            </div>
            <div style="display: flex; align-items: center; margin-right: 20px; gap: 15px;">
                <div style="font-size:16px; color:#b3b3b3; cursor:pointer;" class="btn-queue-track" title="Add to Queue"><i class="fas fa-plus"></i></div>
                <div style="font-size:24px; color:#1db954; cursor:pointer;" class="btn-play-track"><i class="fas fa-play-circle"></i></div>
            </div>
        `;
        
        item.querySelector('.btn-play-track').onclick = () => {
             currentQueue = updatedQueue;
             playTrack(track);
        };
        
        item.querySelector('.btn-queue-track').onclick = (e) => {
            e.stopPropagation();
            manualQueue.push(track);
            renderQueue();
            showToast(`Added '${track.title}' to queue ✨`);
        };
        
        if (loader) {
            container.insertBefore(item, loader);
        } else {
            container.appendChild(item);
        }
    });
}

function showSearchEndMessage() {
    const list = document.getElementById('results-list');
    let msg = document.getElementById('search-end-msg');
    if (!msg) {
        msg = document.createElement('div');
        msg.id = 'search-end-msg';
        msg.style.padding = '20px';
        msg.style.color = 'grey';
        msg.style.textAlign = 'center';
        msg.style.width = '100%';
        msg.innerHTML = '<p>You\'ve reached the end of relevant songs. 🎵</p>';
        list.appendChild(msg);
    }
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
async function resolveStreamUrl(track) {
    try {
        const response = await withTimeout(
            fetch(`${API_BASE_URL}/api/stream?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`),
            10000
        );
        if (!response.ok) throw new Error("Server error");
        const data = await response.json();
        return data;
    } catch (e) {
        console.error("Stream resolution failed or timed out:", e);
        return null;
    }
}

async function fetchAutoplayRecommendations(track) {
    if (!track) return;
    console.log("[Autoplay] Fetching related tracks in background for:", track.title);
    try {
        const query = `${track.title} ${track.artist || ''} radio`;
        const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        if (results && results.length > 0) {
            const filtered = results.filter(t => t.id !== track.id);
            autoplayRecommendations = filtered;
            console.log("[Autoplay SUCCESS] Cached", autoplayRecommendations.length, "related tracks.");
            
            let idx = currentQueue.findIndex(t => t.id === currentTrack?.id);
            if (idx !== -1 && idx === currentQueue.length - 1 && !hasPrefetchedNext) {
                prefetchNextTrack();
            }
        }
    } catch(e) {
        console.warn("[Autoplay] Failed to retrieve recommendations:", e);
    }
}

async function playTrack(track) {
    // Stop any active playback immediately & reset media pipeline to prevent DOMException interruptions
    audioEngine.pause();
    audioEngine.src = "";
    isBackupPlaying = false;
    lastSyncedSecond = -1; // Reset periodic sync reference
    if (backupEndTimer) {
        clearTimeout(backupEndTimer);
        backupEndTimer = null;
    }

    currentTrack = track;
    playerTitle.innerText = track.title;
    playerArtist.innerText = track.artist;
    playerThumb.src = track.album_art || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop';
    btnAddCurrent.style.display = 'block';

    hasPrefetchedNext = false; // Reset smart prefetch trigger
    fetchAutoplayRecommendations(track);

    let data = null;
    if (prefetchedStreamCache.has(track.id)) {
        data = prefetchedStreamCache.get(track.id);
        prefetchedStreamCache.delete(track.id);
        console.log("[Cache HIT] Using prefetched stream for:", track.title);
    } else {
        data = await resolveStreamUrl(track);
    }

    if (data && data.url && currentTrack && currentTrack.id === track.id) {
        currentTrack.youtube_id = data.id; // Store ID for video
        isLoadingTrack = true; // Suppress pause event from audioEngine.load()
        audioEngine.src = `${API_BASE_URL}/api/proxy?url=${encodeURIComponent(data.url)}`;
        audioEngine.load(); // Clean reset & load new source
        isLoadingTrack = false;
        audioEngine.play().then(() => {
            console.log("Playback started successfully.");
        }).catch(err => {
            console.warn("Playback play() failed to start:", err);
        });
        isPlaying = true;
        updatePlayButton();
        
        // Sync Video if sidebar is open - now uses API for perfect sync
        if (isVideoOpen && currentTrack.youtube_id) {
            if (ytPlayer) {
                ytPlayer.stopVideo();
                ytPlayer.seekTo(audioEngine.currentTime, true);
                ytPlayer.playVideo();
            } else {
                videoIframe.src = `https://www.youtube.com/embed/${data.id}?autoplay=1&controls=0&enablejsAPI=1`;
            }
            document.getElementById('video-sidebar-title').innerText = `Watching: ${track.title}`;
        }

        renderQueue();
    }
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
        // Sequential queue exhausted, transition to Autoplay recommendations
        if (autoplayRecommendations.length > 0) {
            const nextRec = autoplayRecommendations.shift();
            currentQueue.push(nextRec); // Append to queue so the user can see it in queue list
            playTrack(nextRec);
            showToast(`Autoplay: ${nextRec.title} 📻`);
            return;
        }
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

function restartTrack() {
    if (!audioEngine) return;
    audioEngine.currentTime = 0;
    showToast('Track restarted');
}

function togglePlay() {
    if (isBackupPlaying) {
        if (isPlaying) {
            if (ytPlayer) {
                ytPlayer.pauseVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); } catch(e) {}
            }
            isPlaying = false;
            if (backupEndTimer) {
                clearTimeout(backupEndTimer);
                backupEndTimer = null;
            }
        } else {
            if (ytPlayer) {
                ytPlayer.playVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*'); } catch(e) {}
            }
            isPlaying = true;
            if (currentTrack && currentTrack.duration) {
                if (backupEndTimer) clearTimeout(backupEndTimer);
                const durationMs = currentTrack.duration * 1000;
                backupEndTimer = setTimeout(() => {
                    if (isBackupPlaying && isPlaying) {
                        playNextTrack();
                    }
                }, durationMs);
            }
        }
    } else {
        if (!audioEngine.src) return;
        if (isPlaying) {
            audioEngine.pause();
            if (ytPlayer) {
                ytPlayer.pauseVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); } catch(e) {}
            }
        } else {
            audioEngine.play().catch(() => {});
            if (ytPlayer) {
                ytPlayer.playVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*'); } catch(e) {}
            }
        }
        isPlaying = !isPlaying;
    }
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
        
        // Smart Next-Track Prefetch
        if (percent > 50 && !hasPrefetchedNext) {
            hasPrefetchedNext = true;
            prefetchNextTrack();
        }

        // Periodically sync video timeline to audio timeline (more aggressive sync)
        const audioTime = audioEngine.currentTime;
        if (audioTime > 0 && isVideoOpen && !isSeeking && (Math.floor(audioTime) !== lastSyncedSecond || lastSyncedSecond === -1)) {
            lastSyncedSecond = Math.floor(audioTime);
            try {
                if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
                    // Use YouTube API for precise sync
                    const ytTime = ytPlayer.getCurrentTime() || 0;
                    const drift = Math.abs(audioTime - ytTime);
                    // Sync when drift exceeds 0.2 seconds (very tight sync)
                    if (drift > 0.2) {
                        ytPlayer.seekTo(audioTime, true);
                        console.log(`[Periodic Sync] Fixed ${drift.toFixed(2)}s drift`);
                    }
                } else if (videoIframe && videoIframe.src && videoIframe.contentWindow) {
                    // Fallback to iframe postMessage - sync every second for iframe
                    videoIframe.contentWindow.postMessage(
                        JSON.stringify({
                            event: 'command',
                            func: 'seekTo',
                            args: [audioTime, false]
                        }),
                        '*'
                    );
                }
            } catch(e) {
                console.warn('[Sync warning]', e);
            }
        }
    }
}

async function prefetchNextTrack() {
    if (isRepeated) return;
    if (!currentQueue || currentQueue.length === 0) return;
    
    let nextTrack = null;
    if (manualQueue.length > 0) {
        nextTrack = manualQueue[0];
    } else {
        let idx = currentQueue.findIndex(t => t.id === currentTrack?.id);
        if (idx !== -1) {
            if (isShuffled) {
                let randIdx = idx;
                if (currentQueue.length > 1) {
                    while (randIdx === idx) {
                        randIdx = Math.floor(Math.random() * currentQueue.length);
                    }
                }
                nextTrack = currentQueue[randIdx];
            } else {
                if (idx === currentQueue.length - 1) {
                    // Sequential queue is exhausted, prefetch from autoplay recommendations
                    if (autoplayRecommendations.length > 0) {
                        nextTrack = autoplayRecommendations[0];
                    }
                } else {
                    nextTrack = currentQueue[idx + 1];
                }
            }
        }
    }
    
    if (nextTrack) {
        console.log("[Prefetch] Pre-resolving stream URL for next track:", nextTrack.title);
        resolveStreamUrl(nextTrack).then(data => {
            if (data && data.url) {
                if (prefetchedStreamCache.size > 5) {
                    const firstKey = prefetchedStreamCache.keys().next().value;
                    prefetchedStreamCache.delete(firstKey);
                }
                prefetchedStreamCache.set(nextTrack.id, data);
                console.log("[Prefetch SUCCESS] Stream URL pre-cached for next track:", nextTrack.title);
            }
        }).catch(err => {
            console.warn("[Prefetch FAILED] Pre-resolving failed:", err);
        });
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function syncVideoIframeToAudio() {
    if (!currentTrack) return;

    const seconds = audioEngine.currentTime || 0;
    console.log("[Seek Sync] Syncing video timeline to:", seconds);

    try {
        if (ytPlayer) {
            // Use YouTube API for precise seeking
            ytPlayer.seekTo(seconds, true);
            if (isPlaying) {
                ytPlayer.playVideo();
            } else {
                ytPlayer.pauseVideo();
            }
        } else if (videoIframe && videoIframe.src) {
            // Fallback to iframe postMessage
            videoIframe.contentWindow.postMessage(
                JSON.stringify({
                    event: 'command',
                    func: 'seekTo',
                    args: [seconds, true]
                }),
                '*'
            );
            if (isPlaying) {
                videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            } else {
                videoIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            }
        }
    } catch(err) {
        console.warn("Failed to sync video to audio:", err);
    }
}

// Final Cleanup: Duplicate definitions removed.
