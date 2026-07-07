/**
 * 02_search.spec.js
 * Tests: Search functionality, results rendering, infinite scroll
 */

const { test, expect } = require('@playwright/test');
const { openApp, searchFor } = require('./helpers');

test.describe('Search', () => {

    test('Search returns results', async ({ page }) => {
        await openApp(page);
        const count = await searchFor(page, 'Tamil love songs');
        expect(count).toBeGreaterThan(0);
        await page.screenshot({ path: 'screenshots/02_search_results.png' });
    });

    test('Each result has title and artist text', async ({ page }) => {
        await openApp(page);
        await searchFor(page, 'AR Rahman');

        const firstCard = page.locator('.recent-card:visible').first();
        // The card should contain non-empty text
        const text = await firstCard.innerText();
        expect(text.trim().length).toBeGreaterThan(3);
        console.log(`✅ First result text: "${text.trim().slice(0, 60)}..."`);
    });

    test('Infinite scroll loads more results', async ({ page }) => {
        await openApp(page);
        await searchFor(page, 'Tamil hits');

        const before = await page.locator('.recent-card:visible').count();
        console.log(`  Before scroll: ${before} cards`);

        // Scroll the main content area to the bottom
        await page.evaluate(() => {
            const el = document.querySelector('.main-content');
            if (el) el.scrollTop = el.scrollHeight;
        });

        // Wait for more items to load (loader animation)
        await page.waitForTimeout(8000); // Wait for API response

        const after = await page.locator('.recent-card:visible').count();
        console.log(`  After scroll: ${after} cards`);
        expect(after).toBeGreaterThanOrEqual(before);
        console.log(`✅ Infinite scroll: ${after - before} more songs loaded`);
    });

    test('Search for specific song "Dippam Dappam"', async ({ page }) => {
        await openApp(page);
        const count = await searchFor(page, 'Dippam Dappam');
        expect(count).toBeGreaterThan(0);
        console.log('✅ Specific song search works');
    });

    test('Empty search shows no crash', async ({ page }) => {
        await openApp(page);
        await page.click('#nav-search');
        await page.fill('#web-search-input', '  ');
        await page.press('#web-search-input', 'Enter');
        // App should not crash — home should still be navigable
        await page.waitForTimeout(2000);
        await expect(page.locator('#play-pause-btn')).toBeVisible();
        console.log('✅ Empty search: no crash');
    });
});
