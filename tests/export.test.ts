import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createAppServer } from "../src/server";
import { initDatabase, upsertChannels, type ChannelRecord } from "../src/lib/db";
import { encryptCredentials } from "../src/lib/credentials";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("GET /api/export HTTP API Seam", () => {
  let tempDir: string;
  let server: any;
  let db: Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-export-test-"));
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
        title: "Cooking with Chef, Special",
        description: "Delicious recipes & tips\nNew videos weekly",
        thumbnail_url: "http://example.com/cooking.jpg",
        subscribed_at: "2023-01-01T00:00:00Z",
        video_count: 150,
        subscriber_count: 10000,
        category: "Food",
        tags: JSON.stringify(["cooking", "recipes"]),
        last_synced_at: "2026-07-22T10:00:00Z",
      },
      {
        channel_id: "UC2",
        subscription_id: "sub2",
        title: "Gaming Central",
        description: 'Game walkthroughs & "pro" gameplay',
        thumbnail_url: "http://example.com/gaming.jpg",
        subscribed_at: "2023-06-15T00:00:00Z",
        video_count: 50,
        subscriber_count: 50000,
        category: "Gaming",
        tags: JSON.stringify(["gaming", "walkthrough"]),
        last_synced_at: "2026-07-22T10:00:00Z",
      },
      {
        channel_id: "UC3",
        subscription_id: "sub3",
        title: "Tech Reviews",
        description: "Gadget reviews",
        thumbnail_url: "http://example.com/tech.jpg",
        subscribed_at: "2024-02-10T00:00:00Z",
        video_count: 200,
        subscriber_count: 5000,
        category: "Technology",
        tags: JSON.stringify(["tech", "gadgets"]),
        last_synced_at: "2026-07-22T10:00:00Z",
      },
    ];

    upsertChannels(db, testChannels);

    server = createAppServer({
      port: 0,
      appDataDir: tempDir,
      autoOpenBrowser: false,
      db,
    });
  });

  afterEach(() => {
    if (server) server.stop(true);
    if (db) db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns 401 if unauthenticated", async () => {
    const unauthDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-unauth-export-"));
    const unauthServer = createAppServer({
      port: 0,
      appDataDir: unauthDir,
      autoOpenBrowser: false,
    });

    const res = await fetch(`http://127.0.0.1:${unauthServer.port}/api/export?format=csv&scope=all`);
    expect(res.status).toBe(401);
    unauthServer.stop(true);
    fs.rmSync(unauthDir, { recursive: true, force: true });
  });

  test("returns 400 if format is missing or invalid", async () => {
    const resNoFormat = await fetch(`http://127.0.0.1:${server.port}/api/export`);
    expect(resNoFormat.status).toBe(400);

    const resInvalidFormat = await fetch(`http://127.0.0.1:${server.port}/api/export?format=pdf`);
    expect(resInvalidFormat.status).toBe(400);
    const body = await resInvalidFormat.json();
    expect(body.error).toBeDefined();
  });

  test("returns 400 for unknown sortBy field", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/export?format=csv&scope=all&sortBy=invalid_col`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("GET /api/export?format=csv&scope=all returns correct CSV headers and body for all channels", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/export?format=csv&scope=all`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain('attachment; filename="subscriptions.csv"');

    const csvText = await res.text();
    const lines = csvText.trim().split("\n");
    expect(lines[0]).toBe("channel_id,subscription_id,title,description,thumbnail_url,subscribed_at,video_count,subscriber_count,category,tags");
    expect(lines.length).toBeGreaterThanOrEqual(4); // 1 header + 3 channels (note: descriptions with newlines might span lines if split simply by \n, but csvText contains channel records)
    expect(csvText).toContain("UC1");
    expect(csvText).toContain("UC2");
    expect(csvText).toContain("UC3");
    expect(csvText).toContain('"Cooking with Chef, Special"');
    expect(csvText).toContain("cooking, recipes");
  });

  test("GET /api/export?format=json&scope=filtered&q=cooking returns only matching channels as JSON array", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/export?format=json&scope=filtered&q=cooking`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain('attachment; filename="subscriptions.json"');

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].channel_id).toBe("UC1");
    expect(body[0].title).toBe("Cooking with Chef, Special");
    expect(body[0].tags).toEqual(["cooking", "recipes"]);
  });

  test("GET /api/export?format=json&scope=filtered with no filters returns full library", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/export?format=json&scope=filtered`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(3);
  });
});
