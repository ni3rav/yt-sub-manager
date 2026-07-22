# 03 — SQLite schema + subscription sync

**What to build:** The local database and the sync flow that populates it. On first run after auth, the SQLite database is initialised in the app data directory with the `channels` table and its indexes. The user clicks "Sync now" and the backend paginates through all their YouTube subscriptions (50 per page) and upserts every channel into the local database. Both the channel ID and the subscription resource ID are stored — the subscription ID is required later for unsubscription. Quota errors during sync are caught, surfaced as a structured response, and shown clearly in the UI. Re-syncing is safe — it upserts without duplicating rows.

**Blocked by:** 02 — OAuth setup flow (authenticated API access required).

**Status:** ready-for-agent

- [ ] The `channels` table is created on first run with columns: `channel_id` (PK), `subscription_id`, `title`, `description`, `thumbnail_url`, `subscribed_at`, `video_count`, `subscriber_count`, `category`, `tags` (JSON string, default `'[]'`), `last_synced_at`
- [ ] Indexes are created on `title`, `subscribed_at`, and `category`
- [ ] `POST /api/sync` paginates `youtube.subscriptions.list` with `mine=true`, `part=snippet,contentDetails`, `maxResults=50` until no `nextPageToken` remains
- [ ] Each subscription is upserted into `channels` (INSERT OR REPLACE or equivalent); re-syncing does not duplicate rows
- [ ] `subscription_id` is populated from the YouTube subscription resource `id` field (not the channel ID)
- [ ] `POST /api/sync` returns `{ count: <total upserted>, errors: [] }` on success
- [ ] When a `quotaExceeded` error is received from the YouTube API mid-sync, the backend stops pagination, returns `{ count: <upserted so far>, errors: [{ reason: 'quotaExceeded', message: '...' }] }`, and the UI surfaces this clearly (not a blank screen or unhandled exception)
- [ ] `last_synced_at` is updated to the current ISO 8601 timestamp for every upserted row
- [ ] The "Sync now" button in the UI shows a loading state while sync is in progress and is disabled during that time
- [ ] After sync completes, the last-synced timestamp shown in the top bar updates without a page reload
- [ ] HTTP API tests: sync with a stubbed two-page `subscriptions.list` response upserts all items; re-sync does not duplicate rows; quota-exceeded mid-pagination returns the correct partial response shape
- [ ] YouTube adapter unit tests: pagination collects all pages; quota-exceeded throws a typed `QuotaExceededError`
