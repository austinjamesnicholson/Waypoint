# Waypoint V1 — GitHub Pages PWA

A mobile-friendly, installable task tracker. No backend or account needed.

## Publish using GitHub Pages

1. On GitHub, create a **public** repository (for example, `waypoint`).
2. Upload the **contents** of this folder to the repository root, keeping the `icons` folder intact. The repository root must contain `index.html`, `manifest.webmanifest`, and `service-worker.js`.
3. Go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, branch **main**, folder **/(root)**; Save.
4. Once GitHub shows the live URL, open it in **Safari on your iPhone**.
5. Tap **Share → Add to Home Screen → Add**. Launch Waypoint from its new Home Screen icon.

The public repository contains only the app code; your entered tasks are **not** uploaded to GitHub.

## Data safety

Tasks are saved using `localStorage` on each browser/device independently. The iPhone Home Screen app may have storage separate from Safari. There is **no automatic sync**. Use the app's **Backup → Export JSON backup** and **Import JSON backup** to transfer or protect your tasks. Deleting site data or the installed app may delete locally saved tasks.

## Offline usage

After the site loads and its service worker installs successfully, app files are cached for offline use. Updates require an online visit. This is an app shell cache, not a cloud backup.

## Development

You can open `index.html` directly on Windows for basic tests. Installability and offline caching require HTTPS (as provided by GitHub Pages) or localhost. To test locally with a server, run `python -m http.server 8000` in this directory and open `http://localhost:8000`.
