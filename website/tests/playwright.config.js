// playwright.config.js
// Configuration for Playwright browser automation tests

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './specs',
    timeout: 60000,          // 60s per test (songs take time to load)
    retries: 1,              // Retry once on failure
    workers: 1,              // Run tests sequentially (only 1 browser at a time)
    reporter: [
        ['html', { outputFolder: 'test-report', open: 'on-failure' }],
        ['list']             // Also print live results in terminal
    ],
    use: {
        baseURL: 'http://localhost:8000',
        headless: false,     // Show the browser so you can watch it work
        viewport: { width: 1280, height: 800 },
        video: 'retain-on-failure',       // Save video of failed tests
        screenshot: 'only-on-failure',    // Save screenshot on failure
        actionTimeout: 15000,             // Max 15s to find/click an element
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        }
    ],
});
