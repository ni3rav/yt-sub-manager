# 06 — Bulk unsubscribe with quota handling

**What to build:** The ability to unsubscribe from multiple channels at once, safely. The user selects channels, clicks "Unsubscribe selected", and sees a confirmation modal listing the exact channel names and count before anything is sent to YouTube. After confirming, the backend calls `subscriptions.delete` for each channel one at a time with a 250 ms delay between calls, using the stored `subscription_id` (not the channel ID — YouTube's delete endpoint requires the subscription resource ID). A live progress counter updates as each call completes. If a `quotaExceeded` error is received, the operation stops immediately, partial results are returned, and a banner explains how many succeeded, how many remain, and that the user can retry the next day. Successfully unsubscribed channels are removed from the local database immediately.

**Blocked by:** 04 — channels list API + dashboard table (selection state, `subscription_id` in DB, and bulk action bar shell must exist).

**Status:** resolved

- [x] `POST /api/channels/unsubscribe` accepts `{ channelIds: string[] }`, looks up the `subscription_id` for each, calls `youtube.subscriptions.delete` once per channel with a 250 ms inter-call delay
- [x] The response shape is `{ succeeded: string[], failed: { channelId: string, reason: string }[], quotaStopped: boolean }`
- [x] Successfully deleted channels are removed from the `channels` table before the response is returned
- [x] When a `quotaExceeded` error is received mid-batch, the operation stops, remaining channels are not attempted, and `quotaStopped: true` is returned along with the partial succeeded/failed lists
- [x] Non-quota errors on a single channel (e.g. already unsubscribed) are recorded in `failed` and the batch continues
- [x] The UI shows an "Unsubscribe selected" button in the bulk action bar when at least one channel is selected
- [x] Clicking the button opens a confirmation modal listing the exact channel names and count with a "This cannot be undone" warning
- [x] The modal has a Cancel button (closes without action) and a Confirm button (fires the request)
- [x] During the operation a live progress counter is shown (e.g. "Unsubscribed 12 of 30")
- [x] On completion, the table refreshes to remove succeeded channels from the visible list without a full page reload
- [x] When `quotaStopped` is true, a non-dismissable banner explains how many succeeded, how many were not processed, and that the daily quota (~200 deletes/day) has been reached
- [x] When all channels succeed, the selection is cleared and a success message is shown
- [x] HTTP API tests: unsubscribe with stubbed YouTube client removes rows from DB; quota-exceeded mid-batch returns correct partial response with `quotaStopped: true`; non-quota error on one channel is recorded in `failed` and others proceed
