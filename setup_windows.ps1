# Windows Startup & Dependency Check Script for Personal Spotify
Write-Host "🎨 Setting up Personal Spotify for Windows..." -ForegroundColor Cyan

# 1. Check for Python
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python not found! Please install Python 3.9+ from python.org"
    exit
}

# 2. Setup Virtual Environment
if (!(Test-Path "venv")) {
    Write-Host "📦 Creating virtual environment..."
    python -m venv venv
}

# 3. Install Requirements
Write-Host "📥 Installing dependencies..."
.\venv\Scripts\pip install -r requirements.txt

# 4. Check for libmpv-2.dll
$dllPath = "libmpv-2.dll"
if (!(Test-Path $dllPath)) {
    Write-Host "⚠️  libmpv-2.dll not found in project root!" -ForegroundColor Yellow
    Write-Host "To play music, you need libmpv."
    Write-Host "1. Go to https://mpv.io/installation/"
    Write-Host "2. Download the Windows build (e.g., from shinchiro)"
    Write-Host "3. Extract libmpv-2.dll and place it in: $(Get-Location)"
    Write-Host ""
    $resp = Read-Host "Would you like me to open the download page? (y/n)"
    if ($resp -eq 'y') {
        Start-Process "https://www.gyan.dev/ffmpeg/builds/" # Or direct link to mpv builds
    }
}

# 5. Launch App
Write-Host "🚀 Launching Personal Spotify..." -ForegroundColor Green
.\venv\Scripts\python main.py
