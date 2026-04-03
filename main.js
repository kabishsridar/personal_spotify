const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let pythonProcess = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        backgroundColor: '#121212',
        title: "45 personal spotify",
        icon: path.join(__dirname, 'src', 'icon.png'), // Optional: We can add an icon later
        webPreferences: {
            nodeIntegration: false
        }
    });

    // Launch the Python FastAPI server in the background
    console.log("Launching 45 personal spotify engine...");
    pythonProcess = spawn('python', ['spotify_web/server.py'], {
        cwd: __dirname
    });

    // Small delay to ensure server is up before loading the window
    setTimeout(() => {
        win.loadURL('http://localhost:8000');
    }, 2000);

    win.on('closed', () => {
        if (pythonProcess) pythonProcess.kill();
        app.quit();
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (pythonProcess) pythonProcess.kill();
        app.quit();
    }
});
