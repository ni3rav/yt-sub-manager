import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createAppServer } from "../src/server";
import { initDatabase, upsertChannels, getChannels, type ChannelRecord } from "../src/lib/db";
import { encryptCredentials } from "../src/lib/credentials";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("POST /api/channels/unsubscribe HTTP API Seam", () => {
  let tempDir: string;
  let server: any;
  let db: Database;
  let deleteCalls: string[];
  let mockYoutubeClient: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-unsub-test-"));
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

    const testChannels: ChannelRecord[] = [
      {
        channel_id: "UC1",
        subscription_id: "sub1",
        title: "Alpha Tech",
        description: null,
        thumbnail_url: null,
        subscribed_at: "2023-01-01T00:00:00Z",
        video_count: 150,
        subscriber_count: 10000,
        category: "Technology",
        tags: "[]",
        last_synced_at: "2026-07-22T10:00:00Z",
      },
      {
        channel_id: "UC2",
        subscription_id: "sub2",
        title: "Beta Gaming",
        description: null,
        thumbnail_url: null,
        subscribed_at: "2023-06-15T00:00:00Z",
        video_count: 50,
        subscriber_count: 50000,
        category: "Gaming",
        tags: "[]",
        last_synced_at: "2026-07-22T10:00:00Z",
      },
      {
        channel_id: "UC3",
        subscription_id: "sub3",
        title: "Gamma Tech",
        description: null,
        thumbnail_url: null,
        subscribed_at: "2024-02-10T00:00:00Z",
        video_count: 200,
        subscriber_count: 5000,
        category: "Technology",
        tags: "[]",
        last_synced_at: "2026-07-22T10:00:00Z",
      },
    ];

    upsertChannels(db, testChannels);
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
  });

  afterEach(() => {
    if (server) server.stop(true);
    if (db) db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns 401 if unauthenticated", async () => {
    const unauthDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-unauth-unsub-"));
    const unauthServer = createAppServer({
      port: 0,
      appDataDir: unauthDir,
      autoOpenBrowser: false,
    });

    const res = await fetch(`http://127.0.0.1:${unauthServer.port}/api/channels/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1"] }),
    });
    expect(res.status).toBe(401);
    unauthServer.stop(true);
    fs.rmSync(unauthDir, { recursive: true, force: true });
  });

  test("returns 400 if channelIds is missing or empty", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/channels/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  test("unsubscribes specified channels, deletes rows from DB, and returns succeeded list", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/channels/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1", "UC2"], interCallDelayMs: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toEqual(["UC1", "UC2"]);
    expect(body.failed).toEqual([]);
    expect(body.quotaStopped).toBe(false);

    // Verify YouTube API called with subscription resource IDs sub1, sub2
    expect(deleteCalls).toEqual(["sub1", "sub2"]);

    // Verify channels removed from local SQLite DB
    const dbState = getChannels(db, { page: 1, pageSize: 10 });
    expect(dbState.total).toBe(1);
    expect(dbState.channels[0].channel_id).toBe("UC3");
  });

  test("handles non-quota error on one channel and continues batch", async () => {
    mockYoutubeClient.subscriptions.delete = async (params: { id: string }) => {
      deleteCalls.push(params.id);
      if (params.id === "sub1") {
        throw new Error("Subscription not found (404)");
      }
      return { status: 204 };
    };

    const res = await fetch(`http://127.0.0.1:${server.port}/api/channels/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1", "UC2"], interCallDelayMs: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toEqual(["UC2"]);
    expect(body.failed).toEqual([{ channelId: "UC1", reason: "Subscription not found (404)" }]);
    expect(body.quotaStopped).toBe(false);

    // UC2 deleted from DB, UC1 still in DB (or UC3 also in DB)
    const dbState = getChannels(db, { page: 1, pageSize: 10 });
    expect(dbState.channels.map((c) => c.channel_id)).toEqual(["UC1", "UC3"]);
  });

  test("stops batch on quotaExceeded error, returns quotaStopped: true, and retains unattempted channels", async () => {
    mockYoutubeClient.subscriptions.delete = async (params: { id: string }) => {
      deleteCalls.push(params.id);
      if (params.id === "sub2") {
        const err: any = new Error("The request cannot be completed because you have exceeded your quota.");
        err.name = "QuotaExceededError";
        throw err;
      }
      return { status: 204 };
    };

    const res = await fetch(`http://127.0.0.1:${server.port}/api/channels/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds: ["UC1", "UC2", "UC3"], interCallDelayMs: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toEqual(["UC1"]);
    expect(body.quotaStopped).toBe(true);

    // Assert that delete was called for sub1 and sub2, but NOT sub3
    expect(deleteCalls).toEqual(["sub1", "sub2"]);

    // Assert UC1 deleted from DB, while UC2 and UC3 remain in DB
    const dbState = getChannels(db, { page: 1, pageSize: 10 });
    expect(dbState.channels.map((c) => c.channel_id)).toEqual(["UC2", "UC3"]);
  });
});
