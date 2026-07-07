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
let currentVideoWidth = parseInt(localStorage.getItem('spotify_video_width')) || 400;
let currentQueueWidth = parseInt(localStorage.getItem('spotify_queue_width')) || 300;
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

// Backup mode wall-clock time tracking (since audioEngine is paused/empty)
let backupProgressInterval = null; // setInterval handle for backup progress updates
let backupElapsedSeconds = 0;     // How many seconds have elapsed in backup mode
let backupStartWallTime = 0;      // Date.now() snapshot when backup tracking began
let isLoadingTrack = false; // Suppress spurious pause events during track loading
let currentSearchQuery = "";
let currentSearchOffset = 0;
let isSearchLoading = false;
let hasMoreSearchSongs = true;
let ytPlayer = null; // YouTube IFrame API player instance
let videoSyncInterval = null; // Interval for smooth video-audio sync
let isVideoBuffering = false; // Track video buffer state
let ytVideoCurrentTime = 0; // Track current time of standard YouTube iframe embed

// RACE CONDITION PROTECTION
let playbackRequestCounter = 0;

// New Features State
let activeTheme = localStorage.getItem('spotify_active_theme') || 'default';
let searchHistory = JSON.parse(localStorage.getItem('spotify_search_history')) || [];
let sleepTimer = null;
let sleepTimeRemaining = 0;
let sleepTimerInterval = null;
let lyricsData = []; // [{ time: number, text: string }]
let isLyricsOpen = false;

// Visualizer Web Audio variables
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let visualizerAnimationId = null;

// Touch Swipe variables
let touchStartX = 0;
let touchEndX = 0;

// Drag and drop progress tracker
let activeProgressBarBg = null;

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

/**
 * Robust fetch wrapper with timeout to prevent UI freezing
 */
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 15000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
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

    // Initialize New Features
    initThemeEngine();
    initVisualizer();
    initLyrics();
    initSleepTimer();
    initLikeSystem();
    initSearchHistory();
    initMobilePlayer();
    initSharing();
    initTheaterControls();
    initSidebarResizers();
});

// YouTube IFrame API initialization
function initializeYouTubeAPI() {
    if (document.getElementById('yt-iframe-api')) return;
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = function () {
        console.log("[YT] Creating player directly on static yt-player-div");
        ytPlayer = new YT.Player('yt-player-div', {
            height: '100%',
            width: '100%',
            playerVars: {
                autoplay: 0,
                controls: 0,
                mute: 1,       // Always muted — audio comes from the proxy stream
                enablejsapi: 1,
                origin: window.location.origin,
                rel: 0
            },
            events: {
                onReady: (event) => {
                    console.log('[YT] Player ready');
                    event.target.mute();
                },
                onStateChange: (event) => {
                    const state = event.data;
                    // ALWAYS re-enforce mute on every state change
                    if (event.target && typeof event.target.isMuted === 'function') {
                        if (!event.target.isMuted()) {
                            event.target.mute();
                            console.log('[YT] Re-muted after state change (was unmuted)');
                        }
                    }
                    if (state === YT.PlayerState.BUFFERING) {
                        isVideoBuffering = true;
                    } else if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.PAUSED) {
                        isVideoBuffering = false;
                    }

                    // Toggle loader dots
                    const loader = document.getElementById('video-loader');
                    if (loader) {
                        if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.UNSTARTED) {
                            if (isVideoOpen) loader.classList.remove('hidden');
                        } else {
                            loader.classList.add('hidden');
                        }
                    }
                }
            }
        });
    };
}

// Keyboard Shortcuts Handler
function handleKeyboardShortcuts(e) {
    // Ignore keyboard shortcuts if browser/system modifier keys are pressed (e.g., Ctrl+Shift+R, Ctrl+P)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

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
            updateProgress(); // Immediately refresh #current-time (timeupdate may be delayed on stream seeks)
            showToast('⏪ -10s');
            if (isVideoOpen) syncVideoIframeToAudio();
        } else if (isBackupPlaying) {
            // Seek the wall-clock tracker back 10s
            const newTime = Math.max(0, backupElapsedSeconds - 10);
            startBackupProgressTracker(newTime);
            // Also seek the YouTube iframe
            if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [newTime, true] }), '*'); } catch (e) { }
            }
            showToast('⏪ -10s');
        }

    } else if (key === 'ArrowRight' || key === 'Right') {
        if (audioEngine.src && !isSeeking) {
            audioEngine.currentTime = Math.min(audioEngine.duration || audioEngine.currentTime + 60, audioEngine.currentTime + 10);
            updateProgress(); // Immediately refresh #current-time (timeupdate may be delayed on stream seeks)
            showToast('⏩ +10s');
            if (isVideoOpen) syncVideoIframeToAudio();
        } else if (isBackupPlaying) {
            // Seek the wall-clock tracker forward 10s
            const maxTime = currentTrack?.duration || backupElapsedSeconds + 60;
            const newTime = Math.min(maxTime, backupElapsedSeconds + 10);
            startBackupProgressTracker(newTime);
            // Also seek the YouTube iframe
            if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [newTime, true] }), '*'); }
                catch (e) { }
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

    // YouTube PostMessage Listener to track video current time
    window.addEventListener('message', (e) => {
        if (e.origin && e.origin.includes('youtube.com')) {
            try {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                if (data && data.event === 'infoDelivery' && data.info) {
                    if (data.info.currentTime !== undefined) {
                        ytVideoCurrentTime = data.info.currentTime;
                    }
                    if (data.info.playerState !== undefined) {
                        const state = data.info.playerState;
                        const loader = document.getElementById('video-loader');
                        if (state === 3) { // BUFFERING
                            isVideoBuffering = true;
                            if (loader && isVideoOpen) loader.classList.remove('hidden');
                        } else {
                            isVideoBuffering = false;
                            if (loader) loader.classList.add('hidden');
                        }
                    }
                }
            } catch (err) { }
        }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', handleKeyboardShortcuts, true);

    // Airtight Video-Audio Synchronization Event Listeners
    audioEngine.addEventListener('playing', () => {
        if (isVideoOpen && !isSeeking && !isBackupPlaying) {
            if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
                ytPlayer.mute();
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
                } catch (e) { }
            }
        }
    });
    audioEngine.addEventListener('pause', () => {
        // Suppress spurious pause events fired by audioEngine.load() during track switching
        if (isLoadingTrack || isSeeking) return;
        // ONLY pause the video if the user actually clicked pause (isPlaying is false)
        if (isPlaying) {
            console.log("[Audio] Ignored spurious pause event (still in playing state).");
            return;
        }
        if (isVideoOpen) {
            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
                ytPlayer.pauseVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); } catch (e) { }
            }
        }
    });
    audioEngine.addEventListener('ended', () => {
        if (isRepeated) playTrack(currentTrack);
        else playNextTrack();
    });
    audioEngine.addEventListener('error', (e) => {
        // Skip errors during track loading/transition, or aborted play calls
        if (isLoadingTrack || (audioEngine.error && audioEngine.error.code === 1)) {
            console.log("[Audio] Ignored transition/aborted error event.");
            return;
        }
        console.warn("Audio engine encountered error. Falling back to official YouTube Player in sidebar...", e);
        const ytId = currentTrack?.youtube_id;
        if (ytId) {
            isBackupPlaying = true;
            showToast("Direct stream failed, using backup player... 🔄");

            // Open the video sidebar so the user can see/control the video
            if (!isVideoOpen) {
                isVideoOpen = true;
                mainContainer.classList.add('show-video');
                videoSidebar.style.width = '400px';
            }

            // BACKUP MODE: the iframe IS the audio source here (proxy failed).
            // mute=0 so the user can actually hear the song.
            // But we must silence the audioEngine first (it's broken anyway).
            audioEngine.pause();
            audioEngine.src = '';

            videoIframe.style.display = 'block';
            // mute=0 intentional here — this is the ONLY audio source in backup mode
            videoIframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&controls=0&enablejsapi=1&modestbranding=1&rel=0&iv_load_policy=3`;

            document.getElementById('video-sidebar-title').innerText = `Watching: ${currentTrack.title}`;
            isPlaying = true;
            updatePlayButton();

            // Start wall-clock progress tracker so #current-time updates in backup mode
            startBackupProgressTracker(0);

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

            renderQueue();
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
            if (e.key === 'Enter') performSearch(e.target.value);
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
    activeProgressBarBg = progressBarBg;
    progressBarBg.addEventListener('mousedown', (e) => { isSeeking = true; activeProgressBarBg = progressBarBg; updateSeekFromEvent(e); });

    const theaterProgressBg = document.getElementById('theater-progress-bar-bg');
    if (theaterProgressBg) {
        theaterProgressBg.addEventListener('mousedown', (e) => { isSeeking = true; activeProgressBarBg = theaterProgressBg; updateSeekFromEvent(e); });
    }

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
        if (!activeProgressBarBg) return;
        const rect = activeProgressBarBg.getBoundingClientRect();
        const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        progressBar.style.width = `${percent * 100}%`;

        // Update the full-screen mobile progress fill as well
        const fill = document.getElementById('theater-progress-fill');
        if (fill) fill.style.width = `${percent * 100}%`;

        const totalDuration = audioEngine.duration || (currentTrack ? currentTrack.duration : 0);
        if (totalDuration) {
            const seconds = percent * totalDuration;
            if (audioEngine.duration) {
                audioEngine.currentTime = seconds;
                // Immediately refresh displayed time — don't wait for the next timeupdate event
                // (streaming audio re-buffers after seek, delaying timeupdate significantly)
                document.getElementById('current-time').innerText = formatTime(seconds);
                document.getElementById('total-time').innerText = formatTime(totalDuration);
            }

            // If using backup end timer, we must recalculate the remaining duration!
            if (isBackupPlaying) {
                // Update wall-clock tracker to the seeked position
                startBackupProgressTracker(seconds);
                // Seek YouTube iframe too
                if (videoIframe && videoIframe.src) {
                    try { videoIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }), '*'); } catch (e) { }
                }
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
    updateLayout();

    // Set video placeholder art
    const placeholderArt = document.getElementById('video-placeholder-art');
    if (placeholderArt && currentTrack) {
        placeholderArt.src = currentTrack.album_art || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
    }

    const startSec = Math.floor(audioEngine.currentTime || 0);
    const ytId = currentTrack.youtube_id;

    // Show loading dots immediately
    const loader = document.getElementById('video-loader');
    if (loader) loader.classList.remove('hidden');

    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        const iframe = ytPlayer.getIframe();
        if (iframe) {
            iframe.style.display = 'block';
        }
        videoIframe.style.display = 'none';
        videoIframe.src = '';

        // FORCE MUTE IMMEDIATELY
        ytPlayer.mute();
        ytPlayer.loadVideoById({ videoId: ytId, startSeconds: startSec });

        setTimeout(() => {
            ytPlayer.mute(); // Double-mute insurance
            if (isPlaying) {
                ytPlayer.playVideo();
                ytPlayer.mute(); // Triple-mute insurance
            } else {
                ytPlayer.pauseVideo();
            }
        }, 500);

    } else {
        // === FALLBACK PATH: direct iframe embed ===
        videoIframe.style.display = 'block';
        // mute=1 is mandatory here to prevent double audio
        videoIframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&enablejsapi=1&start=${startSec}&origin=${encodeURIComponent(window.location.origin)}&modestbranding=1&iv_load_policy=3`;

        videoIframe.onload = () => {
            if (loader) loader.classList.add('hidden');
            if (isPlaying) {
                try {
                    videoIframe.contentWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'seekTo', args: [audioEngine.currentTime || 0, true] }),
                        '*'
                    );
                    videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                } catch (e) { }
            }
        };
    }

    // === DRIFT-BASED SYNC INTERVAL ===
    // Sync the video timeline periodically every second to match the audio time
    if (videoSyncInterval) clearInterval(videoSyncInterval);
    videoSyncInterval = setInterval(() => {
        if (!isVideoOpen || !isPlaying || isSeeking || isBackupPlaying) return;

        const audioTime = audioEngine.currentTime;
        if (isNaN(audioTime) || audioTime === 0) return;

        if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
            // === YT API SYNC ===
            // Always enforce mute — loadVideoById/seekTo can silently unmute
            if (typeof ytPlayer.isMuted === 'function' && !ytPlayer.isMuted()) {
                ytPlayer.mute();
            }

            if (typeof ytPlayer.getPlayerState === 'function') {
                const state = ytPlayer.getPlayerState();
                if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING && isPlaying) {
                    ytPlayer.playVideo();
                }
            }

            const ytTime = ytPlayer.getCurrentTime() || 0;
            const drift = audioTime - ytTime;

            if (Math.abs(drift) > 2.0) {
                // Hard re-sync: more than 2 seconds off
                console.log(`[Sync] Hard re-sync: drift=${drift.toFixed(2)}s`);
                ytPlayer.seekTo(audioTime, true);
                ytPlayer.mute(); // re-mute after seek

            } else if (Math.abs(drift) > 0.5 && !isVideoBuffering) {
                // Soft nudge: 0.5–2s drift
                console.log(`[Sync] Soft nudge: drift=${drift.toFixed(2)}s`);
                ytPlayer.seekTo(audioTime, false);
            }
            // < 0.5s drift: do nothing — let video play naturally
        } else if (videoIframe && videoIframe.src && videoIframe.contentWindow) {
            // === IFRAME postMessage SYNC (fallback) ===
            // Fallback: gentle periodic sync every 5 seconds since we can't read time
            const nowSec = Math.floor(audioTime);
            if (nowSec !== lastSyncedSecond && nowSec % 5 === 0) {
                lastSyncedSecond = nowSec;
                try {
                    videoIframe.contentWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'seekTo', args: [audioTime, true] }),
                        '*'
                    );
                    videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                } catch (e) { }
            }
        }
    }, 1000);

    document.getElementById('video-sidebar-title').innerText = `Watching: ${currentTrack.title}`;
    document.body.focus();
    updateVideoVisibility();
}

function closeVideoSidebar() {
    isVideoOpen = false;

    // Clear sync interval
    if (videoSyncInterval) {
        clearInterval(videoSyncInterval);
        videoSyncInterval = null;
    }

    // Stop ytPlayer (keeps it muted & paused, ready for next open)
    if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        ytPlayer.mute();
        ytPlayer.stopVideo();
        const iframe = ytPlayer.getIframe();
        if (iframe) iframe.style.display = 'none';
    }

    // Clear fallback iframe src so it stops ALL audio/video
    videoIframe.src = '';
    videoIframe.style.display = 'none';

    // Hide loader
    const loader = document.getElementById('video-loader');
    if (loader) loader.classList.add('hidden');

    updateLayout();
    updateVideoVisibility();
}

// --- Queue Sidebar Logic ---
function toggleQueueSidebar() {
    isQueueOpen ? closeQueueSidebar() : openQueueSidebar();
}

function openQueueSidebar() {
    isQueueOpen = true;
    updateLayout();
    renderQueue();
}

function closeQueueSidebar() {
    isQueueOpen = false;
    updateLayout();
}

function updateLayout() {
    if (mainContainer) {
        const videoWidthStr = isVideoOpen ? `${currentVideoWidth}px` : '0px';
        const queueWidthStr = isQueueOpen ? `${currentQueueWidth}px` : '0px';

        mainContainer.style.setProperty('--video-width', videoWidthStr);
        mainContainer.style.setProperty('--queue-width', queueWidthStr);

        if (videoSidebar) videoSidebar.style.width = videoWidthStr;
        if (queueSidebar) queueSidebar.style.width = queueWidthStr;
    }
    updateVideoVisibility();
}

// Resizable Sidebars Logic
function initSidebarResizers() {
    setupResizer(document.getElementById('video-resize-handle'), 'video');
    setupResizer(document.getElementById('queue-resize-handle'), 'queue');
}

function setupResizer(handle, type) {
    if (!handle) return;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';

        const onMouseMove = (moveEvent) => {
            const containerWidth = window.innerWidth;
            const newWidth = containerWidth - moveEvent.clientX;
            const constrainedWidth = Math.max(250, Math.min(800, newWidth));

            if (type === 'video') {
                currentVideoWidth = constrainedWidth;
                localStorage.setItem('spotify_video_width', currentVideoWidth);
            } else {
                currentQueueWidth = constrainedWidth;
                localStorage.setItem('spotify_queue_width', currentQueueWidth);
            }
            updateLayout();
        };

        const onMouseUp = () => {
            handle.classList.remove('active');
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    handle.addEventListener('touchstart', (e) => {
        handle.classList.add('active');

        const onTouchMove = (moveEvent) => {
            const touch = moveEvent.touches[0];
            const containerWidth = window.innerWidth;
            const newWidth = containerWidth - touch.clientX;
            const constrainedWidth = Math.max(250, Math.min(800, newWidth));

            if (type === 'video') {
                currentVideoWidth = constrainedWidth;
                localStorage.setItem('spotify_video_width', currentVideoWidth);
            } else {
                currentQueueWidth = constrainedWidth;
                localStorage.setItem('spotify_queue_width', currentQueueWidth);
            }
            updateLayout();
        };

        const onTouchEnd = () => {
            handle.classList.remove('active');
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };

        document.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);
    });
}

function renderQueue() {
    if (!queueList) return;
    queueList.innerHTML = "";

    const nextQueueIndex = currentTrack ? currentQueue.findIndex(t => t.id === currentTrack.id) : -1;
    const contextTracks = nextQueueIndex !== -1 ? currentQueue.slice(nextQueueIndex + 1) : [];
    const allTracks = [...manualQueue, ...contextTracks];

    if (allTracks.length === 0) {
        queueList.innerHTML = `<p style="color: grey; font-size: 14px;">Queue is empty.</p>`;
        return;
    }

    allTracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = "queue-item";
        item.setAttribute('draggable', 'true');
        item.innerHTML = `
            <i class="fas fa-grip-vertical drag-handle" style="color: var(--text-muted); cursor: grab; padding-right: 8px; font-size: 13px;"></i>
            <img src="${track.album_art || 'https://via.placeholder.com/40'}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
            <div class="queue-item-info" style="flex: 1; padding-left: 10px;">
                <h4 style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${track.title}</h4>
                <p style="font-size: 11px; color: var(--text-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${track.artist}</p>
            </div>
        `;

        // Prevent click when dragging ends
        let isDraggingNow = false;

        item.onclick = () => {
            if (!isDraggingNow) {
                playTrack(track);
            }
        };

        // Drag and Drop event handlers
        item.addEventListener('dragstart', (e) => {
            isDraggingNow = true;
            e.dataTransfer.setData('text/plain', index);
            item.classList.add('dragging');
        });

        item.addEventListener('dragend', () => {
            isDraggingNow = false;
            item.classList.remove('dragging');

            // Cleanup any stray drag-over highlights
            document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');

            const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const targetIndex = index;

            if (sourceIndex !== targetIndex) {
                // Reorder allTracks
                const [moved] = allTracks.splice(sourceIndex, 1);
                allTracks.splice(targetIndex, 0, moved);

                // Re-apportion manualQueue and contextTracks
                const manualLen = manualQueue.length;
                manualQueue = allTracks.slice(0, manualLen);

                // Rest go to currentQueue starting after currentTrack
                if (nextQueueIndex !== -1) {
                    const newContextTracks = allTracks.slice(manualLen);
                    currentQueue.splice(nextQueueIndex + 1, contextTracks.length, ...newContextTracks);
                }

                renderQueue();
                showToast("Queue reordered! 🔀");
            }
        });

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
        renderSearchHistory();
    }
}

function _internalShowView(viewId, updateSidebar = true) {
    document.querySelectorAll('.content-view').forEach(v => v.classList.add('hidden'));
    const view = document.getElementById(viewId);
    if (view) view.classList.remove('hidden');

    // Reset lyrics panel open state if we navigate away
    if (viewId !== 'lyrics-view') {
        isLyricsOpen = false;
        const btnToggleLyrics = document.getElementById('btn-toggle-lyrics');
        if (btnToggleLyrics) btnToggleLyrics.style.color = '';
    }

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
    if (!query) return;
    addSearchToHistory(query);
    showView('search-view');

    // Hide search history tags while displaying results
    const historyContainer = document.getElementById('search-history');
    if (historyContainer) historyContainer.innerHTML = "";

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
        const response = await fetchWithTimeout(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}&limit=20&offset=0`);
        const tracks = await response.json();
        renderTrackList(tracks, document.getElementById('results-list'));
    } catch (err) {
        console.error(err);
        document.getElementById('results-list').innerHTML = `<p style="padding: 20px; color: #ff4444;">Search timed out or server unreachable. Please check your connection.</p>`;
    }
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
        // UNIFIED LIMIT: Use 20 to match performSearch
        const response = await fetchWithTimeout(`${API_BASE_URL}/api/search?q=${encodeURIComponent(currentSearchQuery)}&limit=20&offset=${currentSearchOffset}`);
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
        if (tracks.length < 20) {
            hasMoreSearchSongs = false;
            showSearchEndMessage();
        }
    } catch (err) {
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

        const playAction = () => {
            currentQueue = updatedQueue;
            playTrack(track);
        };
        item.ondblclick = playAction;
        item.querySelector('.btn-play-track').onclick = (e) => {
            e.stopPropagation();
            playAction();
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

        const playAction = () => {
            // When a user explicitly plays a song from a list, that list becomes the context queue
            currentQueue = tracks;
            playTrack(track);
        };
        item.ondblclick = playAction;
        item.querySelector('.btn-play-track').onclick = (e) => {
            e.stopPropagation();
            playAction();
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
    } catch (e) {
        console.warn("[Autoplay] Failed to retrieve recommendations:", e);
    }
}

async function playTrack(track) {
    playbackRequestCounter++;
    const currentRequestId = playbackRequestCounter;

    isLoadingTrack = true;
    // Stop any active playback immediately & reset media pipeline to prevent DOMException interruptions
    audioEngine.pause();
    audioEngine.src = "";
    isBackupPlaying = false;
    lastSyncedSecond = -1;
    if (backupEndTimer) {
        clearTimeout(backupEndTimer);
        backupEndTimer = null;
    }
    // Stop backup wall-clock tracker if running
    if (backupProgressInterval) {
        clearInterval(backupProgressInterval);
        backupProgressInterval = null;
    }
    backupElapsedSeconds = 0;

    currentTrack = track;
    playerTitle.innerText = track.title;
    playerArtist.innerText = track.artist;
    playerThumb.src = track.album_art || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop';

    // Set video placeholder art
    const placeholderArt = document.getElementById('video-placeholder-art');
    if (placeholderArt) {
        placeholderArt.src = track.album_art || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
    }

    btnAddCurrent.style.display = 'block';

    // Trigger updates for new features
    updateDynamicTheme();
    updateLikeButtonState();
    updateTheaterViewDOM();
    if (isLyricsOpen) showLyricsView();

    hasPrefetchedNext = false;
    fetchAutoplayRecommendations(track);

    let data = null;
    try {
        if (prefetchedStreamCache.has(track.id)) {
            data = prefetchedStreamCache.get(track.id);
            prefetchedStreamCache.delete(track.id);
            console.log("[Cache HIT] Using prefetched stream for:", track.title);
        } else {
            data = await resolveStreamUrl(track);
        }
    } catch (err) {
        console.warn("Failed to resolve stream url:", err);
    }

    // CHECK IF THIS REQUEST IS STILL THE LATEST ONE
    if (currentRequestId !== playbackRequestCounter) {
        console.log("[Race Protection] Discarding stale playback request for:", track.title);
        return;
    }

    if (data && data.url && currentTrack && currentTrack.id === track.id) {
        currentTrack.youtube_id = data.id;
        audioEngine.src = `${API_BASE_URL}/api/proxy?url=${encodeURIComponent(data.url)}`;
        audioEngine.load();
        audioEngine.play().then(() => {
            console.log("Playback started successfully.");
            isLoadingTrack = false;
        }).catch(err => {
            console.warn("Playback play() failed to start:", err);
            isLoadingTrack = false;
        });
        isPlaying = true;
        updatePlayButton();

        // Sync Video if sidebar is open
        if (isVideoOpen && currentTrack.youtube_id) {
            const loader = document.getElementById('video-loader');
            if (loader) loader.classList.remove('hidden');

            document.getElementById('video-sidebar-title').innerText = `Watching: ${track.title}`;
            if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                const iframe = ytPlayer.getIframe();
                if (iframe) iframe.style.display = 'block';
                videoIframe.style.display = 'none';
                ytPlayer.loadVideoById({ videoId: currentTrack.youtube_id, startSeconds: 0 });
                setTimeout(() => { if (isPlaying && isVideoOpen) ytPlayer.playVideo(); }, 600);
            } else if (videoIframe) {
                videoIframe.style.display = 'block';
                videoIframe.src = `https://www.youtube.com/embed/${currentTrack.youtube_id}?autoplay=1&mute=1&controls=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
                videoIframe.onload = () => {
                    if (loader) loader.classList.add('hidden');
                    if (isPlaying) {
                        try {
                            videoIframe.contentWindow.postMessage(
                                JSON.stringify({ event: 'command', func: 'seekTo', args: [audioEngine.currentTime || 0, true] }),
                                '*'
                            );
                            videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                        } catch (e) { }
                    }
                };
            }
        }

        renderQueue();
    } else {
        isLoadingTrack = false;
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
            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
                ytPlayer.pauseVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); } catch (e) { }
            }
            isPlaying = false;
            if (backupEndTimer) {
                clearTimeout(backupEndTimer);
                backupEndTimer = null;
            }
        } else {
            if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
                ytPlayer.playVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*'); } catch (e) { }
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
            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
                ytPlayer.pauseVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); } catch (e) { }
            }
        } else {
            audioEngine.play().catch(() => { });
            if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
                ytPlayer.playVideo();
            } else if (videoIframe && videoIframe.src) {
                try { videoIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*'); } catch (e) { }
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
    updateVideoVisibility();
    updateTheaterPlayPauseButton();
}

function updateProgress() {
    if (audioEngine.duration) {
        const percent = (audioEngine.currentTime / audioEngine.duration) * 100;
        progressBar.style.width = `${percent}%`;
        document.getElementById('current-time').innerText = formatTime(audioEngine.currentTime);
        document.getElementById('total-time').innerText = formatTime(audioEngine.duration);

        // Sync new features
        updateLyricsHighlight();
        updateTheaterProgress();

        // Smart Next-Track Prefetch
        if (percent > 50 && !hasPrefetchedNext) {
            hasPrefetchedNext = true;
            prefetchNextTrack();
        }
    }
}

/**
 * Start (or restart) a wall-clock based progress tracker for backup YouTube mode.
 * Since audioEngine is paused/empty in backup mode, we simulate progress using Date.now().
 * @param {number} startAtSeconds - The elapsed playback position to start counting from.
 */
function startBackupProgressTracker(startAtSeconds) {
    // Clear any existing interval
    if (backupProgressInterval) {
        clearInterval(backupProgressInterval);
        backupProgressInterval = null;
    }
    backupElapsedSeconds = startAtSeconds;
    backupStartWallTime = Date.now();
    const totalDuration = currentTrack?.duration || 0;

    backupProgressInterval = setInterval(() => {
        if (!isBackupPlaying || !isPlaying) return;
        // Calculate how many seconds have elapsed since we started tracking
        const wallElapsed = (Date.now() - backupStartWallTime) / 1000;
        backupElapsedSeconds = startAtSeconds + wallElapsed;

        // Update #current-time display
        document.getElementById('current-time').innerText = formatTime(backupElapsedSeconds);

        // Update progress bar fill
        if (totalDuration > 0) {
            const pct = Math.min(100, (backupElapsedSeconds / totalDuration) * 100);
            progressBar.style.width = `${pct}%`;
            const fill = document.getElementById('theater-progress-fill');
            if (fill) fill.style.width = `${pct}%`;
            const theaterCur = document.getElementById('theater-current-time');
            if (theaterCur) theaterCur.innerText = formatTime(backupElapsedSeconds);
        }
    }, 250); // Update 4 times/second — fast enough for smooth display
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
        if (videoIframe && videoIframe.src) {
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
    } catch (err) {
        console.warn("Failed to sync video to audio:", err);
    }
}

function updateVideoVisibility() {
    const ytDiv = document.getElementById('yt-player-div');
    const iframe = document.getElementById('video-iframe');

    // Show the video iframe ONLY when the sidebar is open and actively playing.
    // When paused, we set opacity to 0 so the album cover art displays, hiding YouTube's pause controls cleanly.
    const isVideoActive = isVideoOpen && isPlaying;

    if (ytDiv) ytDiv.style.opacity = isVideoActive ? '1' : '0';
    if (iframe) iframe.style.opacity = isVideoActive ? '1' : '0';

    // Apply opacity toggle directly to the YouTube SDK generated iframe if available
    if (ytPlayer && typeof ytPlayer.getIframe === 'function') {
        const activeIframe = ytPlayer.getIframe();
        if (activeIframe) {
            activeIframe.style.opacity = isVideoActive ? '1' : '0';
            activeIframe.style.transition = 'opacity 0.3s ease-in-out';
        }
    }
}

// ==========================================
// 🟢 THEME ENGINE & CUSTOM VIBES
// ==========================================

function initThemeEngine() {
    // Apply saved theme on start
    document.body.setAttribute('data-theme', activeTheme);

    // Mark active theme in dropdown immediately
    document.querySelectorAll('#theme-menu [data-theme]').forEach(el => {
        el.classList.toggle('active-theme', el.getAttribute('data-theme') === activeTheme);
    });

    const btnThemeMenu = document.getElementById('btn-theme-menu');
    const themeMenu = document.getElementById('theme-menu');
    if (btnThemeMenu && themeMenu) {
        btnThemeMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            themeMenu.classList.toggle('hidden');
        });
    }

    document.addEventListener('click', () => {
        if (themeMenu) themeMenu.classList.add('hidden');
    });

    const themeOptions = document.querySelectorAll('#theme-menu [data-theme]');
    themeOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const theme = opt.getAttribute('data-theme');
            setTheme(theme);
            if (themeMenu) themeMenu.classList.add('hidden');
        });
    });
}

function setTheme(theme) {
    activeTheme = theme;
    localStorage.setItem('spotify_active_theme', theme);
    document.body.setAttribute('data-theme', theme);

    // Clear any inline dynamic styles from the previous dynamic theme
    const dynamicProps = [
        '--bg-base', '--bg-sidebar', '--bg-player', '--bg-elevated', '--bg-card',
        '--bg-card-hover', '--bg-highlight', '--bg-modal', '--bg-input',
        '--accent', '--accent-dim', '--accent-glow', '--accent-text',
        '--text-base', '--text-sub', '--text-muted',
        '--border', '--border-strong',
        '--grad-body-a', '--grad-body-b',
        '--progress-fill', '--play-btn-bg', '--play-btn-color', '--play-btn-glow',
        '--shadow-glow', '--icon-active', '--icon-inactive',
        // Legacy names (keep for backward compat)
        '--primary-green', '--accent-secondary', '--bg-card-hover', '--glass-border',
        '--gradient-1', '--gradient-2'
    ];
    if (theme !== 'dynamic') {
        dynamicProps.forEach(p => document.body.style.removeProperty(p));
    } else {
        updateDynamicTheme();
    }

    // Mark active theme in dropdown
    document.querySelectorAll('#theme-menu [data-theme]').forEach(el => {
        el.classList.toggle('active-theme', el.getAttribute('data-theme') === theme);
    });

    const labels = {
        default: 'Spotify Classic', midnight: 'Midnight Neon',
        crimson: 'Crimson Night', ocean: 'Ocean Breeze', solar: 'Solar Light', dynamic: 'Dynamic'
    };
    showToast(`🎨 ${labels[theme] || theme} vibe activated`);
}

async function updateDynamicTheme() {
    if (activeTheme !== 'dynamic' || !currentTrack || !currentTrack.album_art) return;

    const colors = await extractDominantColor(currentTrack.album_art);
    if (!colors) return;

    const { r, g, b } = colors;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const isDark = brightness < 160;

    // Dark base derived from art color
    const dr = Math.round(r * 0.07), dg = Math.round(g * 0.07), db = Math.round(b * 0.11);
    const accent = `rgb(${r}, ${g}, ${b})`;
    const accentDim = `rgba(${r}, ${g}, ${b}, 0.16)`;
    const accentGlow = `rgba(${r}, ${g}, ${b}, 0.42)`;

    const set = (prop, val) => document.body.style.setProperty(prop, val);
    set('--bg-base', `rgb(${dr}, ${dg}, ${db})`);
    set('--bg-sidebar', `rgba(${dr}, ${dg}, ${db}, 0.90)`);
    set('--bg-player', `rgba(${dr}, ${dg}, ${db}, 0.88)`);
    set('--bg-elevated', `rgba(${Math.round(r * 0.14)}, ${Math.round(g * 0.14)}, ${Math.round(b * 0.18)}, 0.78)`);
    set('--bg-card', `rgba(${Math.round(r * 0.18)}, ${Math.round(g * 0.18)}, ${Math.round(b * 0.22)}, 0.65)`);
    set('--bg-card-hover', `rgba(${Math.round(r * 0.40)}, ${Math.round(g * 0.40)}, ${Math.round(b * 0.50)}, 0.55)`);
    set('--bg-highlight', `rgba(${r}, ${g}, ${b}, 0.12)`);
    set('--bg-modal', `rgba(${dr + 4}, ${dg + 4}, ${db + 6}, 0.96)`);
    set('--bg-input', `rgba(${r}, ${g}, ${b}, 0.08)`);
    set('--accent', accent);
    set('--accent-dim', accentDim);
    set('--accent-glow', accentGlow);
    set('--accent-text', `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)})`);
    set('--text-base', isDark ? '#ffffff' : '#1d1d1f');
    set('--text-sub', isDark ? '#b3b3b3' : '#6e6e73');
    set('--text-muted', isDark ? '#666666' : '#aeaeb2');
    set('--border', `rgba(${r}, ${g}, ${b}, 0.18)`);
    set('--border-strong', `rgba(${r}, ${g}, ${b}, 0.32)`);
    set('--progress-track', `rgba(${r}, ${g}, ${b}, 0.18)`);
    set('--progress-fill', accent);
    set('--play-btn-bg', accent);
    set('--play-btn-color', isDark ? '#ffffff' : '#000000');
    set('--play-btn-glow', `0 4px 24px ${accentGlow}`);
    set('--shadow-glow', `0 0 24px ${accentGlow}`);
    set('--icon-active', accent);
    set('--icon-inactive', isDark ? '#9ca3af' : '#6e6e73');
    set('--grad-body-a', `rgba(${r}, ${g}, ${b}, 0.14)`);
    set('--grad-body-b', `rgba(${r}, ${g}, ${b}, 0.06)`);
    // Legacy compat
    set('--primary-green', accent);
    set('--glass-border', `rgba(${r}, ${g}, ${b}, 0.22)`);
}

function extractDominantColor(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                canvas.width = 10;
                canvas.height = 10;
                ctx.drawImage(img, 0, 0, 10, 10);
                const imgData = ctx.getImageData(0, 0, 10, 10).data;

                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < imgData.length; i += 4) {
                    if (imgData[i + 3] < 100) continue; // skip highly transparent pixels
                    r += imgData[i];
                    g += imgData[i + 1];
                    b += imgData[i + 2];
                    count++;
                }
                if (count === 0) return resolve({ r: 29, g: 185, b: 84 });

                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);

                // Add minor saturation boost
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const diff = max - min;
                if (diff < 30) {
                    if (max === r) r = Math.min(255, r + 20);
                    else if (max === g) g = Math.min(255, g + 20);
                    else b = Math.min(255, b + 20);
                }

                resolve({ r, g, b });
            } catch (e) {
                console.error("Dynamic color extraction failed (CORS limit/Canvas):", e);
                resolve({ r: 29, g: 185, b: 84 }); // Fallback Spotify Classic Green
            }
        };
        img.onerror = () => resolve({ r: 29, g: 185, b: 84 });
    });
}

// ==========================================
// 📊 REAL-TIME AUDIO VISUALIZER
// ==========================================

function initVisualizer() {
    const canvas = document.getElementById('visualizer-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    window.addEventListener('resize', () => {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    });

    audioEngine.crossOrigin = "anonymous";

    function setupAudioNodes() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64; // Small fft for neat visualizer bars

            sourceNode = audioCtx.createMediaElementSource(audioEngine);
            sourceNode.connect(analyser);
            analyser.connect(audioCtx.destination);
        } catch (e) {
            console.warn("Visualizer initialization blocked or failed:", e);
        }
    }

    function draw() {
        visualizerAnimationId = requestAnimationFrame(draw);
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 0.85;
        const gap = (canvas.width / bufferLength) * 0.15;
        let x = 0;

        const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary-green').trim() || '#1db954';

        for (let i = 0; i < bufferLength; i++) {
            const percent = dataArray[i] / 255;
            const barHeight = canvas.height * percent * 0.85;

            ctx.fillStyle = primaryColor;

            ctx.beginPath();
            ctx.roundRect(x, canvas.height - barHeight - 2, barWidth, barHeight + 2, 3);
            ctx.fill();

            x += barWidth + gap;
        }
    }

    // Trigger visualizer setup on first user click or audio play
    audioEngine.addEventListener('play', () => {
        setupAudioNodes();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        if (!visualizerAnimationId) {
            draw();
        }
    });
}

// ==========================================
// 🎤 SYNCED LYRICS VIEW (LrcLib API)
// ==========================================

function initLyrics() {
    const btnToggleLyrics = document.getElementById('btn-toggle-lyrics');
    if (btnToggleLyrics) {
        btnToggleLyrics.addEventListener('click', () => {
            isLyricsOpen ? showView('home') : showLyricsView();
        });
    }
}

async function showLyricsView() {
    isLyricsOpen = true;
    showView('lyrics-view');
    document.getElementById('btn-toggle-lyrics').style.color = 'var(--primary-green)';

    const container = document.getElementById('lyrics-container');
    container.innerHTML = '<div class="lyrics-status"><i class="fas fa-spinner fa-spin"></i> Loading lyrics...</div>';

    if (!currentTrack) {
        container.innerHTML = '<div class="lyrics-status">Play a song first! 🎵</div>';
        return;
    }

    let artist = currentTrack.artist || "";
    let title = currentTrack.title || "";

    // 1. Try LrcLib first for high-quality studio synced lyrics
    try {
        // === METADATA CLEANING FOR LYRICS SEARCH (LrcLib query optimisation) ===
        if (title.includes(" - ")) {
            const parts = title.split(" - ");
            const candidateArtist = parts[0].trim();
            const candidateTitle = parts[1].trim();

            if (candidateArtist.startsWith("@") || artist.toLowerCase().includes("music") || artist.toLowerCase().includes("songs") || artist.toLowerCase().includes("records") || artist.toLowerCase().includes("channel") || artist.toLowerCase().includes("tamil") || artist.toLowerCase().includes("india") || artist.toLowerCase().includes("api")) {
                artist = candidateArtist;
                title = candidateTitle;
            }
        }

        if (title.includes(" | ")) {
            title = title.split(" | ")[0].trim();
        }

        const noiseList = [
            /\(.*?\)/g,  // Remove anything in parentheses
            /\[.*?\]/g,  // Remove anything in brackets
            /official\s*(music)?\s*(video|audio|lyric|song)?/gi,
            /video\s*song/gi,
            /lyric\s*video/gi,
            /full\s*video/gi,
            /\b(hd|4k|8k|5\.1)\b/gi,
            /remastered/gi,
            /jukebox/gi,
            /extended\s*version/gi,
            /audio\s*only/gi,
            /visualizer/gi
        ];

        noiseList.forEach(regex => {
            title = title.replace(regex, "");
        });

        title = title.replace(/[-|]/g, "").trim().replace(/\s+/g, " ");
        artist = artist.replace(/^@/, "").trim(); // Remove leading @

        const isDistributor = artist.toLowerCase().includes("music") || artist.toLowerCase().includes("songs") || artist.toLowerCase().includes("records") || artist.toLowerCase().includes("vevo");
        if (isDistributor) {
            artist = artist.replace(/\b(Music|India|Tamil|Songs|Series|Records|Vevo|Official|Entertainment|Channel)\b/gi, "").trim();
        }
        artist = artist.replace(/\s+/g, " ").trim();

        console.log(`[Lyrics Query] Querying LrcLib with Artist: "${artist}", Track: "${title}"`);

        const url = `https://lrclib.net/api/get?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}`;
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();
            if (data.syncedLyrics) {
                parseLrc(data.syncedLyrics);
                return;
            } else if (data.plainLyrics) {
                renderPlainLyrics(data.plainLyrics);
                return;
            }
        }
    } catch (e) {
        console.warn("LrcLib fetch failed, trying YouTube transcript fallback...", e);
    }

    // 2. Fallback: Query YouTube auto-generated transcripts/captions directly
    if (currentTrack.youtube_id) {
        try {
            console.log(`[Lyrics Fallback] Fetching transcript from YouTube for ID: ${currentTrack.youtube_id}`);
            const response = await fetch(`${API_BASE_URL}/api/transcript?yt_id=${currentTrack.youtube_id}`);
            if (response.ok) {
                const data = await response.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    lyricsData = data.map(item => ({
                        time: parseFloat(item.start),
                        text: item.text
                    }));
                    renderLyricsLines();
                    return;
                }
            }
        } catch (e) {
            console.warn("YouTube transcript API fetch failed:", e);
        }
    }

    // 3. Fallback: Local AI Audio Transcription
    if (currentTrack.youtube_id) {
        try {
            console.log(`[Lyrics Fallback] Generating AI Audio Transcription for ID: ${currentTrack.youtube_id}`);
            container.innerHTML = '<div class="lyrics-status"><i class="fas fa-spinner fa-spin"></i> Transcribing audio (this may take a minute)...</div>';
            const response = await fetch(`${API_BASE_URL}/api/transcribe_audio?yt_id=${currentTrack.youtube_id}`);
            if (response.ok) {
                const data = await response.json();
                if (data.transcript && Array.isArray(data.transcript) && data.transcript.length > 0) {
                    lyricsData = data.transcript.map(item => ({
                        time: parseFloat(item.time),
                        text: item.text
                    }));
                    renderLyricsLines();
                    return;
                }
            }
        } catch (e) {
            console.warn("AI transcription failed:", e);
        }
    }

    // 4. Absolute Fallback: Google Search Lyrics Button
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(artist + ' ' + title + ' lyrics')}`;
    container.innerHTML = `
        <div class="lyrics-status" style="display:flex; flex-direction:column; align-items:center; gap:15px; padding:20px; text-align:center;">
            <p style="font-size:16px; margin:0; color:var(--text-sub);">Lyrics could not be found or transcribed. 📭</p>
            <a href="${googleSearchUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:8px; padding:10px 20px; background:var(--primary-green); color:#000; font-weight:700; border-radius:30px; text-decoration:none; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                <i class="fas fa-search"></i> Search Lyrics on Google
            </a>
        </div>
    `;
}

function parseLrc(lrcText) {
    lyricsData = [];
    const lines = lrcText.split('\n');
    const timeReg = /\[(\d+):(\d+)\.(\d+)\]/;

    lines.forEach(line => {
        const match = timeReg.exec(line);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const ms = parseInt(match[3]);
            const time = minutes * 60 + seconds + ms / 100;
            const text = line.replace(timeReg, '').trim();
            lyricsData.push({ time, text });
        }
    });

    renderLyricsLines();
}

function renderLyricsLines() {
    const container = document.getElementById('lyrics-container');
    container.innerHTML = "";

    if (lyricsData.length === 0) {
        container.innerHTML = '<div class="lyrics-status">No lyrics available.</div>';
        return;
    }

    lyricsData.forEach((item, index) => {
        const lineEl = document.createElement('div');
        lineEl.className = "lyric-line";
        lineEl.id = `lyric-line-${index}`;
        lineEl.innerText = item.text || "•••";
        lineEl.addEventListener('click', () => {
            audioEngine.currentTime = item.time;
            if (isVideoOpen) syncVideoIframeToAudio();
        });
        container.appendChild(lineEl);
    });
}

function renderPlainLyrics(plainText) {
    lyricsData = []; // clear synced state
    const container = document.getElementById('lyrics-container');
    container.innerHTML = "";

    const div = document.createElement('div');
    div.style.whiteSpace = "pre-wrap";
    div.style.fontSize = "22px";
    div.style.lineHeight = "1.8";
    div.style.fontWeight = "600";
    div.style.color = "var(--text-base)";
    div.style.opacity = "0.85";
    div.innerText = plainText;
    container.appendChild(div);
}

function updateLyricsHighlight() {
    if (!isLyricsOpen || lyricsData.length === 0) return;

    const currentTime = audioEngine.currentTime;
    let activeIndex = -1;

    for (let i = 0; i < lyricsData.length; i++) {
        if (currentTime >= lyricsData[i].time) {
            activeIndex = i;
        } else {
            break;
        }
    }

    if (activeIndex !== -1) {
        document.querySelectorAll('.lyric-line').forEach(el => el.classList.remove('active'));

        const activeLine = document.getElementById(`lyric-line-${activeIndex}`);
        if (activeLine) {
            activeLine.classList.add('active');

            const container = document.getElementById('lyrics-view');
            const offsetTop = activeLine.offsetTop;
            const containerHeight = container.clientHeight;

            container.scrollTo({
                top: offsetTop - containerHeight / 2 + activeLine.clientHeight / 2,
                behavior: 'smooth'
            });
        }
    }
}

// ==========================================
// 🛌 SLEEP TIMER
// ==========================================

function initSleepTimer() {
    const btnSleepTimer = document.getElementById('btn-sleep-timer');
    const sleepDropdown = document.getElementById('sleep-dropdown');

    if (btnSleepTimer && sleepDropdown) {
        btnSleepTimer.addEventListener('click', (e) => {
            e.stopPropagation();
            sleepDropdown.classList.toggle('hidden');
        });

        // Select sleep timer minutes
        const options = sleepDropdown.querySelectorAll('div');
        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const mins = parseInt(opt.getAttribute('data-minutes'));
                setSleepTimer(mins);
                sleepDropdown.classList.add('hidden');
            });
        });
    }

    document.addEventListener('click', () => {
        if (sleepDropdown) sleepDropdown.classList.add('hidden');
    });
}

function setSleepTimer(minutes) {
    if (sleepTimerInterval) {
        clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
    }

    if (minutes === 0) {
        document.getElementById('btn-sleep-timer').style.color = '#b3b3b3';
        showToast("Sleep timer turned off ⏱️");
        return;
    }

    sleepTimeRemaining = minutes * 60;
    document.getElementById('btn-sleep-timer').style.color = 'var(--primary-green)';
    showToast(`Sleep timer set for ${minutes} minutes 🛌`);

    sleepTimerInterval = setInterval(() => {
        sleepTimeRemaining--;
        if (sleepTimeRemaining <= 0) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
            triggerSleepTimerEnd();
        }
    }, 1000);
}

function triggerSleepTimerEnd() {
    showToast("Good night! Fading out... 💤");

    let fadeSteps = 30;
    let originalVolume = audioEngine.volume;
    let fadeInterval = setInterval(() => {
        if (audioEngine.volume > 0.05) {
            audioEngine.volume = Math.max(0, audioEngine.volume - (originalVolume / fadeSteps));
            if (volumeProgress) volumeProgress.style.width = `${audioEngine.volume * 100}%`;
        } else {
            clearInterval(fadeInterval);
            if (isPlaying) togglePlay(); // pause playback
            audioEngine.volume = originalVolume; // restore original volume
            if (volumeProgress) volumeProgress.style.width = `${originalVolume * 100}%`;
            document.getElementById('btn-sleep-timer').style.color = '#b3b3b3';
        }
    }, 100);
}

// ==========================================
// ❤️ SMART PLAYLIST (Favorites / Liked Songs)
// ==========================================

function initLikeSystem() {
    const btnLikeTrack = document.getElementById('btn-like-track');
    const btnLikeTheater = document.getElementById('btn-like-theater');

    if (btnLikeTrack) btnLikeTrack.addEventListener('click', () => toggleLikeCurrentTrack());
    if (btnLikeTheater) btnLikeTheater.addEventListener('click', () => toggleLikeCurrentTrack());
}

function toggleLikeCurrentTrack() {
    if (!currentTrack) return;

    const likedPlaylist = playlists.liked;
    const isLiked = likedPlaylist.tracks.some(t => t.id === currentTrack.id);

    if (isLiked) {
        likedPlaylist.tracks = likedPlaylist.tracks.filter(t => t.id !== currentTrack.id);
        showToast("Removed from Liked Songs 💔");
    } else {
        likedPlaylist.tracks.push(currentTrack);
        showToast("Added to Liked Songs ❤️");
    }

    savePlaylists();
    updateLikeButtonState();
    renderSidebarPlaylists();
}

function updateLikeButtonState() {
    const btnLikeTrack = document.getElementById('btn-like-track');
    const btnLikeTheater = document.getElementById('btn-like-theater');

    if (!currentTrack) {
        if (btnLikeTrack) btnLikeTrack.className = "far fa-heart";
        if (btnLikeTheater) btnLikeTheater.className = "far fa-heart";
        return;
    }

    const isLiked = playlists.liked.tracks.some(t => t.id === currentTrack.id);

    if (isLiked) {
        if (btnLikeTrack) {
            btnLikeTrack.className = "fas fa-heart";
            btnLikeTrack.classList.add('liked');
        }
        if (btnLikeTheater) {
            btnLikeTheater.className = "fas fa-heart";
            btnLikeTheater.classList.add('liked');
        }
    } else {
        if (btnLikeTrack) {
            btnLikeTrack.className = "far fa-heart";
            btnLikeTrack.classList.remove('liked');
        }
        if (btnLikeTheater) {
            btnLikeTheater.className = "far fa-heart";
            btnLikeTheater.classList.remove('liked');
        }
    }
}

// ==========================================
// 🔎 SEARCH HISTORY LOGGING
// ==========================================

function initSearchHistory() {
    const input = document.getElementById('web-search-input');
    if (input) {
        input.addEventListener('focus', renderSearchHistory);
    }
}

function renderSearchHistory() {
    const view = document.getElementById('search-view');
    if (!view || view.classList.contains('hidden')) return;

    let historyContainer = document.getElementById('search-history');
    if (!historyContainer) {
        historyContainer = document.createElement('div');
        historyContainer.id = 'search-history';
        historyContainer.className = 'search-history-container';

        const placeholderContent = document.getElementById('search-placeholder-content');
        if (placeholderContent) {
            placeholderContent.parentNode.insertBefore(historyContainer, placeholderContent);
        }
    }

    if (searchHistory.length === 0) {
        historyContainer.innerHTML = "";
        return;
    }

    historyContainer.innerHTML = `
        <div class="search-history-title">
            <h3>Recent Searches</h3>
            <button id="btn-clear-history">Clear All</button>
        </div>
        <div class="search-history-list">
            ${searchHistory.map((query, index) => `
                <div class="history-tag" data-query="${encodeURIComponent(query)}">
                    <span>${query}</span>
                    <i class="fas fa-times" data-index="${index}"></i>
                </div>
            `).join('')}
        </div>
    `;

    // Bind tag click trigger
    historyContainer.querySelectorAll('.history-tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            if (e.target.closest('i.fa-times')) return; // ignore if clicking delete icon
            const query = decodeURIComponent(tag.getAttribute('data-query'));
            document.getElementById('web-search-input').value = query;
            performSearch(query);
        });
    });

    // Bind individual delete trigger
    historyContainer.querySelectorAll('.fa-times').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.getAttribute('data-index'));
            searchHistory.splice(index, 1);
            localStorage.setItem('spotify_search_history', JSON.stringify(searchHistory));
            renderSearchHistory();
        });
    });

    // Clear all trigger
    const btnClear = document.getElementById('btn-clear-history');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            searchHistory = [];
            localStorage.setItem('spotify_search_history', JSON.stringify(searchHistory));
            renderSearchHistory();
        });
    }
}

function addSearchToHistory(query) {
    if (!query) return;
    const cleanQuery = query.trim();
    if (cleanQuery === '') return;

    searchHistory = searchHistory.filter(q => q !== cleanQuery);
    searchHistory.unshift(cleanQuery);

    if (searchHistory.length > 8) {
        searchHistory.pop();
    }

    localStorage.setItem('spotify_search_history', JSON.stringify(searchHistory));
}

// ==========================================
// 🔗 SOCIAL & TRACK SHARING SYNC
// ==========================================

function initSharing() {
    const btnShareTrack = document.getElementById('btn-share-track');
    const btnShareTheater = document.getElementById('btn-share-theater');

    if (btnShareTrack) btnShareTrack.addEventListener('click', () => shareCurrentTrack());
    if (btnShareTheater) btnShareTheater.addEventListener('click', () => shareCurrentTrack());

    // Verify parameters on initial load
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get('track');
    if (trackId) {
        const title = params.get('title') || 'Shared Song';
        const artist = params.get('artist') || 'Unknown';
        const art = params.get('art') || '';
        const sharedTrack = {
            id: trackId,
            title: title,
            artist: artist,
            album_art: art,
            youtube_id: trackId
        };
        setTimeout(() => {
            playTrack(sharedTrack);
            showToast(`Loading Shared Song: ${title} 🎵`);
        }, 1000);
    }
}

function shareCurrentTrack() {
    if (!currentTrack) {
        showToast("No song is currently playing!");
        return;
    }

    const trackUrl = `${window.location.origin}${window.location.pathname}?track=${encodeURIComponent(currentTrack.id)}&title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}&art=${encodeURIComponent(currentTrack.album_art || '')}`;
    const statusText = `🎧 Listening to "${currentTrack.title}" by ${currentTrack.artist} on Personal Spotify`;

    // Double click to copy status text helper
    const now = Date.now();
    const btnShareTrack = document.getElementById('btn-share-track');
    const lastTap = btnShareTrack ? (btnShareTrack.dataset.lastTap || 0) : 0;

    if (now - lastTap < 300) {
        navigator.clipboard.writeText(statusText).then(() => {
            showToast("Currently Playing badge copied to clipboard! 📝");
        });
    } else {
        navigator.clipboard.writeText(trackUrl).then(() => {
            showToast("Share link copied! 🔗 Double click/tap to copy Status badge.");
        }).catch(err => {
            console.error("Clipboard write blocked:", err);
        });
    }
    if (btnShareTrack) btnShareTrack.dataset.lastTap = now;
}

// ==========================================
// 📱 MOBILE FULL-SCREEN PLAYER & SWIPE GESTURES
// ==========================================

function initMobilePlayer() {
    const playerBar = document.querySelector('.player-bar');
    const mobileTheater = document.getElementById('mobile-theater-view');
    const btnCollapse = document.getElementById('btn-collapse-theater');

    if (playerBar && mobileTheater) {
        playerBar.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return;

            // Only trigger expand if clicking background or cover (not interactive buttons)
            const isClickOnControl = e.target.closest('.player-controls') ||
                e.target.closest('.volume-controls') ||
                e.target.closest('#playlist-select-menu') ||
                e.target.closest('#btn-add-current-playlist') ||
                e.target.closest('#btn-like-track') ||
                e.target.closest('#btn-share-track');
            if (isClickOnControl) return;

            expandMobilePlayer();
        });
    }

    if (btnCollapse) btnCollapse.addEventListener('click', collapseMobilePlayer);

    const theaterBody = mobileTheater ? mobileTheater.querySelector('.theater-body') : null;
    if (theaterBody) {
        theaterBody.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        theaterBody.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipeGesture();
        }, { passive: true });
    }
}

function expandMobilePlayer() {
    const mobileTheater = document.getElementById('mobile-theater-view');
    if (mobileTheater) {
        mobileTheater.classList.remove('hidden-theater');
        updateTheaterViewDOM();
    }
}

function collapseMobilePlayer() {
    const mobileTheater = document.getElementById('mobile-theater-view');
    if (mobileTheater) {
        mobileTheater.classList.add('hidden-theater');
    }
}

function handleSwipeGesture() {
    const swipeThreshold = 65; // swipe distance trigger
    const diff = touchEndX - touchStartX;

    if (Math.abs(diff) < swipeThreshold) return;

    if (diff > 0) {
        playPreviousTrack();
        showToast("⏪ Swiped back");
    } else {
        playNextTrack();
        showToast("⏩ Swiped next");
    }
}

function updateTheaterViewDOM() {
    const mobileTheater = document.getElementById('mobile-theater-view');
    if (!mobileTheater || mobileTheater.classList.contains('hidden-theater') || !currentTrack) return;

    document.getElementById('theater-album-art').src = currentTrack.album_art || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
    document.getElementById('theater-track-title').innerText = currentTrack.title;
    document.getElementById('theater-track-artist').innerText = currentTrack.artist;

    updateTheaterPlayPauseButton();
    updateTheaterProgress();
    updateLikeButtonState();
}

function updateTheaterPlayPauseButton() {
    const btn = document.getElementById('theater-play-pause-btn');
    if (btn) {
        btn.innerHTML = isPlaying ? '<i class="fas fa-pause-circle"></i>' : '<i class="fas fa-play-circle"></i>';
    }
}

function updateTheaterProgress() {
    if (!currentTrack) return;
    const duration = audioEngine.duration || currentTrack.duration || 0;
    const curTime = audioEngine.currentTime || 0;

    const fill = document.getElementById('theater-progress-fill');
    const curTimeSpan = document.getElementById('theater-current-time');
    const totTimeSpan = document.getElementById('theater-total-time');

    if (fill) {
        const percent = duration ? (curTime / duration) * 100 : 0;
        fill.style.width = `${percent}%`;
    }

    if (curTimeSpan) curTimeSpan.innerText = formatTime(curTime);
    if (totTimeSpan) totTimeSpan.innerText = formatTime(duration);
}

function initTheaterControls() {
    document.getElementById('theater-play-pause-btn')?.addEventListener('click', togglePlay);
    document.getElementById('theater-btn-next')?.addEventListener('click', playNextTrack);
    document.getElementById('theater-btn-prev')?.addEventListener('click', playPreviousTrack);
    document.getElementById('theater-btn-shuffle')?.addEventListener('click', toggleShuffle);
    document.getElementById('theater-btn-repeat')?.addEventListener('click', toggleRepeat);
}

