/**
 * 01_homepage.spec.js
 * Tests: Home page load, sidebar navigation, genre cards
 */

const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test.describe('Home Page', () => {

    test('App loads and shows sidebar', async ({ page }) => {
        await openApp(page);

        // Sidebar links must exist
        await expect(page.locator('#nav-home')).toBeVisible();
        await expect(page.locator('#nav-search')).toBeVisible();
        await expect(page.locator('#nav-library')).toBeVisible();

        // Player bar must exist
        await expect(page.locator('#player-title')).toBeVisible();
        await expect(page.locator('#play-pause-btn')).toBeVisible();

        // Logo visible
        await expect(page.locator('.logo')).toBeVisible();

        await page.screenshot({ path: 'screenshots/01_home_loaded.png' });
        console.log('✅ Home page: PASS');
    });

    test('Genre cards are visible', async ({ page }) => {
        await openApp(page);
        const cards = page.locator('.genre-card');
        const count = await cards.count();
        expect(count).toBeGreaterThan(4);
        console.log(`✅ Genre cards visible: ${count} found`);
    });

    test('Click Tamil card triggers search', async ({ page }) => {
        await openApp(page);
        await page.click('#card-tamil');
        // Should transition to search view
        await page.waitForSelector('#results-list', { timeout: 15000 });
        console.log('✅ Tamil card opens search results');
    });

    test('Sidebar navigation to Search view works', async ({ page }) => {
        await openApp(page);
        await page.click('#nav-search');
        await expect(page.locator('#search-view')).not.toHaveClass(/hidden/);
        console.log('✅ Search view navigation: PASS');
    });

    test('Sidebar navigation to Library works', async ({ page }) => {
        await openApp(page);
        await page.click('#nav-library');
        await expect(page.locator('#playlist-view')).not.toHaveClass(/hidden/);
        console.log('✅ Library view navigation: PASS');
    });
});
