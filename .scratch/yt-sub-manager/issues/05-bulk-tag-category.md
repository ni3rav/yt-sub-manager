# 05 — Bulk tag/category

**What to build:** The ability to organise subscriptions in bulk. When the user has selected one or more channels, a bulk action bar appears. From it they can set a category (chosen from existing categories or typed free-form to create a new one) and add tags — applied to every selected channel in one action. Changes are reflected immediately in the table without a full re-sync.

**Blocked by:** 04 — channels list API + dashboard table (selection state and bulk action bar shell must exist).

**Status:** resolved

- [x] `POST /api/channels/tag` accepts `{ channelIds: string[], category?: string, tags?: string[] }` and updates the corresponding rows in the database
- [x] When `category` is provided, it overwrites the existing category on each affected channel
- [x] When `tags` is provided, the given tags are merged into (not replaced) the existing tags array on each affected channel
- [x] At least one of `category` or `tags` must be present; the endpoint returns 400 if both are absent
- [x] The response indicates how many rows were updated
- [x] The bulk action bar appears in the UI whenever at least one channel is selected and disappears when the selection is cleared
- [x] The bulk action bar contains a category field: a dropdown of existing categories plus a free-text input to create a new one
- [x] The bulk action bar contains a tags field: a multi-value text input where the user can type and add multiple tags
- [x] Submitting the bulk tag/category action calls `POST /api/channels/tag` and, on success, refreshes the affected rows in the table (or re-fetches the current page) without losing the current filter/sort/search state
- [x] The selection is cleared after a successful bulk tag/category action
- [x] HTTP API tests: bulk category update sets category on all specified channels; bulk tag merge appends tags without duplicating existing ones; missing both fields returns 400
