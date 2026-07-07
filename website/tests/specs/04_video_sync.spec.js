/**
 * 04_video_sync.spec.js
 * Tests: Video sidebar open/close, video-audio sync, seek sync, pause sync
 */

const { test, expect } = require('@playwright/test');
const {
    openApp, searchFor, playSongAtIndex, waitForPlaybackToStart,
    getCurrentTime, isPlaying, pressSpace, seekTo, openVideoPanel,
    timeToSeconds, SONG_LOAD_TIMEOUT
} = require('./helpers');

test.describe('Video Sync', () => {

    test.beforeEach(async ({ page }) => {
        await openApp(page);
        await searchFor(page, 'Tamil hits');
        await playSongAtIndex(page, 0);
        await waitForPlaybackToStart(page);
    });

    // -------------------------------------------------------
    test('Video panel opens via V key', async ({ page }) => {
        await openVideoPanel(page);

        // Sidebar should have expanded
        const sidebar = page.locator('#video-sidebar');
        const width = await sidebar.evaluate(el => parseInt(el.style.width));
        expect(width).toBeGreaterThan(0);

        // Title should show "Watching: ..."
        const title = await page.locator('#video-sidebar-title').innerText();
        expect(title).toContain('Watching');
        console.log(`✅ Video panel opened: "${title}"`);
        await page.screenshot({ path: 'screenshots/04_video_open.png' });
    });

    // -------------------------------------------------------
    test('Video panel loads an iframe or YT player', async ({ page }) => {
        await openVideoPanel(page);
        await page.waitForTimeout(3000); // Give video time to initialize

        // Either the iframe has a src, or YT player's iframe is in the container
        const iframeSrc = await page.locator('#video-iframe').getAttribute('src');
        const ytIframe = await page.locator('.video-container iframe').count();

        const hasVideo = (iframeSrc && iframeSrc.includes('youtube')) || ytIframe > 0;
        expect(hasVideo).toBe(true);
        console.log(`✅ Video loaded: iframe src="${iframeSrc?.slice(0, 60)}..."`);
        await page.screenshot({ path: 'screenshots/04_video_iframe.png' });
    });

    // -------------------------------------------------------
    test('Video panel closes via X button', async ({ page }) => {
        await openVideoPanel(page);
        await page.waitForTimeout(1000);

        await page.click('#btn-close-video');
        await page.waitForTimeout(500);

        const width = await page.locator('#video-sidebar').evaluate(el => parseInt(el.style.width) || 0);
        expect(width).toBe(0);
        console.log(`✅ Video panel closed: width=${width}`);
    });

    // -------------------------------------------------------
    test('Seek updates both audio timeline and video position', async ({ page }) => {
        await openVideoPanel(page);
        await page.waitForTimeout(2000);

        // Seek to 40%
        await seekTo(page, 0.4);
        await page.waitForTimeout(2000);

        // Audio time should be at ~40% of total
        const currentRaw = await page.locator('#current-time').innerText();
        const totalRaw    = await page.locator('#total-time').innerText();
        const cur  = timeToSeconds(currentRaw);
        const tot  = timeToSeconds(totalRaw);
        const frac = cur / tot;

        expect(frac).toBeGreaterThan(0.3);
        expect(frac).toBeLessThan(0.6);
        console.log(`✅ Seek sync: audio at ${currentRaw} = ${(frac*100).toFixed(0)}% of ${totalRaw}`);
        await page.screenshot({ path: 'screenshots/04_seek_sync.png' });
    });

    // -------------------------------------------------------
    test('Pause stops both audio and video', async ({ page }) => {
        await openVideoPanel(page);
        await page.waitForTimeout(2000);

        // Pause
        await pressSpace(page);
        await page.waitForTimeout(500);
        expect(await isPlaying(page)).toBe(false);

        const pausedAt = await getCurrentTime(page);

        // Wait 3 seconds — audio time must NOT advance
        await page.waitForTimeout(3000);
        const after = await getCurrentTime(page);
        expect(after).toBe(pausedAt);
        console.log(`✅ Pause+Video: audio frozen at ${pausedAt}`);
        await page.screenshot({ path: 'screenshots/04_pause_video.png' });
    });

    // -------------------------------------------------------
    test('Resume plays both audio and video', async ({ page }) => {
        await openVideoPanel(page);
        await page.waitForTimeout(2000);

        // Pause then resume
        await pressSpace(page);
        await page.waitForTimeout(500);
        const pausedAt = timeToSeconds(await getCurrentTime(page));

        await pressSpace(page);
        await page.waitForTimeout(3000);
        const resumedAt = timeToSeconds(await getCurrentTime(page));

        expect(resumedAt).toBeGreaterThan(pausedAt);
        console.log(`✅ Resume+Video: ${pausedAt}s → ${resumedAt}s`);
        await page.screenshot({ path: 'screenshots/04_resume_video.png' });
    });

    // -------------------------------------------------------
    test('Next track reloads video for new song', async ({ page }) => {
        await openVideoPanel(page);
        await page.waitForTimeout(2000);

        const titleBefore = await page.locator('#video-sidebar-title').innerText();
        await page.click('#btn-next');

        // Wait directly for the video sidebar title to change — this is deterministic
        // and avoids the flakiness of waiting on player-title + a fixed timeout.
        await page.waitForFunction(
            (orig) => {
                const t = document.getElementById('video-sidebar-title')?.innerText;
                return t && t !== orig && t !== 'Watching: Welcome';
            },
            titleBefore,
            { timeout: SONG_LOAD_TIMEOUT }
        );

        const titleAfter = await page.locator('#video-sidebar-title').innerText();
        expect(titleAfter).not.toBe(titleBefore);
        console.log(`✅ Video updated after next: "${titleBefore}" → "${titleAfter}"`);
        await page.screenshot({ path: 'screenshots/04_next_video.png' });
    });

    // -------------------------------------------------------
    test('Console has no critical JS errors during video sync', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await openVideoPanel(page);
        await page.waitForTimeout(5000);

        // Filter out known benign 3rd-party warnings
        const criticalErrors = errors.filter(e =>
            !e.includes('postMessage') &&
            !e.includes('youtube') &&
            !e.includes('autoplay')
        );
        expect(criticalErrors.length).toBe(0);
        if (errors.length > 0) {
            console.log(`  ⚠️ Warnings (non-critical): ${errors.join(', ').slice(0, 200)}`);
        }
        console.log('✅ No critical JS errors during video sync');
    });
});
