# Deploying Your Spotify Web App Online (Free Cloud Hosting)

Because this app uses a **Python (FastAPI) Backend** to search and stream audio using `yt-dlp`, it cannot be hosted on static-only hosting services like GitHub Pages. 

It must be deployed on a cloud platform that runs Python, such as **Render.com** or **Railway.app**. Both link directly to your GitHub repository and redeploy automatically whenever you push new code!

---

## Option 1: Deploy on Render.com (Recommended & Free)

Render has a generous **Free Tier** for hosting web services.

### Step 1: Create a Render Account
1. Go to [Render.com](https://render.com/) and sign up.
2. Link your **GitHub** account.

### Step 2: Create a New Web Service
1. Click the **"New +"** button in the dashboard and select **"Web Service"**.
2. Select your repository `personal_spotify` from the connected GitHub list.

### Step 3: Configure Deployment Settings
Set the following settings in the configuration screen:
* **Name:** `my-personal-spotify` (or any name you like)
* **Region:** Select the closest region to you (e.g., Singapore for Asia, Oregon for US).
* **Branch:** `main`
* **Root Directory:** `website`  *(This is critical! It tells Render to deploy only the files inside your website folder).*
* **Runtime:** `Python`
* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `python server.py`
* **Instance Type:** `Free`

### Step 4: Click Deploy!
1. Click **"Create Web Service"** at the bottom of the page.
2. Render will build your dependencies, start the FastAPI server, and provide a public URL (e.g. `https://my-personal-spotify.onrender.com`).
3. You can open this link on your phone, tablet, or share it with friends to stream music from anywhere!

---

## Option 2: Deploy on Railway.app (Fastest Setup)

Railway is another popular hosting service with quick GitHub integration.

### Step 1: Create a Railway Account
1. Sign up at [Railway.app](https://railway.app/) using your GitHub account.

### Step 2: Provision the Project
1. Click **"New Project"** -> **"Deploy from GitHub repo"**.
2. Choose your `personal_spotify` repository.

### Step 3: Configure Root Folder
1. Click on the newly spawned service in your Railway dashboard and go to **Settings**.
2. Under **Root Directory**, set it to `website`.
3. Under **Start Command**, set it to `python server.py` (if not detected automatically).
4. Go to the **Variables** tab, click **"New Variable"**, and add:
   * `PORT` = `8000` (or leave empty, Railway handles port binding automatically).
5. Click **"Generate Domain"** under the Settings tab to get your public URL (e.g., `https://personal-spotify-production.up.railway.app`).
