# Mobile Setup Script for 45 Personal Spotify
# Use this to prepare your project for APK building

Write-Host "--- 45 Personal Spotify: Mobile Setup ---" -ForegroundColor Green

# 1. Install Capacitor
Write-Host "Installing Capacitor dependencies..."
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Add Android Platform
Write-Host "Adding Android platform..."
npx cap add android

# 3. Inform user about the Python backend
Write-Host "`nIMPORTANT:" -ForegroundColor Yellow
Write-Host "To use the app on your phone, you must:"
Write-Host "1. Keep your computer running the Python server."
Write-Host "2. Ensure both your computer and phone are on the same Wi-Fi."
Write-Host "3. The app will automatically try to connect to your computer's IP."

Write-Host "`nTo build the APK, open Android Studio and run:" -ForegroundColor Cyan
Write-Host "npx cap open android"

Write-Host "`nThen build the 'Signed Bundle / APK' from the Build menu in Android Studio."
