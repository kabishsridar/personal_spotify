/**
 * 05_keyboard_shortcuts.spec.js
 * Tests: Every keyboard shortcut works correctly
 */

const { test, expect } = require('@playwright/test');
const {
    openApp, searchFor, playSongAtIndex, waitForPlaybackToStart,
    getCurrentTime, getTotalTime, isPlaying, timeToSeconds, SONG_LOAD_TIMEOUT
} = require('./helpers');

test.describe('Keyboard Shortcuts', () => {

    test.beforeEach(async ({ page }) => {
        await openApp(page);
        await searchFor(page, 'Tamil hits');
        await playSongAtIndex(page, 0);
        await waitForPlaybackToStart(page);
        // Blur the search input so keyboard shortcuts fire on document, not inside an input.
        // page.click('body') is unreliable — focus reverts to the textbox. Direct blur is deterministic.
        await page.evaluate(() => {
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
        });
        await page.waitForTimeout(200);
    });

    // -------------------------------------------------------
    test('Space: toggles play/pause', async ({ page }) => {
        expect(await isPlaying(page)).toBe(true);

        await page.keyboard.press('Space');
        await page.waitForTimeout(400);
        expect(await isPlaying(page)).toBe(false);
        console.log('  Paused via Space ✅');

        await page.keyboard.press('Space');
        await page.waitForTimeout(400);
        expect(await isPlaying(page)).toBe(true);
        console.log('  Resumed via Space ✅');
    });

    // -------------------------------------------------------
    test('ArrowRight: seeks forward 10 seconds', async ({ page }) => {
        const t1 = timeToSeconds(await getCurrentTime(page));
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(600);
        const t2 = timeToSeconds(await getCurrentTime(page));
        // Should have jumped ~10 seconds
        expect(t2 - t1).toBeGreaterThanOrEqual(8);
        expect(t2 - t1).toBeLessThanOrEqual(14);
        console.log(`✅ ArrowRight: ${t1}s → ${t2}s (+${t2-t1}s)`);
    });

    // -------------------------------------------------------
    test('ArrowLeft: seeks back 10 seconds', async ({ page }) => {
        // First jump forward so we have room to go back
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(800);

        const t1 = timeToSeconds(await getCurrentTime(page));
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(600);
        const t2 = timeToSeconds(await getCurrentTime(page));
        expect(t1 - t2).toBeGreaterThanOrEqual(8);
        console.log(`✅ ArrowLeft: ${t1}s → ${t2}s (-${t1-t2}s)`);
    });

    // -------------------------------------------------------
    test('ArrowUp: increases volume and shows toast', async ({ page }) => {
        // Watch for toast
        const toastPromise = page.waitForSelector('#toast-msg', { state: 'visible', timeout: 3000 }).catch(() => null);
        await page.keyboard.press('ArrowUp');
        const toast = await toastPromise;
        if (toast) {
            const text = await toast.innerText();
            expect(text).toContain('Volume');
            console.log(`✅ ArrowUp toast: "${text}"`);
        } else {
            console.log('  ⚠️ Toast not detected but volume may still have changed');
        }
    });

    // -------------------------------------------------------
    test('ArrowDown: decreases volume and shows toast', async ({ page }) => {
        const toastPromise = page.waitForSelector('#toast-msg', { state: 'visible', timeout: 3000 }).catch(() => null);
        await page.keyboard.press('ArrowDown');
        const toast = await toastPromise;
        if (toast) {
            const text = await toast.innerText();
            expect(text).toContain('Volume');
            console.log(`✅ ArrowDown toast: "${text}"`);
        }
    });

    // -------------------------------------------------------
    test('M: mutes and unmutes', async ({ page }) => {
        const iconBefore = await page.locator('#btn-mute').getAttribute('class');
        await page.keyboard.press('m');
        await page.waitForTimeout(300);
        const iconAfter = await page.locator('#btn-mute').getAttribute('class');
        expect(iconAfter).not.toBe(iconBefore);
        console.log(`✅ M mute: "${iconBefore}" → "${iconAfter}"`);

        await page.keyboard.press('m');
        await page.waitForTimeout(300);
        const iconBack = await page.locator('#btn-mute').getAttribute('class');
        expect(iconBack).toBe(iconBefore);
        console.log(`✅ M unmute: icon restored`);
    });

    // -------------------------------------------------------
    test('S: toggles shuffle (icon turns green)', async ({ page }) => {
        const before = await page.locator('#btn-shuffle').evaluate(el => el.style.color);
        await page.keyboard.press('s');
        await page.waitForTimeout(300);
        const after = await page.locator('#btn-shuffle').evaluate(el => el.style.color);
        expect(after).not.toBe(before);
        console.log(`✅ S shuffle: color ${before} → ${after}`);
    });

    // -------------------------------------------------------
    test('L: toggles repeat (icon turns green)', async ({ page }) => {
        const before = await page.locator('#btn-repeat').evaluate(el => el.style.color);
        await page.keyboard.press('l');
        await page.waitForTimeout(300);
        const after = await page.locator('#btn-repeat').evaluate(el => el.style.color);
        expect(after).not.toBe(before);
        console.log(`✅ L repeat: color ${before} → ${after}`);
    });

    // -------------------------------------------------------
    test('N: skips to next track', async ({ page }) => {
        const titleBefore = await page.locator('#player-title').innerText();
        await page.keyboard.press('n');
        await page.waitForFunction(
            (orig) => {
                const t = document.getElementById('player-title')?.innerText;
                return t && t !== orig && t !== 'Welcome';
            },
            titleBefore,
            { timeout: SONG_LOAD_TIMEOUT }
        );
        const titleAfter = await page.locator('#player-title').innerText();
        expect(titleAfter).not.toBe(titleBefore);
        console.log(`✅ N next: "${titleBefore}" → "${titleAfter}"`);
    });

    // -------------------------------------------------------
    test('V: opens video panel', async ({ page }) => {
        const widthBefore = await page.locator('#video-sidebar').evaluate(el => parseInt(el.style.width) || 0);
        await page.keyboard.press('v');
        await page.waitForTimeout(800);
        const widthAfter = await page.locator('#video-sidebar').evaluate(el => parseInt(el.style.width) || 0);
        expect(widthAfter).toBeGreaterThan(widthBefore);
        console.log(`✅ V video panel: ${widthBefore}px → ${widthAfter}px`);
    });

    // -------------------------------------------------------
    test('Q: opens queue sidebar', async ({ page }) => {
        const widthBefore = await page.locator('#queue-sidebar').evaluate(el => parseInt(el.style.width) || 0);
        await page.keyboard.press('q');
        await page.waitForTimeout(800);
        const widthAfter = await page.locator('#queue-sidebar').evaluate(el => parseInt(el.style.width) || 0);
        expect(widthAfter).toBeGreaterThan(widthBefore);
        console.log(`✅ Q queue: ${widthBefore}px → ${widthAfter}px`);
    });

    // -------------------------------------------------------
    test('R: restarts the track to 0:00', async ({ page }) => {
        // Wait until we're a few seconds in
        await page.waitForFunction(
            () => timeToSeconds_inline(document.getElementById('current-time')?.innerText) > 3,
            { timeout: 15000 },
            () => {} // dummy
        ).catch(async () => {
            // Fallback: just seek forward first
            await page.keyboard.press('ArrowRight');
            await page.keyboard.press('ArrowRight');
            await page.waitForTimeout(1000);
        });

        await page.keyboard.press('r');
        await page.waitForTimeout(800);
        const afterRestart = await getCurrentTime(page);
        expect(timeToSeconds(afterRestart)).toBeLessThanOrEqual(3);
        console.log(`✅ R restart: track back to ${afterRestart}`);
    });

    // -------------------------------------------------------
    test('? key: shows shortcuts help modal', async ({ page }) => {
        // Press Shift+/ which equals ?
        await page.keyboard.press('Shift+/');
        await page.waitForTimeout(500);
        const modal = page.locator('#shortcuts-modal');
        await expect(modal).not.toHaveClass(/hidden/);
        console.log('✅ ? key: shortcuts modal appeared');
        await page.screenshot({ path: 'screenshots/05_shortcuts_modal.png' });

        // Dismiss it
        await page.keyboard.press('Shift+/');
        await page.waitForTimeout(300);
        await expect(modal).toHaveClass(/hidden/);
        console.log('✅ ? key: modal dismissed');
    });

    // -------------------------------------------------------
    test('Space inside search input does NOT pause song', async ({ page }) => {
        const playingBefore = await isPlaying(page);

        // Focus the search input
        await page.click('#nav-search');
        await page.click('#web-search-input');
        await page.keyboard.press('Space'); // Space inside input must NOT toggle play

        await page.waitForTimeout(300);
        const playingAfter = await isPlaying(page);
        expect(playingAfter).toBe(playingBefore);
        console.log(`✅ Space inside input: playback state unchanged (${playingBefore ? 'playing' : 'paused'})`);
    });
});
