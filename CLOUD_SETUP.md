# Connect Waypoint to Supabase

The app code is ready for Supabase, but cloud saving stays off until the database and public settings below are configured. Your Supabase dashboard account manages the project. The email/password account you create **inside Waypoint** is the account that owns your tasks.

## 1. Create the database

Open the **Waypoint** project in the [Supabase dashboard](https://supabase.com/dashboard).

1. Open **SQL Editor**, then create a new query.
2. Copy the entire contents of [`supabase/schema.sql`](supabase/schema.sql) into it.
3. Click **Run**. You should see a success message.

This creates private, per-account storage and a save function that rejects outdated writes. The script can be run again without clearing existing tasks.

If the Supabase integration is connected to this chat, the coding assistant can apply this script to your chosen project instead.

## 2. Connect the website

In the project's **Connect** dialog, find the **Project URL** and **publishable key**. A legacy **anon** key also works.

Edit [`js/config.js`](js/config.js):

```js
window.WAYPOINT_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabasePublishableKey: "sb_publishable_YOUR_PUBLIC_KEY",
};
```

These settings are designed to be public in a browser. **Never use a secret key, a service_role key, a database password, or a personal access token.** Account access is enforced by the database's row-level security rules, which the SQL script enables. See [Supabase's security guide](https://supabase.com/docs/guides/database/secure-data).

## 3. Configure email sign-in

1. Under **Authentication**, make sure the **Email** provider is enabled and account signups are allowed.
2. Open **URL Configuration**.
3. Set **Site URL** to `https://austinjamesnicholson.github.io/Waypoint/` if that is your published address; otherwise use the address where you actually publish the app.
4. Add that exact address to **Redirect URLs**. For local development, also add `http://localhost:8000/`.
5. Keep email confirmation enabled. Account confirmation and password reset emails must be allowed to return to these URLs.

If emails do not arrive, check spam, Authentication logs, email limits, and your project's email/SMTP configuration. Waypoint shows authentication errors returned by Supabase. More details: [password-based authentication](https://supabase.com/docs/guides/auth/passwords).

## 4. Publish and try both devices

Upload/publish all the website files, including `css/`, `js/`, and `js/vendor/`. No build command is needed. Do not publish `node_modules/` or test tool folders.

1. Open the published site and reload to get the latest version.
2. Choose **Sign in → Create account**. Confirm your email, then sign in.
3. Add one task and wait for **Saved to cloud**.
4. Open the same site on the other device and sign in with that same email/password.
5. The task should appear. Use **Account & sync → Sync now** for an immediate check.

Existing local-only tasks are not uploaded automatically. Your cloud account starts fresh, as requested. Signing out returns you to the separate local-only copy. Signing back in restores that account's tasks and queued changes.

## Everyday behavior

- Changes save on the device first, then upload after a short pause.
- While the app is visible, it checks for cloud changes every 15 seconds. Returning to the app or reconnecting also triggers sync.
- Offline edits stay queued across reloads. The installed app needs one successful online load to cache the website for offline use.
- Tasks and projects added or changed on different devices combine automatically. Deletions also sync.
- If both devices change the same task or project, syncing pauses and **Account & sync** asks which conflicting version to keep. Other, unrelated changes are combined. A deletion versus an edit also counts as a conflict.
- Import and Reset affect the signed-in account and sync to its other devices.
- Each account has its own local cache. Sign-out hides it but retains unsynced changes for the next sign-in. Use a trusted device; clearing browser storage can erase changes that have not reached the cloud.
- Prefer one Waypoint tab per device when working offline; separate tabs share browser storage.

## Developer checks

The website needs no build tools. Tests require Node.js and development dependencies:

```sh
npm ci
npm test
```

Tests cover data merging, deletion conflicts, offline recovery, concurrent saves, account isolation, and database policies in a local PostgreSQL engine. A browser test uses installed Chrome on Windows, or Playwright's Chromium on other systems. Set `WAYPOINT_CHROME` to override the executable path; the browser test is skipped if no browser is available.

The browser test uses a simulated Supabase endpoint. Verify real email confirmation, password recovery, and phone/computer syncing on the configured project before relying on the live service.
