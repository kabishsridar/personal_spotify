/** 💎 Standalone Spotify - TOTAL HARDENING EDITION 💎 */

// 🛡️ BACKGROUND PLAYBACK: Spoof visibility to prevent YouTube Iframe from pausing
Object.defineProperty(document, 'hidden', { value: false, writable: false });
Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });

// Intercept visibilitychange events at capture phase to completely block YouTube from realizing the app has been minimized
window.addEventListener('visibilitychange', (e) => { e.stopImmediatePropagation(); }, true);
document.addEventListener('visibilitychange', (e) => { e.stopImmediatePropagation(); }, true);
window.addEventListener('webkitvisibilitychange', (e) => { e.stopImmediatePropagation(); }, true);
document.addEventListener('webkitvisibilitychange', (e) => { e.stopImmediatePropagation(); }, true);

let ytPlayer = null;
let ytReady = false;
let activeEngine = 'local'; // 'local' (offline files & background streams) or 'youtube' (failsafe player)

window.onYouTubeIframeAPIReady = function() {
    const originUrl = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '*';
    ytPlayer = new YT.Player('youtube-player', {
        height: '100%', width: '100%',
        playerVars: { 
            'autoplay': 1, 
            'controls': 0, 
            'modestbranding': 1, 
            'rel': 0, 
            'playsinline': 1,
            'origin': originUrl
        },
        events: { 
            'onReady': () => { ytReady = true; showToast("Direct Engine: ONLINE ✅"); },
            'onStateChange': onPlayerStateChange
        }
    });
};

// Dynamically load YouTube Iframe Player API to prevent static race conditions
(function() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
})();

function onPlayerStateChange(e) {
    isPlaying = (e.data === 1 || e.data === 3);
    updatePlayIcons();
    // Auto-play next if song ends
    if (e.data === 0) { 
        if (isRepeat) { ytPlayer.playVideo(); } else { playNext(); }
    }
}

// State
let currentTrack = null;
let isPlaying = false;
let currentQueue = [];
let searchCache = new Map();
let currentViewId = 'home';
let isShuffle = false;
let isRepeat = false;
let isRestoredState = false;
let pendingRestoreSeek = 0;
let progressTicks = 0;
let userQueue = [];
let playlists = {};
let downloads = [];
let pendingTrack = null;
let currentLibraryTab = 'playlists';
let navigationHistory = [];
let hasPrefetchedNext = false;
let prefetchedStreamCache = new Map(); // trackId -> { source, url }
let autoplayRecommendations = []; // Related tracks for autoplay (Spotify Radio)

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout")), ms);
        promise.then(
            (res) => { clearTimeout(timer); resolve(res); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

const audioEngine = {
    async play(url, title, artist, artUrl, rawFileUri = null) {
        const { NativeAudioPlayer } = window.Capacitor?.Plugins || {};
        if (NativeAudioPlayer) {
            try {
                activeEngine = 'native';
                const targetUrl = rawFileUri || url;
                await NativeAudioPlayer.play({ url: targetUrl, title, artist, artUrl });
                if (pendingRestoreSeek > 0) {
                    await NativeAudioPlayer.seek({ seconds: pendingRestoreSeek });
                    pendingRestoreSeek = 0;
                }
                return true;
            } catch(e) {
                console.error("Native play failed, falling back to local tag:", e);
            }
        }
        
        // Fallback: standard localPlayer audio tag
        activeEngine = 'local';
        const localPlayer = document.getElementById('local-player');
        if (localPlayer) {
            localPlayer.src = url;
            if (pendingRestoreSeek > 0) {
                localPlayer.currentTime = pendingRestoreSeek;
                pendingRestoreSeek = 0;
            }
            await localPlayer.play();
            return true;
        }
        return false;
    },
    
    async pause() {
        const { NativeAudioPlayer } = window.Capacitor?.Plugins || {};
        if (NativeAudioPlayer && activeEngine === 'native') {
            await NativeAudioPlayer.pause();
        } else {
            const localPlayer = document.getElementById('local-player');
            if (localPlayer) localPlayer.pause();
        }
    },
    
    async resume() {
        const { NativeAudioPlayer } = window.Capacitor?.Plugins || {};
        if (NativeAudioPlayer && activeEngine === 'native') {
            await NativeAudioPlayer.resume();
        } else {
            const localPlayer = document.getElementById('local-player');
            if (localPlayer && localPlayer.src) await localPlayer.play();
        }
    },
    
    async seek(seconds) {
        const { NativeAudioPlayer } = window.Capacitor?.Plugins || {};
        if (NativeAudioPlayer && activeEngine === 'native') {
            await NativeAudioPlayer.seek({ seconds });
        } else {
            const localPlayer = document.getElementById('local-player');
            if (localPlayer) localPlayer.currentTime = seconds;
        }
    }
};

function setupNativeAudioPlayer() {
    const { NativeAudioPlayer } = window.Capacitor?.Plugins || {};
    if (NativeAudioPlayer) {
        NativeAudioPlayer.addListener('audioEvent', (info) => {
            console.log("Native Audio Event:", info.event);
            if (info.event === 'ended') {
                if (isRepeat) {
                    audioEngine.seek(0);
                    audioEngine.resume();
                } else {
                    playNext();
                }
            } else if (info.event === 'play') {
                isPlaying = true;
                updatePlayIcons();
            } else if (info.event === 'pause') {
                isPlaying = false;
                updatePlayIcons();
            } else if (info.event === 'next') {
                playNext();
            } else if (info.event === 'prev') {
                playPrev();
            }
        });
    }
}

async function loadDatabase() {
    // Polling handshake: Wait up to 1 second for the Capacitor native bridge plugins to initialize
    for (let i = 0; i < 10; i++) {
        if (window.Capacitor?.Plugins?.Preferences) break;
        await new Promise(r => setTimeout(r, 100));
    }

    const { Preferences } = window.Capacitor?.Plugins || {};
    if (Preferences) {
        try {
            const pRes = await Preferences.get({ key: 'spotify_playlists' });
            playlists = JSON.parse(pRes.value) || {};
        } catch(e) { playlists = {}; }
        try {
            const dRes = await Preferences.get({ key: 'spotify_downloads' });
            downloads = JSON.parse(dRes.value) || [];
        } catch(e) { downloads = []; }
    } else {
        try { playlists = JSON.parse(localStorage.getItem('spotify_playlists')) || {}; } catch(e) { playlists = {}; }
        try { downloads = JSON.parse(localStorage.getItem('spotify_downloads')) || []; } catch(e) { downloads = []; }
    }
}

async function saveDatabase() {
    const { Preferences } = window.Capacitor?.Plugins || {};
    if (Preferences) {
        try {
            await Preferences.set({ key: 'spotify_playlists', value: JSON.stringify(playlists) });
            await Preferences.set({ key: 'spotify_downloads', value: JSON.stringify(downloads) });
        } catch(e) {}
    }
    try {
        localStorage.setItem('spotify_playlists', JSON.stringify(playlists));
        localStorage.setItem('spotify_downloads', JSON.stringify(downloads));
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
    setupListeners();
    setupBackButton();
    setupNetworkWatcher();
    setupNativeAudioPlayer();
    await loadDatabase();
    await restorePlaybackState();
    
    const localPlayer = document.getElementById('local-player');
    if (localPlayer) {
        localPlayer.onended = () => {
            if (isRepeat) localPlayer.play();
            else playNext();
        };
    }
    
    // Cleanly stop playback and release audio pipeline when user swipes away or closes process
    const stopAudioOnClose = () => {
        if (localPlayer) {
            try { localPlayer.pause(); localPlayer.src = ""; } catch(e) {}
        }
        if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
            try { ytPlayer.pauseVideo(); } catch(e) {}
        }
    };
    window.addEventListener('beforeunload', stopAudioOnClose);
    window.addEventListener('pagehide', stopAudioOnClose);
});

document.addEventListener('deviceready', () => {
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
        window.cordova.plugins.backgroundMode.enable();
        
        // Ensure Android runs the WebView as a high-priority media Foreground Service
        window.cordova.plugins.backgroundMode.setDefaults({
            title: '45 Personal Spotify',
            text: 'Playing music smoothly in the background...',
            icon: 'ic_launcher',
            color: '1DB954',
            resume: true,
            hidden: true,
            silent: true,
            stopOnTerminate: false // 💥 KEEP NATIVE PLAYBACK SERVICE IMMORTAL WHEN SWIPED AWAY FROM RECENTS
        });

        window.cordova.plugins.backgroundMode.on('activate', function() {
            window.cordova.plugins.backgroundMode.disableWebViewOptimizations(); 
            // Ask system to whitelist the app from aggressive background battery optimizations (keeps WebView alive forever!)
            if (typeof window.cordova.plugins.backgroundMode.disableBatteryOptimizations === 'function') {
                try { window.cordova.plugins.backgroundMode.disableBatteryOptimizations(); } catch(e) {}
            }
        });
    }
}, false);

/** 🛠️ NETWORK WATCHER */
function setupNetworkWatcher() {
    window.addEventListener('online', () => showToast("Back Online! 📶"));
    window.addEventListener('offline', () => showToast("Network Lost. Waiting... ⚠️"));
}

/** 🛠️ SMART BACK-BUTTON */
async function setupBackButton() {
    const { App } = window.Capacitor?.Plugins || {};
    if (!App) return;
    App.addListener('backButton', () => {
        if (document.getElementById('theater-view').classList.contains('hidden-theater') === false) {
            closeTheater();
            return;
        }
        if (currentViewId === 'playlist-view' && currentActivePlaylist) {
            currentActivePlaylist = null;
            renderLibrary();
            return;
        }
        if (navigationHistory.length > 0) {
            const prev = navigationHistory.pop();
            showView(prev, false);
            return;
        }
        
        // Root view (Home screen): Move app to background (minimize) just like Spotify!
        if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
            try {
                window.cordova.plugins.backgroundMode.moveToBackground();
            } catch(e) {}
        }
    });
}

/** 🛠️ DIRECT ENGINE: Handshake Protocol */
async function directEngineSearch(query) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20231110.01.00',
        'Accept': '*/*'
    };
    const searchAppend = query.toLowerCase().includes("song") ? "" : " song";
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + searchAppend)}&pbj=1`;

    try {
        const http = window.Capacitor?.Plugins?.CapacitorHttp || window.Capacitor?.Plugins?.Http;
        if (http) {
            const response = await http.get({ url: url, headers: headers });
            const raw = JSON.stringify(response.data);
            const matches = [...raw.matchAll(/videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"/g)];
            const results = [];
            for (let i = 0; i < matches.length; i++) {
                const vidId = matches[i][1];
                results.push({
                    id: vidId,
                    title: matches[i][2].replace(/\\u0026/g, '&'),
                    artist: "Premium Source",
                    art: `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`
                });
                if (results.length >= 20) break;
            }
            return results;
        }
        return [];
    } catch (e) { return []; }
}

async function performSearch(query) {
    if (!query) return;
    if (!navigator.onLine) { showToast("No Internet Connection ❌"); return; }
    
    showView('search-view');
    const list = document.getElementById('results-list');
    
    // Memory Guardian: Limit cache size
    if (searchCache.size > 50) { searchCache.clear(); }
    if (searchCache.has(query)) { renderResults(searchCache.get(query)); return; }

    list.innerHTML = `<div class="loader">AUDITING GLOBAL SERVER...</div>`;
    
    try {
        const results = await directEngineSearch(query);
        if (results && results.length > 0) {
            searchCache.set(query, results);
            renderResults(results);
        } else {
            list.innerHTML = `<p style="padding:40px; text-align:center; color:#888;">No tracks found in this region.</p>`;
        }
    } catch (e) {
        list.innerHTML = `<p style="padding:40px; text-align:center; color:red;">Engine Error. Try again.</p>`;
    }
}

function renderResults(data) {
    const list = document.getElementById('results-list');
    list.innerHTML = "";
    currentQueue = data;
    data.forEach(track => {
        const div = document.createElement('div');
        div.className = "track-card";
        div.innerHTML = `
            <img src="${track.art}" onerror="this.src='https://via.placeholder.com/300/1DB954/FFFFFF?text=Audio'" loading="lazy" onclick="playTrackById('${track.id}')" style="cursor: pointer;">
            <div class="info" onclick="playTrackById('${track.id}')" style="cursor: pointer;"><div class="name">${track.title}</div><div class="artist">Premium Audio</div></div>
            <div style="display:flex; gap:15px; align-items:center;">
                <i class="fas fa-folder-plus" style="font-size:20px; color:#888; cursor:pointer;" onclick="openPlaylistModal('${track.id}')"></i>
                <i class="fas fa-download" style="font-size:20px; color:#888; cursor:pointer;" onclick="downloadTrackById('${track.id}')"></i>
                <i class="fas fa-plus" style="font-size:20px; color:#888; cursor:pointer;" onclick="addToQueueById('${track.id}')"></i>
            </div>
        `;
        list.appendChild(div);
    });
}

window.openPlaylistModal = function(id) {
    pendingTrack = currentQueue.find(t => t.id === id) || downloads.find(t => t.id === id) || Object.values(playlists).flat().find(t => t.id === id);
    if (pendingTrack) {
        document.getElementById('playlist-modal').style.display = 'flex';
        
        const container = document.getElementById('existing-playlists-container');
        container.innerHTML = "";
        const names = Object.keys(playlists);
        if (names.length > 0) {
            names.forEach(name => {
                const btn = document.createElement('div');
                btn.style = "padding:12px; background:#333; border-radius:8px; color:white; cursor:pointer; font-weight:bold; font-size:14px; transition: background 0.2s;";
                btn.innerText = `+ ${name} (${playlists[name].length} tracks)`;
                btn.onclick = () => {
                    document.getElementById('playlist-name-input').value = name;
                    confirmAddToPlaylist();
                };
                container.appendChild(btn);
            });
        }
        document.getElementById('playlist-name-input').focus();
    }
}

window.closePlaylistModal = function() {
    document.getElementById('playlist-modal').style.display = 'none';
    pendingTrack = null;
    document.getElementById('playlist-name-input').value = "";
}

window.confirmAddToPlaylist = function() {
    const name = document.getElementById('playlist-name-input').value.trim();
    if (!name || !pendingTrack) return;
    if (!playlists[name]) playlists[name] = [];
    if (!playlists[name].find(t => t.id === pendingTrack.id)) {
        playlists[name].push(pendingTrack);
        saveDatabase();
        showToast(`Added to ${name} 📁`);
    } else {
        showToast(`Already in ${name}`);
    }
    closePlaylistModal();
    if (currentViewId === 'playlist-view') renderLibrary();
}

window.downloadTrackById = async function(id) {
    const track = currentQueue.find(t => t.id === id) || Object.values(playlists).flat().find(t=>t.id===id);
    if (!track) return;
    
    if (downloads.find(t => t.id === id)) {
        showToast("Already Downloaded ✅");
        return;
    }
    
    const downloadingTrack = { ...track, isLocal: false, downloadProgress: 0, isDownloading: true };
    downloads.push(downloadingTrack);
    if (currentViewId === 'playlist-view' && currentLibraryTab === 'downloads') renderLibrary();
    
    showToast(`Downloading: ${track.title} ⬇️`);
    const startTime = Date.now();
    let progressListener = null;
    
    try {
        const pipedInstances = [
            "https://pipedapi.kavin.rocks",
            "https://pipedapi.tokhmi.xyz",
            "https://api.piped.privacydev.net",
            "https://piped-api.lunar.icu",
            "https://api.piped.yt",
            "https://pipedapi.smnz.de"
        ];
        
        let audioStream = null;
        for (const instance of pipedInstances) {
            try {
                const res = await fetch(`${instance}/streams/${id}`);
                if (!res.ok) continue;
                const data = await res.json();
                if (data && data.audioStreams) {
                    audioStream = data.audioStreams.find(s => s.mimeType.includes("audio/mp4") || s.mimeType.includes("audio/webm"));
                    if (audioStream) {
                        console.log("Stream secured via:", instance);
                        break;
                    }
                }
            } catch (err) {
                console.warn(instance + " unavailable, failing over...");
            }
        }
        
        if (!audioStream) throw new Error("All API nodes failed");
        
        const { Filesystem, Directory } = window.Capacitor?.Plugins || {};
        let localPath = audioStream.url;
        
        if (Filesystem) {
            const dirName = 'SpotifyDownloads';
            try {
                await Filesystem.mkdir({
                    path: dirName,
                    directory: Directory.Data,
                    recursive: true
                });
            } catch(e) {} // Exists
            
            const path = `${dirName}/${track.title.replace(/[^a-zA-Z0-9]/g, '_')}_${id}.m4a`;
            
            if (Filesystem.addListener) {
                progressListener = await Filesystem.addListener('progress', (progress) => {
                    if (progress.url === audioStream.url) {
                        const pct = Math.round((progress.bytes / progress.contentLength) * 100);
                        const elapsed = (Date.now() - startTime) / 1000;
                        const speed = progress.bytes / elapsed;
                        const remaining = (progress.contentLength - progress.bytes) / speed;
                        downloadingTrack.downloadProgress = pct;
                        downloadingTrack.downloadTimeRemaining = Math.round(remaining);
                        if (currentViewId === 'playlist-view' && currentLibraryTab === 'downloads') {
                            const el = document.getElementById(`dl-status-${id}`);
                            if(el) el.innerText = `Downloading: ${pct}% (${Math.round(remaining)}s left)`;
                        }
                    }
                });
            }
            
            await Filesystem.downloadFile({
                url: audioStream.url,
                path: path,
                directory: Directory.Data,
                progress: true
            });
            
            downloadingTrack.isLocal = true;
            downloadingTrack.isDownloading = false;
            downloadingTrack.localUrl = path;
            saveDatabase();
            showToast("Download Complete! ✅");
            if (currentViewId === 'playlist-view' && currentLibraryTab === 'downloads') renderLibrary();
        } else {
            downloadingTrack.isLocal = true;
            downloadingTrack.isDownloading = false;
            downloadingTrack.localUrl = localPath;
            saveDatabase();
            if (currentViewId === 'playlist-view') renderLibrary();
        }
    } catch(e) {
        showToast("Download Failed ❌");
        downloads = downloads.filter(t => t.id !== id);
        if (currentViewId === 'playlist-view' && currentLibraryTab === 'downloads') renderLibrary();
    } finally {
        if (progressListener) progressListener.remove();
    }
}

let currentActivePlaylist = null;

window.switchLibraryTab = function(tab) {
    currentLibraryTab = tab;
    currentActivePlaylist = null;
    document.getElementById('tab-playlists').style.color = tab === 'playlists' ? 'white' : '#888';
    document.getElementById('tab-downloads').style.color = tab === 'downloads' ? 'white' : '#888';
    renderLibrary();
}

function renderLibrary() {
    const list = document.getElementById('library-content');
    list.innerHTML = "";
    if (currentLibraryTab === 'playlists') {
        if (currentActivePlaylist) {
            const pName = currentActivePlaylist;
            const tracks = playlists[pName] || [];
            
            const header = document.createElement('div');
            header.style = "display:flex; align-items:center; gap:15px; margin-bottom:20px;";
            header.innerHTML = `
                <i class="fas fa-arrow-left" style="font-size:24px; cursor:pointer;" onclick="currentActivePlaylist=null; renderLibrary();"></i>
                <h2 style="margin:0; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${pName}</h2>
                <i class="fas fa-edit" style="font-size:20px; color:#888; cursor:pointer;" onclick="renamePlaylist('${pName}')"></i>
                <i class="fas fa-trash-alt" style="font-size:20px; color:#e91429; cursor:pointer;" onclick="deletePlaylist('${pName}')"></i>
                <i class="fas fa-play-circle" style="font-size:36px; color:var(--accent); cursor:pointer;" onclick="playPlaylist('${pName}')"></i>
            `;
            list.appendChild(header);
            
            if (tracks.length === 0) { 
                const emptyMsg = document.createElement('p');
                emptyMsg.style = "text-align:center; color:#888; margin-top:20px;";
                emptyMsg.innerText = "Empty Playlist.";
                list.appendChild(emptyMsg);
                return; 
            }
            
            currentQueue = tracks;
            tracks.forEach(track => {
                const div = document.createElement('div');
                div.className = "track-card";
                div.innerHTML = `
                    <img src="${track.art}" onerror="this.src='https://via.placeholder.com/300/1DB954/FFFFFF?text=Audio'" loading="lazy" onclick="playTrackById('${track.id}')" style="cursor: pointer;">
                    <div class="info" onclick="playTrackById('${track.id}')" style="cursor: pointer;"><div class="name">${track.title}</div><div class="artist">Playlist Track</div></div>
                    <div style="display:flex; gap:15px; align-items:center;">
                        <i class="fas fa-download" style="font-size:18px; color:#888; cursor:pointer;" onclick="downloadTrackById('${track.id}')"></i>
                        <i class="fas fa-plus" style="font-size:18px; color:#888; cursor:pointer;" onclick="addToQueueById('${track.id}')"></i>
                        <i class="fas fa-minus-circle" style="font-size:18px; color:#e91429; cursor:pointer;" onclick="removeTrackFromPlaylist('${pName}', '${track.id}')"></i>
                    </div>
                `;
                list.appendChild(div);
            });
            return;
        }

        const names = Object.keys(playlists);
        if (names.length === 0) { list.innerHTML = `<p style="text-align:center; color:#888;">No playlists yet.</p>`; return; }
        names.forEach(name => {
            const div = document.createElement('div');
            div.style = "padding:15px; background:var(--glass); border-radius:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;";
            div.innerHTML = `
                <div style="flex:1; cursor:pointer;" onclick="currentActivePlaylist='${name}'; renderLibrary();">
                    <h3 style="margin:0;">${name}</h3>
                    <p style="margin:5px 0 0 0; color:#888; font-size:12px;">${playlists[name].length} tracks</p>
                </div>
                <i class="fas fa-play-circle" style="font-size:36px; color:var(--accent); cursor:pointer;" onclick="playPlaylist('${name}')"></i>
            `;
            list.appendChild(div);
        });
    } else {
        if (downloads.length === 0) { list.innerHTML = `<p style="text-align:center; color:#888;">No downloads yet.</p>`; return; }
        currentQueue = downloads.filter(t => !t.isDownloading);
        downloads.forEach(track => {
            const div = document.createElement('div');
            div.className = "track-card";
            if (track.isDownloading) {
                div.innerHTML = `
                    <img src="${track.art}" onerror="this.src='https://via.placeholder.com/300/1DB954/FFFFFF?text=Audio'" loading="lazy" style="opacity: 0.5;">
                    <div class="info">
                        <div class="name" style="color: #888;">${track.title}</div>
                        <div class="artist" id="dl-status-${track.id}" style="color: var(--accent);">Starting...</div>
                    </div>
                    <div class="play-icon"><i class="fas fa-spinner fa-spin" style="color: #888; font-size: 20px;"></i></div>
                `;
            } else {
                div.innerHTML = `
                    <img src="${track.art}" onerror="this.src='https://via.placeholder.com/300/1DB954/FFFFFF?text=Audio'" loading="lazy" onclick="playTrackById('${track.id}')" style="cursor: pointer;">
                    <div class="info" onclick="playTrackById('${track.id}')" style="cursor: pointer;"><div class="name">${track.title}</div><div class="artist">Downloaded</div></div>
                    <div class="play-icon" onclick="playTrackById('${track.id}')" style="cursor: pointer;"><i class="fas fa-play"></i></div>
                `;
            }
            list.appendChild(div);
        });
    }
}

window.removeTrackFromPlaylist = function(playlistName, trackId) {
    if (!playlists[playlistName]) return;
    playlists[playlistName] = playlists[playlistName].filter(t => t.id !== trackId);
    saveDatabase();
    showToast("Song removed from playlist 🗑️");
    renderLibrary();
}

window.renamePlaylist = function(oldName) {
    const newName = prompt("Rename playlist to:", oldName);
    if (!newName || newName.trim() === "") return;
    const trimmed = newName.trim();
    if (trimmed === oldName) return;
    if (playlists[trimmed]) {
        showToast("A playlist with this name already exists!");
        return;
    }
    playlists[trimmed] = playlists[oldName];
    delete playlists[oldName];
    saveDatabase();
    currentActivePlaylist = trimmed;
    showToast("Playlist renamed! ✏️");
    renderLibrary();
}

window.deletePlaylist = function(name) {
    if (confirm(`Delete the playlist "${name}"?`)) {
        delete playlists[name];
        saveDatabase();
        currentActivePlaylist = null;
        showToast("Playlist deleted 🗑️");
        renderLibrary();
    }
}

window.playPlaylist = function(name) {
    if (!playlists[name] || playlists[name].length === 0) {
        showToast("Playlist is empty");
        return;
    }
    currentQueue = [...playlists[name]];
    isShuffle = true;
    const shufBtn = document.getElementById('theater-btn-shuffle');
    if(shufBtn) shufBtn.style.color = 'var(--accent)';
    currentQueue.sort(() => Math.random() - 0.5);
    playTrack(currentQueue[0]);
    showView('home');
}

window.playTrackById = function(id) {
    const track = currentQueue.find(t => t.id === id);
    if(track) playTrack(track);
}

window.addToQueueById = function(id) {
    const track = currentQueue.find(t => t.id === id);
    if(track) {
        userQueue.push(track);
        showToast("Added to Play Next 🎶");
    }
}

function playTrack(track) {
    currentTrack = track;
    isRestoredState = false;
    hasPrefetchedNext = false; // Reset smart prefetch trigger
    savePlaybackState();
    updatePlayerUI(track);
    
    // Background fetch related songs for Spotify Radio (Autoplay)
    fetchAutoplayRecommendations(track);
    
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        try { ytPlayer.pauseVideo(); } catch(e) {}
    }
    audioEngine.pause();
    
    if (track.isLocal) {
        activeEngine = 'local';
        showToast(`Playing Offline: ${track.title}`);
        const playLocal = async () => {
            let src = track.localUrl;
            let rawFileUri = null;
            const { Filesystem, Directory, Capacitor } = window.Capacitor?.Plugins || {};
            if (Filesystem && !src.startsWith('http')) {
                try {
                    const uri = await Filesystem.getUri({ path: track.localUrl, directory: Directory.Documents });
                    rawFileUri = uri.uri;
                    src = Capacitor.convertFileSrc(uri.uri);
                } catch(e) {}
            }
            await audioEngine.play(src, track.title, track.artist, track.art, rawFileUri);
            isPlaying = true;
            updatePlayIcons();
        };
        playLocal();
    } else {
        showToast(`Streaming: ${track.title}`);
        activeEngine = 'native'; // Try hardware-accelerated background-ready native engine first
        const playOnlineStream = async () => {
            const success = await streamTrackAudio(track);
            if (!success) {
                // Failsafe backup: Fallback to YouTube Video Player
                activeEngine = 'youtube';
                showToast("Direct stream failed, using backup player... 🔄");
                if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                    try {
                        ytPlayer.unMute();
                        const seekSec = pendingRestoreSeek > 0 ? pendingRestoreSeek : 0;
                        ytPlayer.loadVideoById(track.id, seekSec);
                        pendingRestoreSeek = 0;
                    } catch(e) {}
                } else {
                    showToast("Playback error: engine initializing");
                }
            }
        };
        playOnlineStream();
        isPlaying = true;
        updatePlayIcons();
    }
}

async function compatiblePromiseAny(promises) {
    return new Promise((resolve, reject) => {
        let errors = [];
        let resolved = false;
        let completed = 0;
        promises.forEach((p) => {
            Promise.resolve(p).then((val) => {
                if (!resolved) {
                    resolved = true;
                    resolve(val);
                }
            }).catch((err) => {
                errors.push(err);
            }).finally(() => {
                completed++;
                if (completed === promises.length && !resolved) {
                    reject(new Error("All promises rejected"));
                }
            });
        });
    });
}

async function resolveStreamUrl(track) {
    const pipedInstances = [
        "https://pipedapi.tokhmi.xyz",
        "https://api.piped.privacydev.net",
        "https://piped-api.lunar.icu",
        "https://api.piped.yt",
        "https://pipedapi.smnz.de",
        "https://pipedapi.kavin.rocks",
        "https://piped-api.hostux.net",
        "https://pipedapi.col.cat",
        "https://api-piped.mha.fi",
        "https://pipedapi.adminforge.de",
        "https://pipedapi.ox2.fr"
    ];
    const http = window.Capacitor?.Plugins?.CapacitorHttp || window.Capacitor?.Plugins?.Http;
    const { Preferences } = window.Capacitor?.Plugins || {};
    
    // ☁️ Retrieve Render Server URL
    let renderUrl = "";
    try {
        if (Preferences) {
            const res = await Preferences.get({ key: 'cloud_server_url' });
            renderUrl = res.value || "";
        } else {
            renderUrl = localStorage.getItem('cloud_server_url') || "";
        }
    } catch(e) {}
    
    if (renderUrl) {
        renderUrl = renderUrl.replace(/\/$/, "");
    }

    // 🚀 Concurrently fetch from all public Piped mirrors
    const fetchFromMirror = async (instance) => {
        try {
            let data = null;
            if (http) {
                const response = await http.get({ url: `${instance}/streams/${track.id}` });
                data = response.data;
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch(e) {}
                }
            } else {
                const res = await fetch(`${instance}/streams/${track.id}`);
                if (!res.ok) throw new Error("instance failed");
                data = await res.json();
            }
            if (data && data.audioStreams) {
                const stream = data.audioStreams.find(s => s.mimeType.includes("audio/mp4") || s.mimeType.includes("audio/webm"));
                if (stream && stream.url) return { source: 'mirror', url: stream.url };
            }
        } catch (e) {}
        throw new Error("mirror resolve failed");
    };

    // ☁️ Query the personal Render Server (Advanced Stealth Proxy)
    const fetchFromRender = async () => {
        if (!renderUrl) throw new Error("No Render Server URL configured.");
        try {
            let data = null;
            const targetApiUrl = `${renderUrl}/api/stream?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || '')}`;
            
            if (http) {
                const response = await http.get({ url: targetApiUrl });
                data = response.data;
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch(e) {}
                }
            } else {
                const res = await fetch(targetApiUrl);
                if (res.ok) {
                    data = await res.json();
                }
            }
            
            if (data && data.url) {
                let finalStreamUrl = data.url;
                if (finalStreamUrl.startsWith("/")) {
                    finalStreamUrl = renderUrl + finalStreamUrl;
                }
                return { source: 'render', url: finalStreamUrl };
            }
        } catch(err) {
            console.error("Render error in race:", err);
        }
        throw new Error("Render resolve failed");
    };

    // 🏎️ THE ULTIMATE SPEED RACE: Concurrently search Render Server and Piped Mirrors!
    const promises = [];
    if (renderUrl) {
        promises.push(withTimeout(fetchFromRender(), 10000));
    }
    pipedInstances.forEach(instance => {
        promises.push(withTimeout(fetchFromMirror(instance), 2500));
    });

    try {
        const result = await withTimeout(compatiblePromiseAny(promises), 10000);
        return result;
    } catch (e) {
        console.error("All streams and mirrors failed concurrent resolve or timed out:", e);
        return null;
    }
}

async function streamTrackAudio(track) {
    showToast("Launching Direct Stream Engines... 🚀");
    
    let result = null;
    if (prefetchedStreamCache.has(track.id)) {
        result = prefetchedStreamCache.get(track.id);
        prefetchedStreamCache.delete(track.id);
        console.log("[Cache HIT] Using prefetched stream for:", track.title);
    } else {
        result = await resolveStreamUrl(track);
    }

    if (result && result.url && currentTrack && currentTrack.id === track.id) {
        if (result.source === 'render') {
            showToast("Playing via Render Premium... 🚀");
        } else {
            showToast("Playing via Direct Mirror... ⚡");
        }
        try {
            const playResult = await audioEngine.play(result.url, currentTrack.title, currentTrack.artist || "Premium Stream", currentTrack.art);
            return playResult;
        } catch(e) {
            return false;
        }
    }
    return false;
}

function updatePlayerUI(track) {
    document.getElementById('player-title').innerText = track.title;
    document.getElementById('player-artist').innerText = "Premium Engine";
    document.getElementById('player-thumb').src = track.art;
    document.getElementById('theater-title').innerText = track.title;
    document.getElementById('theater-artist').innerText = "Global Direct Source";

    // 🌟 REGISTER SYSTEM-LEVEL LOCK SCREEN & HEADSET CONTROLS (MediaSession API)
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: '45 Personal Spotify',
            album: 'Premium Music Stream',
            artwork: [
                { src: track.art || 'https://via.placeholder.com/300/1DB954/FFFFFF?text=Audio', sizes: '300x300', type: 'image/png' }
            ]
        });

        // Hook phone native lock screen and physical earphone key presses
        navigator.mediaSession.setActionHandler('play', () => { togglePlay(); });
        navigator.mediaSession.setActionHandler('pause', () => { togglePlay(); });
        navigator.mediaSession.setActionHandler('previoustrack', () => { playPrev(); });
        navigator.mediaSession.setActionHandler('nexttrack', () => { playNext(); });
    }
}

function togglePlay() {
    if (!currentTrack) return;
    
    if (isPlaying) {
        if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
            try { ytPlayer.pauseVideo(); } catch(e) {}
        } else {
            audioEngine.pause();
        }
        isPlaying = false;
    } else {
        if (isRestoredState) {
            isRestoredState = false;
            isPlaying = true;
            playTrack(currentTrack);
            return;
        }

        if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.playVideo === 'function') {
            try { ytPlayer.playVideo(); } catch(e) {}
        } else {
            audioEngine.resume();
        }
        isPlaying = true;
    }
    updatePlayIcons();
}

function updatePlayIcons() {
    const icon = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    const pBtn = document.getElementById('play-pause-btn');
    const tBtn = document.getElementById('theater-play-pause');
    if (pBtn) pBtn.innerHTML = icon;
    if (tBtn) tBtn.innerHTML = isPlaying ? '<i class="fas fa-pause-circle"></i>' : '<i class="fas fa-play-circle"></i>';
    
    // Synchronize play/pause actions immediately on standard Android Notification Tray controls
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
}

function toggleShuffle() { isShuffle = !isShuffle; savePlaybackState(); showToast(isShuffle ? "Shuffle On 🔀" : "Shuffle Off"); document.getElementById('theater-btn-shuffle').style.color = isShuffle ? 'var(--accent)' : '#555'; }
function toggleRepeat() { isRepeat = !isRepeat; savePlaybackState(); showToast(isRepeat ? "Repeat Song On 🔂" : "Repeat Off"); document.getElementById('theater-btn-repeat').style.color = isRepeat ? 'var(--accent)' : '#555'; }

setInterval(async () => {
    if (!isPlaying) return;
    let cur = 0, dur = 0;
    
    const { NativeAudioPlayer } = window.Capacitor?.Plugins || {};
    if (NativeAudioPlayer && activeEngine === 'native') {
        try {
            const prog = await NativeAudioPlayer.getProgress();
            cur = prog.currentTime;
            dur = prog.duration;
        } catch(e) {}
    } else {
        const localPlayer = document.getElementById('local-player');
        if (activeEngine === 'local' && localPlayer) {
            cur = localPlayer.currentTime;
            dur = localPlayer.duration;
        } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
            try {
                cur = ytPlayer.getCurrentTime();
                dur = ytPlayer.getDuration();
            } catch(e) {}
        }
    }
    if (dur > 0) {
        const pct = (cur / dur) * 100;
        document.getElementById('playback-progress').style.width = pct + "%";
        document.getElementById('theater-progress-fill').style.width = pct + "%";
        const fmt = (s) => { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${sec < 10 ? '0' : ''}${sec}`; };
        document.getElementById('current-time').innerText = fmt(cur);
        document.getElementById('total-time').innerText = fmt(dur);
        document.getElementById('theater-current-time').innerText = fmt(cur);
        document.getElementById('theater-total-time').innerText = fmt(dur);
        
        // 🚀 Smart Next-Track Prefetch: warm the server cache before current track ends!
        // 🚀 Smart Next-Track Prefetch: warm the server cache before current track ends!
        if (pct > 50 && !hasPrefetchedNext) {  // Changed from 80% to 50% to start prefetching earlier
            hasPrefetchedNext = true;
            prefetchNextTrack();
        }
        
        progressTicks++;
        if (progressTicks % 4 === 0) {
            savePlaybackProgress(cur);
        }
    }
}, 500);

async function fetchAutoplayRecommendations(track) {
    if (!track) return;
    console.log("[Autoplay] Fetching related tracks in background for:", track.title);
    try {
        const query = `${track.title} ${track.artist || ''} radio`;
        const results = await directEngineSearch(query);
        if (results && results.length > 0) {
            // Filter out current track and other duplicates
            const filtered = results.filter(t => t.id !== track.id);
            autoplayRecommendations = filtered;
            console.log("[Autoplay SUCCESS] Cached", autoplayRecommendations.length, "related tracks.");
            // If we are at the end of the queue, pre-cache the first recommendation immediately!
            let idx = currentQueue.findIndex(t => t.id === currentTrack?.id);
            if (idx !== -1 && idx === currentQueue.length - 1 && !hasPrefetchedNext) {
                prefetchNextTrack();
            }
        }
    } catch(e) {
        console.warn("[Autoplay] Failed to retrieve recommendations:", e);
    }
}

async function prefetchNextTrack() {
    if (isRepeat) return;
    if (!currentQueue || currentQueue.length === 0) return;
    
    let nextTrack = null;
    if (userQueue.length > 0) {
        nextTrack = userQueue[0];
    } else {
        let idx = currentQueue.findIndex(t => t.id === currentTrack?.id);
        if (idx !== -1) {
            if (isShuffle) {
                let randIdx = idx;
                if (currentQueue.length > 1) {
                    while (randIdx === idx) {
                        randIdx = Math.floor(Math.random() * currentQueue.length);
                    }
                }
                nextTrack = currentQueue[randIdx];
            } else {
                if (idx === currentQueue.length - 1) {
                    // Sequential queue is exhausted, fetch from Autoplay Recommendations
                    if (autoplayRecommendations.length > 0) {
                        nextTrack = autoplayRecommendations[0];
                    }
                } else {
                    nextTrack = currentQueue[idx + 1];
                }
            }
        }
    }
    
    if (nextTrack && !nextTrack.isLocal) {
        console.log("[Prefetch] Pre-resolving stream URL for next track:", nextTrack.title);
        resolveStreamUrl(nextTrack).then(result => {
            if (result && result.url) {
                if (prefetchedStreamCache.size > 5) {
                    const firstKey = prefetchedStreamCache.keys().next().value;
                    prefetchedStreamCache.delete(firstKey);
                }
                prefetchedStreamCache.set(nextTrack.id, result);
                console.log("[Prefetch SUCCESS] Stream URL pre-cached for next track:", nextTrack.title, "Source:", result.source);
            }
        }).catch(err => {
            console.warn("[Prefetch FAILED] Pre-resolving failed:", err);
        });
    }
}

function setupListeners() {
    document.getElementById('m-nav-home').onclick = () => showView('home');
    document.getElementById('m-nav-search').onclick = () => showView('search-view');
    document.getElementById('m-nav-library').onclick = () => showView('playlist-view');
    const nHome = document.getElementById('nav-home'); if (nHome) nHome.onclick = () => showView('home');
    const nSearch = document.getElementById('nav-search'); if (nSearch) nSearch.onclick = () => showView('search-view');
    const nLibrary = document.getElementById('nav-library'); if (nLibrary) nLibrary.onclick = () => showView('playlist-view');
    document.getElementById('btn-next').onclick = playNext;
    document.getElementById('btn-prev').onclick = playPrev;
    document.getElementById('theater-btn-next').onclick = playNext;
    document.getElementById('theater-btn-prev').onclick = playPrev;
    document.getElementById('theater-btn-shuffle').onclick = toggleShuffle;
    document.getElementById('theater-btn-repeat').onclick = toggleRepeat;
    document.getElementById('play-pause-btn').onclick = togglePlay;
    document.getElementById('theater-play-pause').onclick = togglePlay;
    const sInput = document.getElementById('web-search-input');
    sInput.onkeypress = (e) => { if (e.key === 'Enter') { performSearch(sInput.value); sInput.blur(); } };
    document.querySelector('.current-track').onclick = openTheater;
    
    // Bottom Bar Click Seek (Simple Tap)
    const handleSeekSimple = (e, el) => {
        const rect = el.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const localPlayer = document.getElementById('local-player');
        
        if (activeEngine === 'native') {
            const { NativeAudioPlayer } = window.Capacitor?.Plugins || {};
            if (NativeAudioPlayer) {
                NativeAudioPlayer.getProgress().then(prog => {
                    if (prog && prog.duration) {
                        audioEngine.seek(pct * prog.duration);
                    }
                });
            }
        } else if (activeEngine === 'local' && localPlayer && localPlayer.duration) {
            localPlayer.currentTime = pct * localPlayer.duration;
        } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.seekTo === 'function') {
            try { ytPlayer.seekTo(pct * ytPlayer.getDuration(), true); } catch(e) {}
        }
    };
    document.querySelector('.progress-bar').onclick = (e) => handleSeekSimple(e, document.querySelector('.progress-bar'));

    // ⏱️ Smooth touch-and-drag progress bar with color glow and real-time seek
    const thBg = document.getElementById('theater-progress-bg');
    const thFill = document.getElementById('theater-progress-fill');
    const thHandle = document.getElementById('theater-progress-handle');
    let isDraggingProgress = false;
    let dragPct = 0;

    const updateDragUI = (clientX) => {
        const rect = thBg.getBoundingClientRect();
        dragPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        thFill.style.width = (dragPct * 100) + "%";
        thHandle.style.left = (dragPct * 100) + "%";
    };

    thBg.addEventListener('touchstart', (e) => {
        isDraggingProgress = true;
        thFill.style.backgroundColor = '#1DB954'; // Spotify green!
        thHandle.style.backgroundColor = '#1DB954';
        thHandle.style.opacity = '1';
        updateDragUI(e.touches[0].clientX);
    }, { passive: true });

    thBg.addEventListener('touchmove', (e) => {
        if (!isDraggingProgress) return;
        updateDragUI(e.touches[0].clientX);
        
        // Dynamic time updating on drag!
        const fmt = (s) => { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${sec < 10 ? '0' : ''}${sec}`; };
        let dur = 0;
        const localPlayer = document.getElementById('local-player');
        if (activeEngine === 'local' && localPlayer) dur = localPlayer.duration;
        else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.getDuration === 'function') {
            try { dur = ytPlayer.getDuration(); } catch(e) {}
        }
        if (dur > 0) {
            document.getElementById('theater-current-time').innerText = fmt(dragPct * dur);
        }
    }, { passive: true });

    const endDragProgress = async () => {
        if (!isDraggingProgress) return;
        isDraggingProgress = false;
        thFill.style.backgroundColor = 'white'; // Restore white
        thHandle.style.backgroundColor = 'white';
        thHandle.style.opacity = '0';
        
        let dur = 0;
        const localPlayer = document.getElementById('local-player');
        if (activeEngine === 'local' && localPlayer) dur = localPlayer.duration;
        else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.getDuration === 'function') {
            try { dur = ytPlayer.getDuration(); } catch(e) {}
        }

        const { NativeAudioPlayer } = window.Capacitor?.Plugins || {};
        if (activeEngine === 'native' && NativeAudioPlayer) {
            try {
                const prog = await NativeAudioPlayer.getProgress();
                if (prog && prog.duration) {
                    audioEngine.seek(dragPct * prog.duration);
                }
            } catch(e) {}
        } else if (activeEngine === 'local' && localPlayer && dur > 0) {
            localPlayer.currentTime = dragPct * dur;
        } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.seekTo === 'function' && dur > 0) {
            try { ytPlayer.seekTo(dragPct * dur, true); } catch(e) {}
        }
    };

    thBg.addEventListener('touchend', endDragProgress, { passive: true });
    thBg.addEventListener('touchcancel', endDragProgress, { passive: true });
}

function showView(id, pushToHistory = true) {
    if (pushToHistory && currentViewId !== id) {
        navigationHistory.push(currentViewId);
    }
    currentViewId = id;
    savePlaybackState();
    document.querySelectorAll('.content-view').forEach(v => { v.style.display = 'none'; v.classList.add('hidden'); });
    const target = document.getElementById(id);
    if (target) { target.style.display = 'block'; target.classList.remove('hidden'); }
    document.querySelectorAll('.mobile-nav a').forEach(a => a.classList.remove('active'));
    const navId = id === 'playlist-view' ? 'm-nav-library' : (id === 'search-view' ? 'm-nav-search' : 'm-nav-home');
    document.getElementById(navId)?.classList.add('active');
    
    if (id === 'playlist-view') renderLibrary();
}

function openTheater() { if (currentTrack) document.getElementById('theater-view').classList.remove('hidden-theater'); }
function closeTheater() { document.getElementById('theater-view').classList.add('hidden-theater'); }

window.theaterDownloadTrack = function() {
    if (currentTrack) {
        window.downloadTrackById(currentTrack.id);
    } else {
        showToast("No active track to download");
    }
};

window.theaterAddToPlaylist = function() {
    if (currentTrack) {
        window.openPlaylistModal(currentTrack.id);
    } else {
        showToast("No active track selected");
    }
};

let lastNextCall = 0;
window.playNext = function() {
    if (Date.now() - lastNextCall < 1000) return;
    lastNextCall = Date.now();
    
    if (userQueue.length > 0) {
        const nextTrack = userQueue.shift();
        playTrack(nextTrack);
        return;
    }
    if (!currentQueue || currentQueue.length === 0) return;
    let idx = currentQueue.findIndex(t => t.id === currentTrack?.id);
    if (isShuffle) { idx = Math.floor(Math.random() * currentQueue.length); }
    else { 
        if (idx !== -1 && idx === currentQueue.length - 1) {
            // Sequential queue exhausted, transition to Autoplay recommendations
            if (autoplayRecommendations.length > 0) {
                const nextRec = autoplayRecommendations.shift();
                currentQueue.push(nextRec); // Append to queue so the user can see it in queue list
                playTrack(nextRec);
                showToast(`Autoplay: ${nextRec.title} 📻`);
                return;
            }
        }
        idx = (idx + 1) % currentQueue.length; 
    }
    playTrack(currentQueue[idx]);
}

function playPrev() {
    if (currentQueue.length === 0) return;
    let idx = currentQueue.findIndex(t => t.id === currentTrack?.id);
    idx = (idx - 1 + currentQueue.length) % currentQueue.length;
    playTrack(currentQueue[idx]);
}

function showToast(msg) {
    let t = document.getElementById('app-toast');
    if (!t) {
        t = document.createElement('div'); t.id = 'app-toast';
        t.style = "position: fixed; bottom: 180px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); color: white; padding: 12px 24px; border-radius: 24px; z-index: 9999; font-size: 12px; font-weight: 600; transition: opacity 0.3s; pointer-events: none; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 32px rgba(0,0,0,0.5);";
        document.body.appendChild(t);
    }
    t.innerText = msg; t.style.opacity = '1';
    setTimeout(() => { t.style.opacity = '0'; }, 2000);
}

window.toggleCloudConfig = function() {
    const block = document.getElementById('cloud-config-block');
    if (block.style.display === 'none') {
        block.style.display = 'flex';
        const { Preferences } = window.Capacitor?.Plugins || {};
        if (Preferences) {
            Preferences.get({ key: 'cloud_server_url' }).then(res => {
                document.getElementById('cloud-server-url').value = res.value || "";
            });
        } else {
            document.getElementById('cloud-server-url').value = localStorage.getItem('cloud_server_url') || "";
        }
    } else {
        block.style.display = 'none';
    }
}

window.cloudBackup = async function() {
    const urlInput = document.getElementById('cloud-server-url').value.trim();
    if (!urlInput) {
        showToast("Please enter your Render Server URL! ❌");
        return;
    }
    
    const baseUrl = urlInput.replace(/\/$/, "");
    const { Preferences, CapacitorHttp } = window.Capacitor?.Plugins || {};
    if (Preferences) {
        await Preferences.set({ key: 'cloud_server_url', value: baseUrl });
    } else {
        localStorage.setItem('cloud_server_url', baseUrl);
    }
    
    showToast("Backing up data to Render... ☁️");
    
    const dbPayload = {
        playlists: playlists,
        downloads: downloads
    };
    
    try {
        if (CapacitorHttp) {
            const response = await CapacitorHttp.post({
                url: `${baseUrl}/api/database/save`,
                headers: { 'Content-Type': 'application/json' },
                data: dbPayload
            });
            if (response.status === 200 || response.data?.status === 'success') {
                showToast("Backup Saved to Cloud! ✅");
            } else {
                throw new Error("Server error: " + response.status);
            }
        } else {
            const res = await fetch(`${baseUrl}/api/database/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dbPayload)
            });
            if (res.ok) {
                showToast("Backup Saved to Cloud! ✅");
            } else {
                throw new Error("HTTP failure");
            }
        }
    } catch(e) {
        console.error(e);
        showToast("Cloud sync failed. Verify URL! ❌");
    }
}

window.cloudRestore = async function() {
    const urlInput = document.getElementById('cloud-server-url').value.trim();
    if (!urlInput) {
        showToast("Please enter your Render Server URL! ❌");
        return;
    }
    
    const baseUrl = urlInput.replace(/\/$/, "");
    showToast("Restoring playlists from Render... 🔄");
    
    const { CapacitorHttp } = window.Capacitor?.Plugins || {};
    try {
        let db = null;
        if (CapacitorHttp) {
            const response = await CapacitorHttp.get({ url: `${baseUrl}/api/database/load` });
            db = response.data;
            if (typeof db === 'string') db = JSON.parse(db);
        } else {
            const res = await fetch(`${baseUrl}/api/database/load`);
            if (res.ok) db = await res.json();
        }
        
        if (db && (db.playlists || db.downloads)) {
            playlists = db.playlists || {};
            downloads = db.downloads || [];
            await saveDatabase();
            showToast("Playlists Restored Successfully! 🎉");
            renderLibrary();
        } else {
            showToast("No database backup found on server. ☁️");
        }
    } catch(e) {
        console.error(e);
        showToast("Restore failed. Verify server! ❌");
    }
}

async function savePlaybackState() {
    const { Preferences } = window.Capacitor?.Plugins || {};
    const stateObj = {
        currentTrack: currentTrack,
        currentQueue: currentQueue,
        userQueue: userQueue,
        currentViewId: currentViewId,
        isShuffle: isShuffle,
        isRepeat: isRepeat
    };
    try {
        if (Preferences) {
            await Preferences.set({ key: 'spotify_playback_state', value: JSON.stringify(stateObj) });
        } else {
            localStorage.setItem('spotify_playback_state', JSON.stringify(stateObj));
        }
    } catch(e) {}
}

async function savePlaybackProgress(sec) {
    const { Preferences } = window.Capacitor?.Plugins || {};
    try {
        if (Preferences) {
            await Preferences.set({ key: 'spotify_playback_progress', value: String(sec) });
        } else {
            localStorage.setItem('spotify_playback_progress', String(sec));
        }
    } catch(e) {}
}

async function restorePlaybackState() {
    const { Preferences } = window.Capacitor?.Plugins || {};
    let state = null;
    let progress = 0;
    try {
        if (Preferences) {
            const res = await Preferences.get({ key: 'spotify_playback_state' });
            if (res.value) state = JSON.parse(res.value);
            const progRes = await Preferences.get({ key: 'spotify_playback_progress' });
            if (progRes.value) progress = parseFloat(progRes.value) || 0;
        } else {
            state = JSON.parse(localStorage.getItem('spotify_playback_state'));
            progress = parseFloat(localStorage.getItem('spotify_playback_progress')) || 0;
        }
    } catch(e) {}

    if (state) {
        currentQueue = state.currentQueue || [];
        userQueue = state.userQueue || [];
        isShuffle = !!state.isShuffle;
        isRepeat = !!state.isRepeat;
        
        // Restore Shuffle/Repeat icons
        const sh = document.getElementById('theater-btn-shuffle');
        const re = document.getElementById('theater-btn-repeat');
        if (sh) sh.style.color = isShuffle ? 'var(--accent)' : '#555';
        if (re) re.style.color = isRepeat ? 'var(--accent)' : '#555';

        if (state.currentTrack) {
            currentTrack = state.currentTrack;
            isRestoredState = true;
            pendingRestoreSeek = progress;
            updatePlayerUI(currentTrack);
            
            // Sync time seekbars
            const pct = (progress / (currentTrack.duration || 1)) * 100;
            const pb = document.getElementById('playback-progress');
            const tf = document.getElementById('theater-progress-fill');
            if (pb) pb.style.width = pct + "%";
            if (tf) tf.style.width = pct + "%";
            
            const fmt = (s) => { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${sec < 10 ? '0' : ''}${sec}`; };
            const ct = document.getElementById('current-time');
            const tt = document.getElementById('total-time');
            const tct = document.getElementById('theater-current-time');
            const ttt = document.getElementById('theater-total-time');
            if (ct) ct.innerText = fmt(progress);
            if (tt) tt.innerText = fmt(currentTrack.duration || 0);
            if (tct) tct.innerText = fmt(progress);
            if (ttt) ttt.innerText = fmt(currentTrack.duration || 0);
            
            isPlaying = false;
            updatePlayIcons();
        }
        
        showView(state.currentViewId || 'home', false);
    } else {
        showView('home', false);
    }
}
