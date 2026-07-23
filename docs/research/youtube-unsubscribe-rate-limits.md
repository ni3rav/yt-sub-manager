# YouTube Data API v3: bulk unsubscribe and rate limits

Research date: 2026-07-23. Sources are limited to official Google/YouTube documentation and the official YouTube API discovery document.

## Executive summary

- `subscriptions.delete` costs **50 quota units per call** and deletes exactly one subscription ID. Success is HTTP `204 No Content`.
- There is **no subscription-specific bulk-delete method** such as `subscriptions.batchDelete`. The current discovery document does, however, advertise the generic Google REST batch path (`batch`), so multiple singular delete calls can be carried as multipart subrequests in one outer HTTP request.
- Batching should be treated only as connection-overhead reduction. Google documents its batch model as processing the enclosed calls separately, and YouTube documents the cost per `subscriptions.delete` call. YouTube publishes no batching discount or rate-limit exemption. The resulting `50 × number of delete subrequests` cost is a well-supported inference, not an explicit YouTube batching statement.
- The public YouTube documentation gives a default project allocation of **10,000 units/day** for endpoints including `subscriptions.delete`, resetting at midnight Pacific Time. It does **not publish numeric requests-per-second/minute, per-user, concurrent, or project burst thresholds** for subscription deletion. Its global error catalog nevertheless documents rate, per-user-rate, serving-rate, and concurrent-limit errors, so daily quota must not be mistaken for the only enforced limit.
- With a default, otherwise-unused 10,000-unit allocation, 200 delete calls consume the whole day. A preceding `subscriptions.list` call costs 1 unit, so a tool that first inventories subscriptions cannot complete 200 deletes within that same untouched default allocation. Three hundred deletes cost 15,000 units; 500 cost 25,000.
- For a desktop tool, use an explicitly user-confirmed, durable queue, one or very few workers, adaptive pacing, bounded retries with jitter, and a project-wide pause on rate-limit responses. Stop and wait for quota reset on daily-quota exhaustion. Generic HTTP batching is not the preferred mechanism for reliability because a large batch can present a burst of independently processed operations.

## Documented facts

### Method, cost, and capacity

The [`subscriptions.delete` reference](https://developers.google.com/youtube/v3/docs/subscriptions/delete) documents:

- HTTP request: `DELETE https://www.googleapis.com/youtube/v3/subscriptions`
- required scalar query parameter: `id`, the YouTube subscription ID
- no request body
- success: HTTP `204 No Content`
- quota cost: **50 units**
- method-specific failures:
  - HTTP `403`, reason `subscriptionForbidden`
  - HTTP `404`, reason `subscriptionNotFound`

The independent [quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost) also lists `subscriptions.delete` at 50 units and `subscriptions.list` at 1 unit. It says all requests, including invalid requests, cost at least one unit. It documents a default allocation of 10,000 units/day combined for endpoints other than the newer separate `search.list` and `videos.insert` buckets, and says the daily quota resets at midnight Pacific Time.

| Delete count | Delete quota alone |
| ---: | ---: |
| 100 | 5,000 units |
| 200 | 10,000 units |
| 300 | 15,000 units |
| 500 | 25,000 units |

The 10,000-unit allocation is a default, not a universal promise. The [quota overview](https://developers.google.com/youtube/v3/getting-started#quota) directs developers to the API Console for the quota available to their project, and the [quota/audit guide](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits) explains the audit and extension process.

### Bulk deletion and HTTP batching

There are two different meanings of “batch”:

1. **A bulk API method:** none exists for subscription deletion. The [YouTube API reference](https://developers.google.com/youtube/v3/docs) exposes only `subscriptions.list`, `subscriptions.insert`, and singular `subscriptions.delete`. The delete method accepts one required `id`; it does not accept a repeated or comma-delimited list. The official [subscription implementation guide](https://developers.google.com/youtube/v3/guides/implementation/subscriptions#delete_a_subscription) likewise describes retrieving subscription IDs and deleting one by one.
2. **Generic HTTP request batching:** currently advertised. The official [YouTube v3 discovery document](https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest) (revision `20260722` when researched) specifies `rootUrl: https://youtube.googleapis.com/` and `batchPath: batch`, while defining `youtube.subscriptions.delete` as a singular DELETE. Thus generated Google clients can envelope separate delete calls at the service batch path. Official Google client documentation describes batching as putting multiple API calls into one HTTP request and invoking a callback for each individual result; see the [Google API Python client batch guide](https://googleapis.github.io/google-api-python-client/docs/batch.html) and [.NET batch guide](https://developers.google.com/api-client-library/dotnet/guide/batch).

The generic client guides document a maximum of 1,000 calls in one batch, but that is a transport ceiling, not a recommended YouTube delete batch size.

### Does batching change quota or rate limits?

**Direct YouTube fact:** each call to `subscriptions.delete` costs 50 units. The discovery document models each part as that same method. YouTube does not document a quota discount, aggregation rule, or rate-limit exemption for batched deletes.

**Google batch model:** official Google API batch documentation explains that batching reduces HTTP connection overhead and that the server separates the outer request into individual operations. For an explicit statement of the accounting model, see Google’s [batching requests documentation](https://cloud.google.com/compute/docs/api/how-tos/batch): a set of `n` enclosed requests counts as `n` requests, not one.

**Inference for YouTube:** `n` batched subscription deletes should be budgeted as `50n` YouTube units and as `n` operations for rate enforcement. Batching should not be used to evade pacing. This combines YouTube's per-call cost and discovery metadata with Google's documented batch semantics; YouTube does not publish a separate sentence confirming the formula for its batch endpoint.

### Published daily quota versus unpublished rate thresholds

The published numeric limit relevant here is the project's daily unit allocation. No official public YouTube page found in this research states a numeric:

- requests-per-second or requests-per-minute limit for `subscriptions.delete`;
- per-user request rate;
- project burst rate; or
- concurrent-request limit.

This does **not** establish that those limits do not exist. The official [Google APIs global errors catalog hosted in the YouTube docs](https://developers.google.com/youtube/v3/docs/core_errors) defines:

- `concurrentLimitExceeded`: a concurrent usage limit was reached;
- `rateLimitExceeded`: too many requests in a time span;
- `servingLimitExceeded`: the API's overall rate limit was reached; and
- `userRateLimitExceeded`: a per-user rate limit was reached.

Project-specific quota and usage should therefore be read from the Google Cloud Console rather than hard-coded from anecdotes. The discovery document also exposes `quotaUser` for server-side applications, but that is not a way for a single-user desktop application to multiply or bypass quota.

## Exact documented error mapping

The JSON `reason` is more useful than HTTP status alone because several materially different conditions use HTTP 403.

| Condition | HTTP status | Documented `reason` / error detail | What the source actually says |
| --- | ---: | --- | --- |
| YouTube quota exceeded | 403 | `quotaExceeded` | The [YouTube Data API errors page](https://developers.google.com/youtube/v3/docs/errors#core-api-errors) says the request cannot be completed because quota was exceeded. |
| Explicit global daily limit | 403 | `dailyLimitExceeded` | The [global errors catalog](https://developers.google.com/youtube/v3/docs/core_errors#FORBIDDEN) says a daily API quota was reached. It also lists `dailyLimitExceededUnreg` for unauthenticated use. YouTube's service-specific general table names `quotaExceeded`, so clients should recognize both rather than assume the service will always emit `dailyLimitExceeded`. |
| General rate limit | 403 | `rateLimitExceeded` | Too many requests in a given time span. The same catalog also lists `rateLimitExceededUnreg` and `servingLimitExceeded` under 403. |
| General rate limit | 429 | `rateLimitExceeded` | Too many requests in a given time span. |
| Per-user rate limit | 403 | `userRateLimitExceeded` | A per-user rate limit was reached. The catalog also lists `userRateLimitExceededUnreg` when the client developer was not identified. |
| Concurrent limit | 403 | `concurrentLimitExceeded` | A concurrent usage limit was reached. |
| Internal server failure | 500 | `internalError` | The request failed due to an internal error. |
| Backend unavailable | 503 | `backendError` | A backend error occurred. |
| Backend connection/readiness | 503 | `backendNotConnected`, `notReady` | Backend connection failed, or the API server is not ready. |

The global catalog maps `backendError` to 503 for this documentation set. Other Google APIs sometimes show `backendError` with 500, so production classification should use both the HTTP status and reason rather than assuming the reason has one universal status across every Google API.

For this particular method, `subscriptionNotFound` (404) and `subscriptionForbidden` (403) are terminal method-specific errors, not rate errors.

## Official retry and backoff guidance

There is no `subscriptions.delete`-specific retry algorithm in its method reference.

The closest YouTube-specific retry material is operation-specific:

- The [YouTube resumable upload protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol#step_4_-_complete_the_upload_process) directs clients to use exponential backoff after 500, 502, 503, and 504 responses.
- The same guide says that if an upload-status response includes `Retry-After`, its value determines when to resume. This is an explicit YouTube instruction, but it is written for resumable uploads; the subscription-delete docs do not promise that `Retry-After` is returned.
- The official [YouTube upload sample](https://developers.google.com/youtube/v3/guides/uploading_a_video) illustrates bounded randomized exponential backoff: up to 10 retries, sleeping a random duration from zero to `2^retry` seconds for transport failures and HTTP 500/502/503/504. Again, this is an example for uploads, not a normative delete policy.

Broader official Google guidance is consistent on two points:

- Google's [retry strategy documentation](https://cloud.google.com/storage/docs/retry-strategy) says direct REST callers should implement exponential backoff, generally with jitter, for transient responses, and must consider whether the operation is idempotent. That page identifies 408, 429, 5xx, socket timeouts, and disconnects as transient in its API context.
- [AIP-194](https://google.aip.dev/194) cautions that `RESOURCE_EXHAUSTED` can mean quota is exhausted for hours and therefore generally should not be blindly auto-retried. It recommends transparent automatic retries only where repetition cannot cause unintended state changes.

### Retry conclusions and caveats

**Documented:**

- Transient backend failures are candidates for exponential backoff.
- YouTube explicitly says to honor `Retry-After` when it appears in resumable-upload responses.
- Retry policy must account for operation idempotency.

**Recommendation/inference for subscription deletion:**

- Honor a valid `Retry-After` header if any delete or batch subresponse supplies one; otherwise use capped exponential backoff with random jitter.
- Retry 429 and 403 rate reasons (`rateLimitExceeded`, `userRateLimitExceeded`, `servingLimitExceeded`, and concurrent-limit equivalents) after a queue-wide pause, not immediately and independently.
- Do **not** repeatedly retry `quotaExceeded` or `dailyLimitExceeded`. Pause until the known daily reset, or until a project quota change is confirmed.
- Retry 500/502/503/504 and connection failures with bounded backoff. Although the global YouTube catalog explicitly names 500 and 503 variants, the YouTube upload guidance treats all four statuses as transient.
- A delete targets a stable subscription ID and the desired end state is “subscription absent,” so retrying after an ambiguous network result is operationally idempotent. If the first request succeeded but its response was lost, a retry can return `subscriptionNotFound`; treat that as the desired state already being reached, while recording it distinctly for audit/debugging.
- Retry only failed/unknown subrequests from a batch. Never replay successful parts.

## Recommended desktop architecture

This section is design advice inferred from the documented behavior, not a statement of an official YouTube-prescribed architecture.

1. **Require specific user intent.**
   - Show the exact selected channels and delete count, make the action unmistakably a YouTube unsubscribe operation, and require final confirmation before enqueuing.
   - This supports the [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies): actions involving subscriptions must be clearly identifiable as YouTube actions and clearly initiated by the user; automation or triggering of actions requires prior specific and express consent.

2. **Inventory once, then persist work locally.**
   - Page through `subscriptions.list?mine=true`, retaining each subscription resource's `id`.
   - Store a durable job record per ID with states such as `pending`, `in_flight`, `succeeded`, `already_absent`, `retry_at`, `permanent_failure`, and `paused_quota`.
   - Persist attempt count, last HTTP status/reason, and next eligible attempt time so app restarts do not duplicate an uncontrolled burst.

3. **Budget quota before starting.**
   - Calculate `50 × pending deletes`, add inventory/list and other API usage, compare with the project's actual Cloud Console quota, and display whether the job can finish today.
   - Reserve headroom for normal application traffic and uncertain retries. Split jobs across Pacific-Time quota windows when required, or obtain an audited quota extension.
   - Never rotate projects, credentials, or `quotaUser` values to evade limits.

4. **Use a paced queue, not unbounded parallelism.**
   - Begin with one outstanding delete and a modest inter-request delay. Since YouTube publishes no safe numeric request rate, any concrete interval is an application tuning choice, not an API guarantee.
   - Add concurrency only if measurements show it is needed and no rate/concurrent-limit responses occur. On any such response, collapse to one worker and pause the entire queue.
   - A token-bucket or leaky-bucket scheduler plus a global “not before” timestamp makes pacing and server-directed pauses explicit.

5. **Prefer individual requests for reliability.**
   - For only hundreds of small deletes, sequential or very-low-concurrency HTTP keep-alive requests are simple to checkpoint, retry, cancel, and explain to the user.
   - If generic HTTP batching is used, keep batches deliberately small, inspect every part, persist each result, and delay between batches. Do not send a 1,000-operation batch merely because the client library allows it.

6. **Classify before retrying.**
   - `204`: success.
   - `404 subscriptionNotFound`: terminal desired state (`already_absent`).
   - authentication/authorization and `subscriptionForbidden`: stop that item or the job and ask for corrective user action; do not back off forever.
   - daily quota reasons: pause until reset and show the user why.
   - rate/concurrency reasons: global pause; honor `Retry-After` when present, otherwise capped exponential backoff with jitter.
   - backend/network transient errors: bounded exponential backoff with jitter.
   - after a retry/deadline cap, leave the item resumable instead of spinning indefinitely.

7. **Make progress and cancellation honest.**
   - Report completed, already absent, failed, pending, estimated quota remaining, and next resume time separately.
   - Cancellation should stop dispatching new requests; in-flight requests may already have taken effect.
   - Reconcile unknown outcomes by retrying the same ID or refreshing the subscription list, not by assuming either success or failure.

## Bottom line

A reliable bulk-unsubscribe tool should plan for one 50-unit API operation per subscription even if it uses HTTP batching. The default quota permits no more than 200 deletes in a completely otherwise-idle quota day, and practical inventory/headroom reduces that. Because YouTube publishes error categories but no numeric burst threshold, a durable, low-concurrency, adaptively backed-off queue is safer than a large batch or a parallel fan-out.

