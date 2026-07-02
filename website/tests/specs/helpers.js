/**
 * helpers.js
 * Shared helper functions for all Spotify Web App tests.
 */

const { expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:8000';
const SONG_LOAD_TIMEOUT = 20000;   // 20s for a song to start streaming
const SEARCH_TIMEOUT    = 15000;   // 15s for search results to appear

/**
 * Navigate to the app and wait for it to be fully ready.
 */
async function openApp(page) {
    await page.goto(BASE_URL);
    // Wait for sidebar to appear — confirms app JS loaded
    await page.waitForSelector('#nav-home', { timeout: 10000 });
    console.log('✅ App loaded');
}

/**
 * Click the Search nav item and type a query, then wait for results.
 */
async function searchFor(page, query) {
    await page.click('#nav-search');
    await page.waitForSelector('#web-search-input', { timeout: 5000 });
    await page.fill('#web-search-input', query);
    await page.press('#web-search-input', 'Enter');

    // Wait for at least one result card to appear
    await page.waitForSelector('.recent-card', { timeout: SEARCH_TIMEOUT });
    const count = await page.locator('.recent-card').count();
    console.log(`✅ Search for "${query}" returned ${count} results`);
    return count;
}

/**
 * Click the green play button on the Nth result (0-indexed).
 * Waits until the player title changes from "Welcome".
 */
async function playSongAtIndex(page, index = 0) {
    const cards = page.locator('.recent-card');
    const card  = cards.nth(index);

    // Hover to make the play button visible, then click it
    await card.hover();
    const playBtn = card.locator('.play-btn, .btn-play-track, i.fa-play').first();
    await playBtn.click({ timeout: 8000 });

    // Wait for player title to update (song loaded)
    await page.waitForFunction(
        () => document.getElementById('player-title')?.innerText !== 'Welcome',
        { timeout: SONG_LOAD_TIMEOUT }
    );
    const title = await page.locator('#player-title').innerText();
    console.log(`✅ Now playing: "${title}"`);
    return title;
}

/**
 * Wait until the current time counter is MOVING (song is actually playing).
 */
async function waitForPlaybackToStart(page) {
    await page.waitForFunction(() => {
        const el = document.getElementById('current-time');
        return el && el.innerText !== '0:00';
    }, { timeout: SONG_LOAD_TIMEOUT });
    const time = await page.locator('#current-time').innerText();
    console.log(`✅ Playback started — current time: ${time}`);
    return time;
}

/**
 * Read the current playback time from the player bar.
 */
async function getCurrentTime(page) {
    return await page.locator('#current-time').innerText();
}

/**
 * Read total duration from the player bar.
 */
async function getTotalTime(page) {
    return await page.locator('#total-time').innerText();
}

/**
 * Check if the play/pause button is currently showing "Pause" (i.e. song is playing).
 */
async function isPlaying(page) {
    const btn = page.locator('#play-pause-btn');
    const html = await btn.innerHTML();
    return html.includes('fa-pause');
}

/**
 * Toggle play/pause via Space key.
 */
async function pressSpace(page) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
}

/**
 * Open the video sidebar by pressing V.
 */
async function openVideoPanel(page) {
    await page.keyboard.press('v');
    // Wait for the sidebar to expand
    await page.waitForFunction(
        () => {
            const el = document.getElementById('video-sidebar');
            return el && (el.style.width === '400px' || parseInt(el.style.width) > 0);
        },
        { timeout: 5000 }
    );
    console.log('✅ Video panel opened');
}

/**
 * Seek to a given percentage (0.0 - 1.0) of the progress bar.
 */
async function seekTo(page, fraction) {
    const bar = page.locator('.progress-bar').first();
    const box = await bar.boundingBox();
    if (!box) throw new Error('Progress bar not found');
    const x = box.x + box.width * fraction;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.waitForTimeout(500);
    console.log(`✅ Seeked to ${Math.round(fraction * 100)}%`);
}

/**
 * Parse "M:SS" time string to total seconds.
 */
function timeToSeconds(timeStr) {
    const [m, s] = timeStr.split(':').map(Number);
    return m * 60 + s;
}

module.exports = {
    openApp,
    searchFor,
    playSongAtIndex,
    waitForPlaybackToStart,
    getCurrentTime,
    getTotalTime,
    isPlaying,
    pressSpace,
    openVideoPanel,
    seekTo,
    timeToSeconds,
    SONG_LOAD_TIMEOUT,
};
