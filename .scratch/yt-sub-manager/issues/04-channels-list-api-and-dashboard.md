# 04 — Channels list API + dashboard table

**What to build:** The core browse experience. The backend exposes a paginated, searchable, sortable, filterable channels endpoint. The React dashboard renders a table of subscriptions with all their metadata, a search input that filters live, sort and category/tag filter dropdowns, and per-row checkboxes with a select-all. This ticket makes the subscription list fully browseable — it is the foundation that the bulk-action tickets (05, 06, 07) build on.

**Blocked by:** 03 — SQLite schema + sync (channels table must exist and be populated).

**Status:** resolved

- [x] `GET /api/channels` accepts query params: `q` (full-text search on title), `sortBy` (title | subscribed_at | video_count | subscriber_count), `sortDir` (asc | desc), `category`, `tag`, `page` (1-based), `pageSize`
- [x] The response shape is `{ channels: Channel[], total: number, page: number, pageSize: number }`
- [x] `q` filters by a case-insensitive substring match on `title`
- [x] `tag` filters to channels whose JSON `tags` array contains the given string
- [x] `category` filters to channels with an exact category match
- [x] All filter/sort params are composable (applying multiple at once works correctly)
- [x] The React `<TopBar>` contains: a search input (debounced, live filter), a sort dropdown (title / subscribed date / video count / subscriber count), a sort direction toggle, a category filter dropdown populated from distinct categories in the DB, a "Sync now" button showing the last-synced timestamp
- [x] The React `<ChannelTable>` renders one row per channel showing: thumbnail, title, category, tags, video count, subscriber count, subscribed date, and a checkbox
- [x] A "select all" checkbox in the table header selects every channel matching the current filter/search (not just the current page)
- [x] Selecting individual checkboxes adds/removes channels from the selection set
- [x] The selection count is shown somewhere visible (e.g. "12 selected")
- [x] HTTP API tests: `GET /api/channels` returns correct results for each filter param; combined filters narrow results correctly; pagination returns correct page/total; unknown sort field returns 400
