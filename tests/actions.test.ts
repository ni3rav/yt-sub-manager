import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createAppServer } from "../src/server";
import { initDatabase, upsertChannels, getChannels, type ChannelRecord } from "../src/lib/db";
import { encryptCredentials } from "../src/lib/credentials";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function readNdjsonDone(res: Response): Promise<any> {
  const text = await res.text();
  const events = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
  const done = events.find((e) => e.type === "done");
  if (!done) throw new Error("No 'done' event in NDJSON stream");
  return done;
}

describe("Actions log & redo", () => {
  let tempDir: string;
  let server: any;
  let db: Database;
  let deleteCalls: string[];
  let mockYoutubeClient: any;
  let baseUrl: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-actions-test-"));
    encryptCredentials(
      {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
      },
      tempDir
    );

    db = new Database(":memory:");
    initDatabase(db);

    const mk = (i: number, extra: Partial<ChannelRecord> = {}): ChannelRecord => ({
      channel_id: `UC${i}`,
      subscription_id: `sub${i}`,
      title: `Channel ${i}`,
      description: null,
      thumbnail_url: null,
      subscribed_at: "2023-01-01T00:00:00Z",
      video_count: 10,
      subscriber_count: 100,
      category: null,
      tags: "[]",
      last_synced_at: "2026-07-22T10:00:00Z",
      ...extra,
    });

    upsertChannels(db, [
      mk(1, { category: "Tech" }),
      mk(2, { category: "Tech" }),
      mk(3, { category: "Gaming" }),
    ]);

    deleteCalls = [];
    mockYoutubeClient = {
      subscriptions: {
        delete: async (params: { id: string }) => {
          deleteCalls.push(params.id);
          return { status: 204 };
        },
      },
    };

    server = createAppServer({
      port: 0,
      appDataDir: tempDir,
      autoOpenBrowser: false,
      db,
      youtubeClient: mockYoutubeClient,
    });
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterEach(() => {
    if (server) server.stop(true);
    if (db) db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("GET /api/categories includes per-category channel counts", async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toEqual(["Gaming", "Tech"]);
    expect(body.stats).toEqual([
      { category: "Gaming", channelCount: 1 },
      { category: "Tech", channelCount: 2 },
    ]);
  });

  test("unsubscribe batches are recorded in the actions log with a title snapshot", async () => {
    await fetch(`${baseUrl}/api/channels/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1", "UC2"], interCallDelayMs: 0 }),
    }).then((r) => r.text());

    const res = await fetch(`${baseUrl}/api/actions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);

    const action = body.actions[0];
    expect(action.type).toBe("unsubscribe");
    expect(action.total).toBe(2);
    expect(action.succeededCount).toBe(2);
    expect(action.failedCount).toBe(0);
    expect(action.quotaStopped).toBe(false);
    expect(action.payload.channelIds).toEqual(["UC1", "UC2"]);
    // Titles survive even though the channels are now deleted locally
    expect(action.payload.titles).toEqual({ UC1: "Channel 1", UC2: "Channel 2" });
  });

  test("tag operations are recorded in the actions log", async () => {
    await fetch(`${baseUrl}/api/channels/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1", "UC3"], category: "Favourites", tags: ["watch-later"] }),
    });

    const res = await fetch(`${baseUrl}/api/actions`);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);

    const action = body.actions[0];
    expect(action.type).toBe("tag");
    expect(action.succeededCount).toBe(2);
    expect(action.payload.category).toBe("Favourites");
    expect(action.payload.tags).toEqual(["watch-later"]);
  });

  test("redoing a partially failed unsubscribe re-attempts only channels still present", async () => {
    // First attempt: UC2 fails with a transient error
    mockYoutubeClient.subscriptions.delete = async (params: { id: string }) => {
      deleteCalls.push(params.id);
      if (params.id === "sub2") throw new Error("Internal backend error (500)");
      return { status: 204 };
    };

    const firstDone = await fetch(`${baseUrl}/api/channels/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1", "UC2"], interCallDelayMs: 0 }),
    }).then(readNdjsonDone);
    expect(firstDone.succeeded).toEqual(["UC1"]);
    expect(firstDone.failed).toHaveLength(1);

    const actionsBody = await fetch(`${baseUrl}/api/actions`).then((r) => r.json());
    const originalAction = actionsBody.actions[0];
    expect(originalAction.succeededCount).toBe(1);

    // The transient error is gone; redo the action
    mockYoutubeClient.subscriptions.delete = async (params: { id: string }) => {
      deleteCalls.push(params.id);
      return { status: 204 };
    };

    const redoRes = await fetch(`${baseUrl}/api/actions/${originalAction.id}/redo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interCallDelayMs: 0 }),
    });
    expect(redoRes.status).toBe(200);
    expect(redoRes.headers.get("Content-Type")).toContain("application/x-ndjson");

    const redoDone = await readNdjsonDone(redoRes);
    // UC1 is already gone locally -> skipped; only UC2 re-attempted
    expect(redoDone.succeeded).toEqual(["UC2"]);
    expect(redoDone.skipped).toEqual(["UC1"]);
    expect(redoDone.failed).toEqual([]);

    // UC2 removed from DB now
    const dbState = getChannels(db, { page: 1, pageSize: 10 });
    expect(dbState.channels.map((c) => c.channel_id)).toEqual(["UC3"]);

    // The redo itself is logged, linked to the original action
    const after = await fetch(`${baseUrl}/api/actions`).then((r) => r.json());
    expect(after.actions).toHaveLength(2);
    expect(after.actions[0].type).toBe("unsubscribe");
    expect(after.actions[0].payload.redoOf).toBe(originalAction.id);
    expect(after.actions[0].succeededCount).toBe(1);
  });

  test("redoing a tag action reapplies category/tags to channels still present", async () => {
    await fetch(`${baseUrl}/api/channels/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1", "UC2"], category: "Favourites" }),
    });

    // Category later changed away
    await fetch(`${baseUrl}/api/channels/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1", "UC2"], category: "Other" }),
    });

    const actionsBody = await fetch(`${baseUrl}/api/actions`).then((r) => r.json());
    const favouritesAction = actionsBody.actions.find((a: any) => a.payload.category === "Favourites");

    const redoRes = await fetch(`${baseUrl}/api/actions/${favouritesAction.id}/redo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(redoRes.status).toBe(200);
    const done = await readNdjsonDone(redoRes);
    expect(done.succeeded).toEqual(["UC1", "UC2"]);
    expect(done.skipped).toEqual([]);

    const dbState = getChannels(db, { page: 1, pageSize: 10 });
    const uc1 = dbState.channels.find((c) => c.channel_id === "UC1");
    expect(uc1?.category).toBe("Favourites");
  });

  test("redo of an unknown action id returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/actions/9999/redo`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
