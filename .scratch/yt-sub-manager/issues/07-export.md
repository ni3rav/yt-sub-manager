# 07 — Export (CSV + JSON)

**What to build:** The ability to download the subscription list as a file. The user can choose to export either the full library or only the channels matching the current filter/search, and can pick CSV or JSON format. The export includes category and tags so that organisational work done inside the app is preserved outside it. The download is streamed directly from the backend — no intermediate file is written to disk.

**Blocked by:** 04 — channels list API + dashboard table (filter/search state and channel data must exist).

**Status:** ready-for-agent

- [ ] `GET /api/export` accepts query params: `format` (csv | json), `scope` (filtered | all), and the same filter params as `GET /api/channels` (`q`, `sortBy`, `sortDir`, `category`, `tag`)
- [ ] When `scope=all`, all channels in the database are exported regardless of filter params
- [ ] When `scope=filtered`, only channels matching the provided filter params are exported
- [ ] CSV export includes columns: `channel_id`, `subscription_id`, `title`, `description`, `thumbnail_url`, `subscribed_at`, `video_count`, `subscriber_count`, `category`, `tags` (comma-joined tag values within the cell)
- [ ] JSON export is an array of channel objects with the same fields
- [ ] The response sets appropriate `Content-Disposition: attachment; filename="subscriptions.<ext>"` and `Content-Type` headers so the browser triggers a file download
- [ ] The export is streamed — no full result set is held in memory beyond what SQLite returns
- [ ] The React UI has export controls with a format toggle (CSV / JSON) and a scope toggle (Filtered / All)
- [ ] The export controls are visible in the dashboard and initiate a file download when activated (navigating to the export URL or using a form POST that triggers download)
- [ ] When `scope=filtered` and no filter is active, the exported set equals the full library (consistent with the channels list behaviour)
- [ ] HTTP API tests: `GET /api/export?format=csv&scope=all` returns correct CSV headers and body; `GET /api/export?format=json&scope=filtered&q=cooking` returns only matching channels; invalid format returns 400
