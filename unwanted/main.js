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
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });

    // Launch the Python FastAPI server in the background
    console.log("Launching 45 personal spotify engine...");
    
    // On Windows, 'python' might need shell: true or we might need to point to the venv
    // Use venv python if it exists, otherwise fallback to system python
    let pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const venvPath = process.platform === 'win32' 
        ? path.join(__dirname, 'venv', 'Scripts', 'python.exe') 
        : path.join(__dirname, 'venv', 'bin', 'python');
    
    const fs = require('fs');
    if (fs.existsSync(venvPath)) {
        console.log("Using Virtual Environment Python: " + venvPath);
        pythonCmd = venvPath;
    }
    
    pythonProcess = spawn(pythonCmd, ['spotify_web/server.py'], {
        cwd: __dirname,
        shell: process.platform === 'win32' // Needed for CMD or PowerShell execution
    });

    pythonProcess.stdout.on('data', (data) => console.log(`Python: ${data}`));
    pythonProcess.stderr.on('data', (data) => console.error(`Python Error: ${data}`));

    // Small delay to ensure server is up before loading the window
    setTimeout(() => {
        win.loadURL('http://localhost:8000').catch(e => {
            console.error("Failed to load server URL:", e);
            win.loadFile(path.join(__dirname, 'spotify_web', 'index.html'));
        });
        
        // Open DevTools by default to help debug the "black screen" or other issues
        win.webContents.openDevTools();
    }, 4000);

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
