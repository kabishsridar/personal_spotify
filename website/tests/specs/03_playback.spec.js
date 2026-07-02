/**
 * 03_playback.spec.js
 * Tests: Play song, timeline updates, seek, pause/resume, next/prev, duration
 */

const { test, expect } = require('@playwright/test');
const {
    openApp, searchFor, playSongAtIndex, waitForPlaybackToStart,
    getCurrentTime, getTotalTime, isPlaying, pressSpace, seekTo,
    timeToSeconds, SONG_LOAD_TIMEOUT
} = require('./helpers');

test.describe('Playback', () => {

    test.beforeEach(async ({ page }) => {
        await openApp(page);
        await searchFor(page, 'Tamil hits');
    });

    // -------------------------------------------------------
    test('Song plays and timeline advances', async ({ page }) => {
        await playSongAtIndex(page, 0);
        const t1 = await waitForPlaybackToStart(page);

        // Wait 4 seconds, then check time has advanced
        await page.waitForTimeout(4000);
        const t2 = await getCurrentTime(page);

        const s1 = timeToSeconds(t1);
        const s2 = timeToSeconds(t2);
        expect(s2).toBeGreaterThan(s1);

        console.log(`✅ Timeline advancing: ${t1} → ${t2}`);
        await page.screenshot({ path: 'screenshots/03_playing.png' });
    });

    // -------------------------------------------------------
    test('Total duration is shown and non-zero', async ({ page }) => {
        await playSongAtIndex(page, 0);
        await waitForPlaybackToStart(page);

        const total = await getTotalTime(page);
        expect(total).not.toBe('0:00');
        expect(timeToSeconds(total)).toBeGreaterThan(30); // at least 30s
        console.log(`✅ Duration shown: ${total}`);
    });

    // -------------------------------------------------------
    test('Pause stops timeline; Resume continues it', async ({ page }) => {
        await playSongAtIndex(page, 0);
        await waitForPlaybackToStart(page);

        // Pause
        await pressSpace(page);
        const pausedAt = await getCurrentTime(page);
        expect(await isPlaying(page)).toBe(false);

        // Wait 3 seconds — time should NOT advance while paused
        await page.waitForTimeout(3000);
        const stillAt = await getCurrentTime(page);
        expect(stillAt).toBe(pausedAt);
        console.log(`✅ Paused at ${pausedAt}, still ${stillAt} after 3s`);

        // Resume
        await pressSpace(page);
        await page.waitForTimeout(2000);
        const resumedAt = await getCurrentTime(page);
        expect(timeToSeconds(resumedAt)).toBeGreaterThan(timeToSeconds(pausedAt));
        console.log(`✅ Resumed: ${pausedAt} → ${resumedAt}`);

        await page.screenshot({ path: 'screenshots/03_pause_resume.png' });
    });

    // -------------------------------------------------------
    test('Seeking via progress bar moves timeline', async ({ page }) => {
        await playSongAtIndex(page, 0);
        await waitForPlaybackToStart(page);

        // Seek to 60% of the song
        await seekTo(page, 0.6);
        await page.waitForTimeout(1500);

        const total = timeToSeconds(await getTotalTime(page));
        const current = timeToSeconds(await getCurrentTime(page));

        // Current time should now be roughly 55-70% of total
        const fraction = current / total;
        expect(fraction).toBeGreaterThan(0.5);
        expect(fraction).toBeLessThan(0.8);
        console.log(`✅ Seek to 60%: currently at ${(fraction * 100).toFixed(0)}% (${await getCurrentTime(page)})`);
        await page.screenshot({ path: 'screenshots/03_seek.png' });
    });

    // -------------------------------------------------------
    test('Next track button changes song', async ({ page }) => {
        await playSongAtIndex(page, 0);
        const firstTitle = await page.locator('#player-title').innerText();
        await waitForPlaybackToStart(page);

        // Click Next
        await page.click('#btn-next');

        // Wait for a NEW song to load (title changes)
        await page.waitForFunction(
            (orig) => document.getElementById('player-title')?.innerText !== orig && document.getElementById('player-title')?.innerText !== 'Welcome',
            firstTitle,
            { timeout: SONG_LOAD_TIMEOUT }
        );
        const secondTitle = await page.locator('#player-title').innerText();
        expect(secondTitle).not.toBe(firstTitle);
        console.log(`✅ Next track: "${firstTitle}" → "${secondTitle}"`);
        await page.screenshot({ path: 'screenshots/03_next_track.png' });
    });

    // -------------------------------------------------------
    test('Previous track button: restarts song if >3s in', async ({ page }) => {
        await playSongAtIndex(page, 1); // Start at 2nd song so prev makes sense
        await waitForPlaybackToStart(page);

        // Let it play to > 3 seconds
        await page.waitForFunction(
            () => {
                const t = document.getElementById('current-time')?.innerText;
                if (!t) return false;
                const [m, s] = t.split(':').map(Number);
                return m * 60 + s > 3;
            },
            { timeout: 15000 }
        );

        await page.click('#btn-prev');
        await page.waitForTimeout(1000);

        const currentTime = await getCurrentTime(page);
        // Should restart to near 0:00
        expect(timeToSeconds(currentTime)).toBeLessThan(5);
        console.log(`✅ Prev (>3s in): restarted to ${currentTime}`);
    });

    // -------------------------------------------------------
    test('Shuffle toggle turns on/off', async ({ page }) => {
        await openApp(page);
        const btn = page.locator('#btn-shuffle');
        const colorBefore = await btn.evaluate(el => el.style.color);
        await btn.click();
        const colorAfter = await btn.evaluate(el => el.style.color);
        expect(colorAfter).not.toBe(colorBefore);
        console.log(`✅ Shuffle toggled: color changed from "${colorBefore}" to "${colorAfter}"`);
    });

    // -------------------------------------------------------
    test('Repeat toggle turns on/off', async ({ page }) => {
        await openApp(page);
        const btn = page.locator('#btn-repeat');
        const colorBefore = await btn.evaluate(el => el.style.color);
        await btn.click();
        const colorAfter = await btn.evaluate(el => el.style.color);
        expect(colorAfter).not.toBe(colorBefore);
        console.log(`✅ Repeat toggled: color changed`);
    });
});
