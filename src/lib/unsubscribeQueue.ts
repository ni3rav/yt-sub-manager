import type { Database } from "bun:sqlite";
import {
  createUnsubscribeJob,
  deleteChannels,
  getChannelTitles,
  getRecentUnsubscribeJobs,
  getRunnableUnsubscribeJob,
  getSubscriptionIds,
  getUnsubscribeJob,
  recordAction,
  saveUnsubscribeJob,
  type UnsubscribeJobRecord,
} from "./db";
import {
  getRetryAfterMs,
  isQuotaExceededError,
  isSubscriptionNotFoundError,
  isTransientYouTubeError,
} from "./youtube";

type ItemStatus = "pending" | "succeeded" | "failed";

interface QueueItem {
  channelId: string;
  subscriptionId: string | null;
  title: string;
  status: ItemStatus;
  attempts: number;
  lastError: string | null;
}

interface JobPayload {
  requestedChannelIds: string[];
  skippedChannelIds: string[];
  titles: Record<string, string>;
  items: QueueItem[];
  redoOf?: number;
  interCallDelayMs: number;
  retryBaseDelayMs: number;
  sawQuotaPause?: boolean;
}

export interface PublicUnsubscribeJob {
  id: string;
  status: UnsubscribeJobRecord["status"];
  total: number;
  processed: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
  waitReason: string | null;
  nextAttemptAt: string | null;
  actionId: number | null;
  createdAt: string;
  updatedAt: string;
  succeeded: string[];
  failed: { channelId: string; reason: string }[];
}

export interface EnqueueUnsubscribeInput {
  channelIds: string[];
  skippedChannelIds?: string[];
  redoOf?: number;
  interCallDelayMs?: number;
  retryBaseDelayMs?: number;
}

export interface UnsubscribeQueueOptions {
  db: Database;
  getYouTubeClient: () => any | null;
  now?: () => Date;
  random?: () => number;
  defaultInterCallDelayMs?: number;
  defaultRetryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
}

/**
 * Durable, single-consumer unsubscribe queue.
 *
 * SQLite is the source of truth. Only one delete runs at a time, queue state
 * is persisted before every wait, and jobs left in `running` state are picked
 * up after process restart. Browser/stream lifetime is irrelevant.
 */
export class UnsubscribeQueue {
  private readonly db: Database;
  private readonly getYouTubeClient: () => any | null;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly defaultInterCallDelayMs: number;
  private readonly defaultRetryBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;
  private stopped = false;

  constructor(options: UnsubscribeQueueOptions) {
    this.db = options.db;
    this.getYouTubeClient = options.getYouTubeClient;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    // Two requests/second is still fast enough to drain the default ~200
    // daily deletes in under two minutes, while avoiding the old 4 req/s burst.
    this.defaultInterCallDelayMs = options.defaultInterCallDelayMs ?? 500;
    this.defaultRetryBaseDelayMs = options.defaultRetryBaseDelayMs ?? 1_000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 64_000;
  }

  start(): void {
    this.stopped = false;
    this.kick(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  enqueue(input: EnqueueUnsubscribeInput): PublicUnsubscribeJob {
    const uniqueIds = [...new Set(input.channelIds)];
    const subscriptions = new Map(
      getSubscriptionIds(this.db, uniqueIds).map((row) => [row.channel_id, row.subscription_id])
    );
    const titles = getChannelTitles(this.db, uniqueIds);

    const payload: JobPayload = {
      requestedChannelIds: uniqueIds,
      skippedChannelIds: input.skippedChannelIds ?? [],
      titles,
      items: uniqueIds.map((channelId) => ({
        channelId,
        subscriptionId: subscriptions.get(channelId) ?? null,
        title: titles[channelId] ?? channelId,
        status: "pending",
        attempts: 0,
        lastError: null,
      })),
      ...(input.redoOf === undefined ? {} : { redoOf: input.redoOf }),
      interCallDelayMs: input.interCallDelayMs ?? this.defaultInterCallDelayMs,
      retryBaseDelayMs: input.retryBaseDelayMs ?? this.defaultRetryBaseDelayMs,
    };

    const job = createUnsubscribeJob(this.db, {
      id: crypto.randomUUID(),
      payload: payload as unknown as Record<string, unknown>,
      total: uniqueIds.length,
    });
    this.kick(0);
    return serializeJob(job);
  }

  get(id: string): PublicUnsubscribeJob | null {
    const job = getUnsubscribeJob(this.db, id);
    return job ? serializeJob(job) : null;
  }

  list(limit = 20): PublicUnsubscribeJob[] {
    return getRecentUnsubscribeJobs(this.db, limit).map(serializeJob);
  }

  private kick(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, Math.max(0, delayMs));
    // Do not keep the binary alive solely for a future retry.
    this.timer.unref?.();
  }

  private async drain(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;
    try {
      const job = getRunnableUnsubscribeJob(this.db, this.now().toISOString());
      if (job) {
        await this.process(job);
      }
    } catch (err) {
      // A background worker must not crash the server. Persisted jobs remain
      // runnable and will be retried on the next kick/start.
      console.error("Unsubscribe queue worker error:", err);
    } finally {
      this.processing = false;
      this.scheduleNext();
    }
  }

  private async process(job: UnsubscribeJobRecord): Promise<void> {
    const payload = parsePayload(job.payload);
    const item = payload.items.find((candidate) => candidate.status === "pending");
    if (!item) {
      this.complete(job, payload);
      return;
    }

    const ytClient = this.getYouTubeClient();
    if (!ytClient) {
      this.wait(job, payload, "authentication", 5 * 60_000);
      return;
    }

    job.status = "running";
    job.wait_reason = null;
    job.next_attempt_at = null;
    job.updated_at = this.now().toISOString();
    saveUnsubscribeJob(this.db, job);

    if (!item.subscriptionId) {
      item.status = "failed";
      item.lastError = "Subscription ID not found";
      this.advance(job, payload);
      return;
    }

    try {
      await ytClient.subscriptions.delete({ id: item.subscriptionId });
      item.status = "succeeded";
      item.lastError = null;
      deleteChannels(this.db, [item.channelId]);
      this.advance(job, payload);
    } catch (err: any) {
      if (isSubscriptionNotFoundError(err)) {
        // Desired state is already true; converge the local DB.
        item.status = "succeeded";
        item.lastError = null;
        deleteChannels(this.db, [item.channelId]);
        this.advance(job, payload);
        return;
      }

      item.attempts++;
      item.lastError = err?.message || "Failed to unsubscribe";

      if (isQuotaExceededError(err)) {
        payload.sawQuotaPause = true;
        const resetAt = nextPacificMidnight(this.now());
        this.wait(job, payload, "daily_quota", resetAt.getTime() - this.now().getTime());
        return;
      }

      if (isTransientYouTubeError(err)) {
        const retryAfterMs = getRetryAfterMs(err, this.now().getTime());
        const exponentialMs = Math.min(
          this.maxRetryDelayMs,
          payload.retryBaseDelayMs * 2 ** Math.min(item.attempts - 1, 6) +
            this.random() * payload.retryBaseDelayMs
        );
        this.wait(job, payload, "rate_limit", retryAfterMs ?? exponentialMs);
        return;
      }

      item.status = "failed";
      this.advance(job, payload);
    }
  }

  private advance(job: UnsubscribeJobRecord, payload: JobPayload): void {
    updateCounts(job, payload);
    job.payload = JSON.stringify(payload);
    job.updated_at = this.now().toISOString();

    const hasPending = payload.items.some((item) => item.status === "pending");
    if (!hasPending) {
      this.complete(job, payload);
      return;
    }

    if (payload.interCallDelayMs > 0) {
      this.wait(job, payload, "pacing", payload.interCallDelayMs);
    } else {
      job.status = "queued";
      job.wait_reason = null;
      job.next_attempt_at = null;
      saveUnsubscribeJob(this.db, job);
      this.kick(0);
    }
  }

  private wait(job: UnsubscribeJobRecord, payload: JobPayload, reason: string, delayMs: number): void {
    updateCounts(job, payload);
    job.status = "waiting";
    job.payload = JSON.stringify(payload);
    job.wait_reason = reason;
    job.next_attempt_at = new Date(this.now().getTime() + Math.max(0, delayMs)).toISOString();
    job.updated_at = this.now().toISOString();
    saveUnsubscribeJob(this.db, job);
  }

  private complete(job: UnsubscribeJobRecord, payload: JobPayload): void {
    updateCounts(job, payload);
    job.status = "completed";
    job.payload = JSON.stringify(payload);
    job.wait_reason = null;
    job.next_attempt_at = null;
    job.updated_at = this.now().toISOString();

    if (job.action_id === null) {
      job.action_id = recordAction(this.db, {
        type: "unsubscribe",
        payload: {
          channelIds: payload.requestedChannelIds,
          titles: payload.titles,
          ...(payload.redoOf === undefined ? {} : { redoOf: payload.redoOf }),
          ...(payload.sawQuotaPause ? { resumedAfterQuotaReset: true } : {}),
        },
        total: job.total,
        succeededCount: job.succeeded_count,
        failedCount: job.failed_count,
        quotaStopped: false,
      });
    }
    saveUnsubscribeJob(this.db, job);
  }

  private scheduleNext(): void {
    if (this.stopped || this.processing) return;
    const jobs = getRecentUnsubscribeJobs(this.db, 100);
    if (jobs.some((job) => job.status === "queued" || job.status === "running")) {
      this.kick(0);
      return;
    }

    const nextAt = jobs
      .filter((job) => job.status === "waiting" && job.next_attempt_at)
      .map((job) => Date.parse(job.next_attempt_at!))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    if (nextAt !== undefined) {
      this.kick(Math.max(0, nextAt - this.now().getTime()));
    }
  }
}

function parsePayload(json: string): JobPayload {
  return JSON.parse(json) as JobPayload;
}

function updateCounts(job: UnsubscribeJobRecord, payload: JobPayload): void {
  job.succeeded_count = payload.items.filter((item) => item.status === "succeeded").length;
  job.failed_count = payload.items.filter((item) => item.status === "failed").length;
  job.processed = job.succeeded_count + job.failed_count;
}

function serializeJob(job: UnsubscribeJobRecord): PublicUnsubscribeJob {
  const payload = parsePayload(job.payload);
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    succeededCount: job.succeeded_count,
    failedCount: job.failed_count,
    skippedCount: payload.skippedChannelIds.length,
    pendingCount: job.total - job.processed,
    waitReason: job.wait_reason,
    nextAttemptAt: job.next_attempt_at,
    actionId: job.action_id,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    succeeded: payload.items.filter((item) => item.status === "succeeded").map((item) => item.channelId),
    failed: payload.items
      .filter((item) => item.status === "failed")
      .map((item) => ({ channelId: item.channelId, reason: item.lastError || "Failed to unsubscribe" })),
  };
}

/**
 * Daily YouTube quota resets at midnight America/Los_Angeles. Convert the
 * next local calendar midnight to UTC without assuming PST vs PDT.
 */
export function nextPacificMidnight(now: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const current = partsToRecord(formatter.formatToParts(now));
  const nextDay = new Date(Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day) + 1));
  const targetUtcAsLocal = Date.UTC(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth(),
    nextDay.getUTCDate(),
    0,
    0,
    0
  );

  // 08:00 UTC is midnight PST and 01:00 PDT. Formatting this nearby instant
  // gives the active Pacific offset on the target date (including DST).
  const probe = new Date(targetUtcAsLocal + 8 * 60 * 60_000);
  const probeParts = partsToRecord(formatter.formatToParts(probe));
  const probeAsLocalUtc = Date.UTC(
    Number(probeParts.year),
    Number(probeParts.month) - 1,
    Number(probeParts.day),
    Number(probeParts.hour),
    Number(probeParts.minute),
    Number(probeParts.second)
  );
  const offsetMs = probeAsLocalUtc - probe.getTime();
  return new Date(targetUtcAsLocal - offsetMs);
}

function partsToRecord(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}
