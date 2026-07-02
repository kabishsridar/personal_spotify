# Spotify Web App — Automated Test Suite

This folder contains a **Playwright** test suite that opens a real Chrome browser,
clicks buttons, types text, and checks every feature of the app automatically.

---

## 📁 Structure

```
tests/
├── package.json              ← dependencies
├── playwright.config.js      ← browser settings
├── screenshots/              ← auto-saved screenshots
└── specs/
    ├── helpers.js            ← shared functions (click, search, play etc.)
    ├── 01_homepage.spec.js   ← Home page, sidebar, genre cards
    ├── 02_search.spec.js     ← Search results, infinite scroll
    ├── 03_playback.spec.js   ← Play, pause, seek, next, prev, shuffle, repeat
    ├── 04_video_sync.spec.js ← Video panel open/close, seek sync, pause sync
    └── 05_keyboard_shortcuts.spec.js ← All 14 keyboard shortcuts
```

---

## ⚡ Quick Start (First Time Setup)

### Step 1 — Make sure the server is running
```powershell
cd d:\Git_repos\spotify_firstcopy\website
python server.py
```
Keep this terminal open.

### Step 2 — Open a NEW terminal, go to tests folder
```powershell
cd d:\Git_repos\spotify_firstcopy\website\tests
```

### Step 3 — Install Playwright (once only)
```powershell
npm install
npx playwright install chromium
```

### Step 4 — Run all tests (headed = you see the browser)
```powershell
npm run test:headed
```

### Step 5 — View the HTML report
```powershell
npm run test:report
```

---

## 🧪 Run specific test files

```powershell
# Only homepage tests
npx playwright test 01_homepage

# Only playback tests
npx playwright test 03_playback

# Only keyboard shortcut tests
npx playwright test 05_keyboard

# Only video sync tests
npx playwright test 04_video
```

---

## 🖥️ How it works (how AI like Antigravity controls Chrome)

Playwright is an open-source library by Microsoft. It:

1. **Launches a real Chromium (Chrome) browser** in the background
2. **Navigates to URLs** — same as you typing in the address bar
3. **Finds elements** by CSS selector (e.g. `#btn-next`, `.recent-card`)
4. **Clicks, types, presses keys** — exactly like a human would
5. **Reads DOM values** — checks text, classes, attributes
6. **Takes screenshots** — saved to `screenshots/` folder
7. **Records video** — saved on test failure

The AI tool (`browser_subagent`) I use internally is built on the same Playwright engine.
Now you have the exact same power yourself!

---

## 🤖 What each test file checks

| File | Tests |
|------|-------|
| `01_homepage` | Page loads, sidebar visible, genre card clicks |
| `02_search` | Results appear, infinite scroll loads more |
| `03_playback` | Timeline moves, seek, pause/resume, next/prev, shuffle/repeat |
| `04_video_sync` | Video panel opens, iframe loads, seek+video stays in sync |
| `05_keyboard_shortcuts` | All 14 keys: Space, N, P, R, F, M, S, L, V, Q, ←→, ↑↓, ? |

---

## 🎬 Recording

Every test run automatically records a WebM video of the browser session.
Videos are saved to `test-results/` and shown in the HTML report.
