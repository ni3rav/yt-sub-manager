Status: ready-for-agent

# YouTube Subscription Manager — Spec

## Problem Statement

Managing YouTube subscriptions through the YouTube web UI is painful at scale. There is no way to bulk-unsubscribe, search across all subscriptions, categorise channels, or export the list. A user with hundreds of subscriptions has no efficient way to curate them.

## Solution

A local-only desktop dashboard that runs as a single compiled Bun binary. The binary starts a local HTTP server and opens the user's default browser to it. The dashboard lets the user authenticate once with Google OAuth, then sync all their subscriptions into a local SQLite database and manage them: search, sort, filter by category/tag, bulk-tag, bulk-unsubscribe with quota awareness, and export to CSV or JSON. All data stays on the user's machine. The only outbound traffic is direct calls to the YouTube Data API v3.

## User Stories

1. As a user, I want to run a single binary with no arguments so that I don't need Node, npm, or any runtime installed.
2. As a user, I want the binary to auto-open my browser to the dashboard so that I don't have to copy-paste a localhost URL.
3. As a user, I want the server to bind to a free port automatically so that I never hit a port-conflict error.
4. As a user, I want a guided setup screen on first launch so that I know exactly what to do in the Google Cloud Console before entering credentials.
5. As a user, I want step-by-step click-by-click instructions in the setup screen so that I can complete Google Cloud Console setup without leaving the app.
6. As a user, I want to enter my OAuth Client ID and Client Secret in the app UI so that I never have to touch a config file manually.
7. As a user, I want my Client Secret and tokens stored encrypted on disk so that they are not exposed in plaintext if someone reads my files.
8. As a user, I want the OAuth consent screen to open automatically in my browser after I submit credentials so that I can complete the Google login flow without extra steps.
9. As a user, I want to be redirected back to the dashboard automatically after Google grants access so that the auth flow feels seamless.
10. As a user, I want my access token refreshed silently in the background so that my session never expires mid-use without warning.
11. As a user, I want to see a clear message if my refresh token is revoked so that I understand why I've been logged out and what to do next.
12. As a user, I want a "Disconnect / Reset credentials" button so that I can revoke local access without touching the filesystem directly.
13. As a user, I want a "Sync now" button so that I can pull the latest subscription list from YouTube on demand.
14. As a user, I want to see the timestamp of the last successful sync so that I know how fresh the local data is.
15. As a user, I want a loading indicator while sync is running so that I know the app is working and haven't double-clicked.
16. As a user, I want sync to paginate through all my subscriptions automatically so that no channels are missed regardless of how many I have.
17. As a user, I want quota errors during sync surfaced clearly in the UI so that I know why the sync stopped and approximately when I can retry.
18. As a user, I want subscriptions upserted into the local DB during sync so that re-syncing never duplicates rows.
19. As a user, I want the subscription's own ID (not just the channel ID) stored during sync so that unsubscription can use the correct YouTube API parameter.
20. As a user, I want a search input that filters channels live so that I can find a specific channel instantly.
21. As a user, I want to sort channels by title, subscribed date, video count, and subscriber count so that I can identify old or low-activity subscriptions.
22. As a user, I want to filter by category so that I can focus on a single topic area at a time.
23. As a user, I want to filter by tag so that I can see all channels I've labelled with a given keyword.
24. As a user, I want each channel row to show its thumbnail, title, category, tags, video count, subscriber count, and subscribed date so that I have enough context without clicking through.
25. As a user, I want to select individual channels with a checkbox so that I can build a custom bulk-action set.
26. As a user, I want a "select all" checkbox that selects every channel matching the current filter/search so that I don't have to click hundreds of rows.
27. As a user, I want a bulk action bar to appear whenever at least one channel is selected so that the available actions are obvious.
28. As a user, I want to assign a category to multiple selected channels at once so that I can organise in bulk.
29. As a user, I want to create a new category inline (free-text input) during bulk categorisation so that I'm not limited to a predefined list.
30. As a user, I want to add tags to multiple selected channels at once so that I can apply cross-cutting labels.
31. As a user, I want a confirmation modal before bulk-unsubscribing that lists the exact channel names and count so that I cannot accidentally unsubscribe from channels I want to keep.
32. As a user, I want bulk-unsubscribe to proceed channel by channel with a small delay so that I don't exhaust YouTube API quota in a single burst.
33. As a user, I want to see a live progress count during bulk unsubscribe (e.g. "Unsubscribed 12 of 30") so that I know the operation is progressing.
34. As a user, I want a clear report after bulk-unsubscribe showing how many succeeded and which failed, including if the operation was stopped by a quota error so that I know what still needs to be done.
35. As a user, I want successfully unsubscribed channels removed from the local DB immediately so that the list stays accurate without requiring a re-sync.
36. As a user, I want to export my subscription list to CSV so that I can open it in a spreadsheet.
37. As a user, I want to export my subscription list to JSON so that I can use it programmatically.
38. As a user, I want to choose between exporting only the currently filtered/searched results or my full library so that I can scope the export to what I care about.
39. As a user, I want the export to include category and tags columns so that my organisation work is preserved outside the app.
40. As a user, I want all Google API errors (auth expired, quota exceeded, network failure) shown as readable messages in the UI so that I never see a blank screen or an unhandled exception.
41. As a user, I want all credential and database files stored in an OS-appropriate app data directory so that they are never accidentally bundled into the binary or committed to git.
42. As a user, I want a README with exact click-by-click Google Cloud Console setup instructions and binary run instructions for macOS, Linux, and Windows so that anyone can get started without prior knowledge of OAuth.

## Implementation Decisions

### Binary and server architecture
- Single Bun process: `Bun.serve` with HTML imports bundles the React frontend and backend routes into one binary via `bun build --compile`.
- Entry point: `src/index.ts` (already exists). The HTML import `src/index.html` drives the frontend bundle.
- The server binds to port 0 (OS-assigned free port) on `127.0.0.1` and uses the resolved port for the OAuth redirect URI and browser-open call.
- Browser is opened using `Bun.spawn` with the platform-appropriate command: `open` (macOS), `xdg-open` (Linux), `start` (Windows).
- The `build:binary` npm script runs: `bun build ./src/index.ts --compile --outfile yt-sub-manager`.
- The existing `build.ts` (browser bundle for dist/) is kept as-is for development; the binary compile is a separate script.

### App data directory
- Resolved at runtime via `os.homedir()` — never a relative path — so the binary works from any working directory:
  - macOS: `~/Library/Application Support/yt-sub-manager/`
  - Linux: `~/.local/share/yt-sub-manager/`
  - Windows: `%APPDATA%/yt-sub-manager/`
- Created on first run with `fs.mkdirSync(..., { recursive: true })`.
- Files inside: `db.sqlite`, `credentials.enc`, `.key`.

### Credential encryption
- On first run, generate 32 random bytes as the master key; write to `.key` in the app data dir; `chmod 600` it.
- Encrypt `{ clientId, clientSecret, accessToken, refreshToken, expiry }` as a JSON string using `node:crypto` AES-256-GCM. Store `{ iv, authTag, ciphertext }` as JSON in `credentials.enc`.
- Key file and credentials file are never sent to the frontend in any API response.
- Disconnect action deletes `credentials.enc` (key file is retained so re-setup doesn't need to regenerate; this is a deliberate simplicity trade-off).

### OAuth flow
- Uses `googleapis` npm package's `google.auth.OAuth2` client.
- OAuth client type must be "Desktop app" (not "Web application") — this allows any `http://127.0.0.1:<port>` redirect URI without pre-registering it in Google Cloud Console.
- Redirect URI: `http://127.0.0.1:<server-port>/oauth/callback`.
- Requested scope: `https://www.googleapis.com/auth/youtube` (full access, required for `subscriptions.delete`).
- Token refresh is handled transparently by the `googleapis` client on every API call; if refresh fails (e.g. user revoked access in Google account settings), catch the error, wipe `credentials.enc`, and return a 401 that routes the frontend to the setup screen with an explanatory message.

### SQLite schema (`bun:sqlite`)
```sql
CREATE TABLE IF NOT EXISTS channels (
  channel_id       TEXT PRIMARY KEY,
  subscription_id  TEXT NOT NULL,         -- YouTube subscription resource ID, needed for delete
  title            TEXT NOT NULL,
  description      TEXT,
  thumbnail_url    TEXT,
  subscribed_at    TEXT,                  -- ISO 8601
  video_count      INTEGER,
  subscriber_count INTEGER,
  category         TEXT,
  tags             TEXT DEFAULT '[]',     -- JSON array serialised as string
  last_synced_at   TEXT                   -- ISO 8601
);

CREATE INDEX IF NOT EXISTS idx_channels_title        ON channels (title);
CREATE INDEX IF NOT EXISTS idx_channels_subscribed   ON channels (subscribed_at);
CREATE INDEX IF NOT EXISTS idx_channels_category     ON channels (category);
```
- `bun:sqlite` is used directly (zero native deps, compiles cleanly into the binary).

### Backend API surface
All routes live in the same `Bun.serve` instance as the frontend HTML import.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/status` | Returns `{ authenticated: boolean, setupRequired: boolean }` |
| POST | `/api/auth/setup` | Body `{ clientId, clientSecret }`. Encrypts creds, starts OAuth flow, returns `{ authUrl }` for frontend redirect. |
| GET | `/oauth/callback` | Receives Google redirect, exchanges code, stores tokens, redirects to `/`. |
| POST | `/api/auth/disconnect` | Deletes `credentials.enc`, returns 200. |
| POST | `/api/sync` | Paginates `youtube.subscriptions.list` (mine=true, maxResults=50), upserts all rows, returns `{ count, errors }`. |
| GET | `/api/channels` | Query params: `q`, `sortBy`, `sortDir`, `category`, `tag`, `page`, `pageSize`. Returns `{ channels[], total, page, pageSize }`. |
| POST | `/api/channels/tag` | Body `{ channelIds[], category?, tags? }`. Bulk-updates rows. |
| POST | `/api/channels/unsubscribe` | Body `{ channelIds[] }`. Calls `subscriptions.delete` per channel with a 250ms inter-call delay. Returns `{ succeeded[], failed[], quotaStopped: boolean }`. |
| GET | `/api/export` | Query `format=csv\|json`, `scope=filtered\|all`, plus same filter params as `/api/channels`. Streams file download. |

### Quota handling
- `subscriptions.delete` costs 50 quota units per call; daily default is 10,000 (≈200 deletes/day).
- On `quotaExceeded` from Google API, stop immediately, return partial results with `quotaStopped: true` and count of succeeded/failed.
- The UI surfaces this as a non-dismissable banner explaining quota, how many were processed, and that the user can retry tomorrow.

### Frontend structure
- React 19 (already installed). Plain CSS for styling — no additional component library beyond the existing Radix primitives already in `package.json`.
- Two top-level views controlled by auth status: `<SetupScreen>` and `<Dashboard>`.
- `<Dashboard>` contains: `<TopBar>` (search, sort, filter, sync button + last-sync timestamp), `<ChannelTable>` (rows with checkboxes), `<BulkActionBar>` (conditional on selection), `<ExportControls>`.
- `<UnsubscribeConfirmModal>` — lists channel names, count, and a "This cannot be undone" warning before firing.
- `<ProgressToast>` — live counter during bulk unsubscribe and sync.
- All API calls go through a thin `apiClient` module that handles `fetch`, JSON parsing, and error normalisation.

## Testing Decisions

### What makes a good test
Test external behaviour only — what the HTTP API returns given specific inputs and DB state, and what the credential store persists and retrieves. Do not test internal module structure, import paths, or private functions. Tests should pass after a refactor that doesn't change observable behaviour.

### Primary seam: HTTP API layer
- Spin up a real `Bun.serve` instance pointing at an in-memory SQLite database (`new Database(":memory:")`) for full isolation.
- Use `fetch()` against the test server's URL.
- Stub the `googleapis` YouTube client with a lightweight in-process mock (a plain object with async methods) injected at server construction time, so no real API calls are made.
- Test every route: happy path, validation errors, auth-not-present 401, and quota-exceeded response shape.
- One `bun test` file per route group: `auth.test.ts`, `sync.test.ts`, `channels.test.ts`, `unsubscribe.test.ts`, `export.test.ts`.

### Secondary seam: credential store
- Unit tests for `encryptCredentials` / `decryptCredentials` round-trip.
- Test that the key file is created with mode `0o600`.
- Test that `disconnect()` removes `credentials.enc` and that subsequent reads return null.
- Use a temp directory per test run (e.g. `os.tmpdir() + /yt-test-<random>/`) so tests never touch the real app data dir.

### Secondary seam: YouTube API adapter
- Unit tests for pagination logic: mock a `subscriptions.list` that returns two pages, assert all items are collected.
- Test quota-exceeded detection: mock returns `{ code: 403, errors: [{ reason: 'quotaExceeded' }] }`, assert adapter throws a typed `QuotaExceededError`.
- Test token-revoked detection: mock refresh throws, assert adapter clears tokens and throws a typed `AuthRevokedError`.

### Prior art
No existing tests in the repo. The patterns above establish the test conventions for this feature.

## Out of Scope

- Multi-account support (single Google account only).
- YouTube Analytics data (watch time, revenue, etc.).
- Managing playlists, liked videos, or watch history.
- Scheduling or automating recurring unsubscriptions.
- A native desktop GUI (Electron, Tauri, etc.) — the browser UI served by the local binary is sufficient.
- Syncing subscription changes made outside the app back in real time (sync is always manual / on-demand).
- GitLab or GitHub integration for the issue tracker — this repo uses local markdown.
- Support for Google Workspace or organisation-managed YouTube accounts (standard consumer OAuth only).

## Further Notes

- The `googleapis` package has no native add-on dependencies and compiles cleanly into a Bun binary.
- The `open` npm package can be used as an alternative to `Bun.spawn` for browser-opening if cross-platform behaviour needs more robustness — verify at implementation time whether it has native deps (it does not as of v10).
- The OAuth "Desktop app" credential type is critical: it allows `http://127.0.0.1` redirect URIs on any port without pre-registration, which is what makes the dynamic port binding possible.
- YouTube Data API v3 `subscriptions.list` returns `snippet.resourceId.channelId` (the channel) and `id` (the subscription resource) — both must be stored. `subscriptions.delete` takes the subscription `id`, not the channel ID.
- The `bun build --compile` flag inlines all JS and assets into a single binary. The SQLite database, key file, and credentials file must live outside the binary (in the app data directory) — code must never reference them with relative paths.
