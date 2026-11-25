# Waypoint V1 — GitHub Pages PWA

A mobile-friendly, installable task tracker with optional Supabase cloud sync. Use it locally without an account, or sign in to share tasks between your phone and computer.

See [CLOUD_SETUP.md](CLOUD_SETUP.md) to connect your Supabase project. Cloud sync is inactive until setup is complete.

## Publish using GitHub Pages

1. On GitHub, create a **public** repository (for example, `waypoint`).
2. Upload the **contents** of this folder to the repository root, keeping the `icons`, `css`, and `js` folders intact. The repository root must contain `index.html`, `manifest.webmanifest`, and `service-worker.js`.
3. Go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, branch **main**, folder **/(root)**; Save.
4. Once GitHub shows the live URL, open it in **Safari on your iPhone**.
5. Tap **Share → Add to Home Screen → Add**. Launch Waypoint from its new Home Screen icon.

The public repository contains only the app code; your entered tasks are **not** uploaded to GitHub.

## Data safety

When signed out, tasks stay in that browser. When signed in to a configured Supabase project, tasks save locally first and sync to the same account on your other devices. Each account has separate local storage. Offline changes upload after reconnecting. Competing edits require a choice in **Account & sync**. Deleting website data can erase edits that have not synced. Existing local-only tasks are kept separate from cloud accounts.

## Offline usage

After the site loads and its service worker installs successfully, app files are cached for offline use. Updates require an online visit. This is an app shell cache, not a cloud backup.

## Development

You can open `index.html` directly on Windows for basic tests. Installability and offline caching require HTTPS (as provided by GitHub Pages) or localhost. To test locally with a server, run `python -m http.server 8000` in this directory and open `http://localhost:8000`.

## Code organization

- `index.html`: the starting page; loads the styles and scripts.
- `css/styles.css`: all styling, including mobile layouts.
- `js/views/dashboard.js`: dashboard and ranked work queue.
- `js/views/projects.js`: project list and project cards.
- `js/views/project-detail.js`: tasks and details for one project.
- `js/views/tasks.js`: all tasks, search, and filters.
- `js/views/inbox.js`: unsorted inbox.
- `js/views.js`: connects the view files to the app.
- `js/app.js`: shared navigation, task cards, saved data, forms, and events.
- `js/config.js`: public Supabase project URL and publishable key.
- `js/cloud.js`: sign-in screen and connection management.
- `js/sync.js`: offline queue, cloud saves, and conflict handling.
- `js/vendor/`: pinned Supabase browser library and license.
- `supabase/schema.sql`: private database table and safe save function.
- `tests/`: sync, database security, and browser checks.
- `js/pwa.js`: starts offline support.
- `service-worker.js`: caches the app files for offline use.

These are views within one app, so switching views does not reload the page. Each view receives the current data and shared helpers from `app.js`. To change a screen, start with its file in `js/views/`. No build step is needed. Upload the `css` and `js` folders along with the other site files when publishing.

For repeatable checks, run `npm ci` followed by `npm test`. Node.js is needed only for development checks, not for publishing or using the website.

## Task dependencies

In a task editor, open **Parents / prerequisites** to choose tasks that must finish first, or **Dependent tasks** to link tasks that wait for this one. Links work across projects. Tasks waiting on unfinished parents stay out of the dashboard's ready queue and cannot be marked complete until their parents finish. Removing a task also removes its links.

On a project page, choose **Task flowchart** to see parent-to-dependent arrows. Select any chart card to edit it. Connected tasks from other projects are included. Dependency loops are rejected; if separate offline edits introduce a loop, the chart shows a warning so you can remove it. The chart works offline with the rest of the app.
