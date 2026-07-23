# YouTube Data API v3 `subscriptions.delete`: quota and retry research

Research date: 2026-07-23. Sources are limited to first-party Google/YouTube documentation, Google's live Discovery document, and the IETF HTTP specification.

## Executive findings

- One `subscriptions.delete` call costs **50 quota units**. A successful call returns HTTP `204`; the method accepts exactly one required subscription `id`.
- The method-specific reference only lists `subscriptionForbidden` (`403`) and `subscriptionNotFound` (`404`). Quota/rate/backend failures are documented separately as Google API global errors.
- The relevant global mappings are:
  - `quotaExceeded` → HTTP `403`
  - `rateLimitExceeded` → HTTP `403` **or** HTTP `429`
  - `userRateLimitExceeded` → HTTP `403`
  - `backendError` → HTTP `503`, not `500`
  - HTTP `500` uses reason `internalError`
- YouTube does **not** document a `Retry-After` guarantee for `subscriptions.delete`, quota errors, or the global `403`/`429`/`503` errors. It documents honoring `Retry-After` only in its resumable-upload protocol. HTTP itself permits, but does not require, `Retry-After` on `429`.
- There is no YouTube `subscriptions.batchDelete` or multi-ID delete method. The live YouTube Discovery document does advertise a generic REST `batchPath` (`batch`), so multiple independent one-ID DELETE subrequests can potentially be transported in one multipart batch. That is transport batching, not a single atomic bulk-delete operation.
- Daily YouTube quota resets at **midnight Pacific Time (PT)**. Because the documentation says PT rather than a fixed UTC offset, the corresponding UTC time changes with Pacific daylight-saving time.

## Quota cost and daily reset

The `subscriptions.delete` method reference and quota table both assign **50 units per call**:

- <https://developers.google.com/youtube/v3/docs/subscriptions/delete>
- <https://developers.google.com/youtube/v3/determine_quota_cost>

The quota table also states:

- all API requests, including invalid requests, incur at least one quota point;
- the default shared daily allocation for endpoints other than the separately bucketed methods is 10,000 units; and
- daily quotas reset at **midnight Pacific Time (PT)**.

Source: <https://developers.google.com/youtube/v3/determine_quota_cost>

Operationally, a daily `quotaExceeded` should not be hot-retried: the documented condition will not change until quota becomes available (normally the daily reset) or the project's allocation is changed.

## Documented errors and status codes

| HTTP status | Error reason | Official meaning | Retry implication |
|---|---|---|---|
| `403 Forbidden` | `quotaExceeded` | The operation requires more resources than the quota allows. The YouTube error index similarly says the request cannot complete because quota was exceeded. | Do not repeatedly retry a depleted daily quota. Wait for quota availability/reset or obtain more quota. |
| `403 Forbidden` | `rateLimitExceeded` | Too many requests were sent within a given time span. | A time-based limit may recover; retry only with pacing/backoff. YouTube publishes no exact recovery interval for this method. |
| `403 Forbidden` | `userRateLimitExceeded` | A per-user rate limit was reached. | Reduce per-user concurrency/rate and use bounded backoff; changing only project-wide throughput may not resolve it. |
| `429 Too Many Requests` | `rateLimitExceeded` | Too many requests were sent within a given time span. | Treat as time-based throttling, but note Google's general automatic-retry standard classifies resource exhaustion as generally non-retryable unless it represents a short-lived condition. |
| `503 Service Unavailable` | `backendError` | A backend error occurred. | This is the clearest transient case for bounded exponential-backoff retry. |
| `500 Internal Server Error` | `internalError` | The request failed due to an internal error. | `backendError` is not the documented reason for `500`. YouTube's upload guidance retries `500`, but no equivalent `subscriptions.delete` policy is published. |

Primary error sources:

- Google APIs global errors in the YouTube documentation (the status-to-reason mappings above): <https://developers.google.com/youtube/v3/docs/core_errors>
- YouTube Data API error index (`quotaExceeded (403)` and method-specific errors): <https://developers.google.com/youtube/v3/docs/errors>

The endpoint-specific page itself lists only:

- `403 subscriptionForbidden`: not properly authenticated or unsupported for the channel; and
- `404 subscriptionNotFound`: the specified subscription cannot be found.

Source: <https://developers.google.com/youtube/v3/docs/subscriptions/delete>

Thus the global errors are relevant API-wide documentation, but they are not repeated as an endpoint-specific exhaustive promise.

## Retry and exponential-backoff guidance

### What is authoritative for this method

No first-party YouTube page publishes a retry schedule, attempt limit, maximum delay, or jitter formula specifically for `subscriptions.delete`.

Google's API design guidance says automatic retries should be limited to unary, non-transactional operations whose repetition causes no unintended state change. It identifies `UNAVAILABLE` as retryable, while `RESOURCE_EXHAUSTED` is generally not automatically retryable because it can mean quota is exhausted for hours; it can be retryable when the resource shortage is known to be short-lived.

Sources:

- <https://google.aip.dev/194>
- <https://google.aip.dev/client-libraries/4221>

For deletion, repeating the operation has the same intended final state, but a retry after an unobserved successful deletion can return the documented `404 subscriptionNotFound`. A caller should therefore treat that outcome according to its own desired-state semantics rather than assume every retry returns `204`.

### Backoff shape, maximum delay, and jitter

There is **no YouTube-specific recommended cap** for subscription deletion. Google's first-party time-based quota guidance for another Google API gives the reusable truncated-exponential pattern:

```text
delay = min(2^n seconds + random jitter, maximum_backoff)
```

- start with approximately 1, 2, 4, ... seconds;
- recalculate jitter on every retry;
- use random jitter of up to **1,000 ms**;
- typical `maximum_backoff` values are **32 or 64 seconds**; and
- impose a maximum retry count/deadline rather than retry forever.

Source: <https://developers.google.com/workspace/drive/api/guides/limits>

Those numbers are official Google guidance, but they are not a YouTube service contract. Google's general client-library guidance also requires retry configuration to be controllable and says a generated library should not invent defaults when no service retry configuration is supplied: <https://google.aip.dev/client-libraries/4221>.

For comparison, YouTube's own resumable-upload sample retries `500`, `502`, `503`, and `504`, allows at most 10 retries, and uses full jitter:

```text
sleep_seconds = random() * 2^retry
```

That sample has no separately specified delay cap (its tenth retry samples below 1,024 seconds), and it is upload-specific—not documented policy for DELETE requests.

Sources:

- <https://developers.google.com/youtube/v3/guides/uploading_a_video>
- <https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol>

### Practical classification from the official material

- `quotaExceeded (403)`: wait for quota availability/reset; ordinary short backoff does not solve daily exhaustion.
- `rateLimitExceeded (403 or 429)` / `userRateLimitExceeded (403)`: pace requests and use bounded, jittered backoff only as application-level handling of a short-lived limit.
- `backendError (503)`: retry with bounded exponential backoff and jitter.
- `500 internalError`: YouTube treats `500` as retryable in upload guidance, but does not explicitly extend that rule to `subscriptions.delete`.
- Do not retry authorization failures or malformed requests without changing the request.

## `Retry-After`

No `Retry-After` behavior is documented on the `subscriptions.delete` page or the YouTube global-error page:

- <https://developers.google.com/youtube/v3/docs/subscriptions/delete>
- <https://developers.google.com/youtube/v3/docs/core_errors>

YouTube does document `Retry-After` for a different operation: if a resumable-upload status response includes the header, the client should use its value to decide when to resume. This proves that the header is used/documented in a narrow YouTube protocol, not that it will be emitted for subscription deletion:

- <https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol>

At the HTTP level, a `429` response **may** include `Retry-After`; it is optional. Therefore a client may honor a valid header if one is actually received, but must not rely on YouTube sending it for `subscriptions.delete`.

Source: IETF RFC 6585 §4, <https://www.rfc-editor.org/rfc/rfc6585#section-4>

## Batch deletion

There is no dedicated batch-delete method:

- the subscription resource exposes only `list`, `insert`, and `delete`;
- `subscriptions.delete` takes one required string `id`, not a repeated or comma-separated list.

Sources:

- <https://developers.google.com/youtube/v3/docs/subscriptions>
- <https://developers.google.com/youtube/v3/docs/subscriptions/delete>
- Live YouTube v3 Discovery document: <https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest>

The same live Discovery document declares `"batchPath": "batch"`. Google's Discovery reference defines `batchPath` as “the path for REST batch requests”:

- <https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest>
- <https://developers.google.com/discovery/v1/reference/apis>

Consequently, generic multipart batching is advertised at the transport level, but each part remains an independent `subscriptions.delete?id=...` call with its own result. It should not be described as an atomic `batchDelete`, and the YouTube documentation provides no claim that transport batching reduces the 50-unit per-call quota charge.
