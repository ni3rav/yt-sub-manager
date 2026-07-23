import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, upsertChannels, type ChannelRecord } from "../src/lib/db";
import {
  nextPacificMidnight,
  UnsubscribeQueue,
  type PublicUnsubscribeJob,
} from "../src/lib/unsubscribeQueue";

function channel(id: number): ChannelRecord {
  return {
    channel_id: `UC${id}`,
    subscription_id: `sub${id}`,
    title: `Channel ${id}`,
    description: null,
    thumbnail_url: null,
    subscribed_at: null,
    video_count: null,
    subscriber_count: null,
    category: null,
    tags: "[]",
    last_synced_at: "2026-07-23T00:00:00Z",
  };
}

async function waitFor(
  queue: UnsubscribeQueue,
  id: string,
  predicate: (job: PublicUnsubscribeJob) => boolean = (job) => job.status === "completed"
): Promise<PublicUnsubscribeJob> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const job = queue.get(id);
    if (job && predicate(job)) return job;
    await Bun.sleep(1);
  }
  throw new Error(`Timed out waiting for job ${id}`);
}

describe("durable unsubscribe queue", () => {
  const queues: UnsubscribeQueue[] = [];
  const databases: Database[] = [];

  afterEach(() => {
    for (const queue of queues) queue.stop();
    for (const db of databases) db.close();
    queues.length = 0;
    databases.length = 0;
  });

  function newDb(): Database {
    const db = new Database(":memory:");
    initDatabase(db);
    databases.push(db);
    return db;
  }

  test("a queued job survives worker replacement and resumes from SQLite", async () => {
    const db = newDb();
    upsertChannels(db, [channel(1)]);
    const calls: string[] = [];
    const client = {
      subscriptions: {
        delete: async ({ id }: { id: string }) => {
          calls.push(id);
          return { status: 204 };
        },
      },
    };

    // Enqueue without starting this worker: simulates a process stopping
    // after persisting the request but before doing any YouTube work.
    const firstWorker = new UnsubscribeQueue({
      db,
      getYouTubeClient: () => client,
      defaultInterCallDelayMs: 0,
      defaultRetryBaseDelayMs: 0,
    });
    queues.push(firstWorker);
    const queued = firstWorker.enqueue({ channelIds: ["UC1"] });
    firstWorker.stop();

    const replacementWorker = new UnsubscribeQueue({
      db,
      getYouTubeClient: () => client,
      defaultInterCallDelayMs: 0,
      defaultRetryBaseDelayMs: 0,
    });
    queues.push(replacementWorker);
    replacementWorker.start();

    const completed = await waitFor(replacementWorker, queued.id);
    expect(completed.succeeded).toEqual(["UC1"]);
    expect(calls).toEqual(["sub1"]);
  });

  test("serializes multiple jobs through a single consumer", async () => {
    const db = newDb();
    upsertChannels(db, [channel(1), channel(2), channel(3)]);
    let active = 0;
    let maxActive = 0;
    const client = {
      subscriptions: {
        delete: async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await Bun.sleep(5);
          active--;
          return { status: 204 };
        },
      },
    };
    const queue = new UnsubscribeQueue({
      db,
      getYouTubeClient: () => client,
      defaultInterCallDelayMs: 0,
      defaultRetryBaseDelayMs: 0,
    });
    queues.push(queue);
    queue.start();

    const first = queue.enqueue({ channelIds: ["UC1", "UC2"] });
    const second = queue.enqueue({ channelIds: ["UC3"] });
    await Promise.all([waitFor(queue, first.id), waitFor(queue, second.id)]);

    expect(maxActive).toBe(1);
  });

  test("honors Retry-After before retrying a 429", async () => {
    const db = newDb();
    upsertChannels(db, [channel(1)]);
    let attempts = 0;
    const client = {
      subscriptions: {
        delete: async () => {
          attempts++;
          if (attempts === 1) {
            const err: any = new Error("Too many requests");
            err.code = 429;
            err.response = { headers: { "retry-after": "0" } };
            throw err;
          }
          return { status: 204 };
        },
      },
    };
    const queue = new UnsubscribeQueue({
      db,
      getYouTubeClient: () => client,
      defaultInterCallDelayMs: 0,
      defaultRetryBaseDelayMs: 60_000,
    });
    queues.push(queue);
    queue.start();

    const job = queue.enqueue({ channelIds: ["UC1"] });
    const completed = await waitFor(queue, job.id);
    expect(completed.succeeded).toEqual(["UC1"]);
    expect(attempts).toBe(2);
  });
});

describe("nextPacificMidnight", () => {
  test("uses PDT offset during summer", () => {
    // Jul 23, 2026 12:00 UTC -> Jul 23 05:00 PDT; next midnight is 07:00 UTC.
    expect(nextPacificMidnight(new Date("2026-07-23T12:00:00Z")).toISOString()).toBe(
      "2026-07-24T07:00:00.000Z"
    );
  });

  test("uses PST offset during winter", () => {
    // Jan 10, 2026 12:00 UTC -> Jan 10 04:00 PST; next midnight is 08:00 UTC.
    expect(nextPacificMidnight(new Date("2026-01-10T12:00:00Z")).toISOString()).toBe(
      "2026-01-11T08:00:00.000Z"
    );
  });
});
