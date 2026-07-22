import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createAppServer } from "../src/server";
import { initDatabase, upsertChannels, type ChannelRecord } from "../src/lib/db";
import { encryptCredentials } from "../src/lib/credentials";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("GET /api/channels HTTP API Seam", () => {
  let tempDir: string;
  let server: any;
  let db: Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-channels-test-"));
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
        description: "Coding videos",
        thumbnail_url: "http://example.com/alpha.jpg",
        subscribed_at: "2023-01-01T00:00:00Z",
        video_count: 150,
        subscriber_count: 10000,
        category: "Technology",
        tags: JSON.stringify(["coding", "javascript"]),
        last_synced_at: "2026-07-22T10:00:00Z",
      },
      {
        channel_id: "UC2",
        subscription_id: "sub2",
        title: "Beta Gaming",
        description: "Game walkthroughs",
        thumbnail_url: "http://example.com/beta.jpg",
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
        title: "Gamma Tech",
        description: "Gadget reviews",
        thumbnail_url: "http://example.com/gamma.jpg",
        subscribed_at: "2024-02-10T00:00:00Z",
        video_count: 200,
        subscriber_count: 5000,
        category: "Technology",
        tags: JSON.stringify(["gadgets", "coding"]),
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
    const unauthDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-unauth-channels-"));
    const unauthServer = createAppServer({
      port: 0,
      appDataDir: unauthDir,
      autoOpenBrowser: false,
    });

    const res = await fetch(`http://127.0.0.1:${unauthServer.port}/api/channels`);
    expect(res.status).toBe(401);
    unauthServer.stop(true);
    fs.rmSync(unauthDir, { recursive: true, force: true });
  });

  test("returns channels list with total, page, and pageSize", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/channels?page=1&pageSize=10`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.channels.length).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
  });

  test("filters individually by q, category, and tag over HTTP", async () => {
    // Filter q
    const resQ = await fetch(`http://127.0.0.1:${server.port}/api/channels?q=Gamma`);
    const bodyQ = await resQ.json();
    expect(bodyQ.total).toBe(1);
    expect(bodyQ.channels[0].title).toBe("Gamma Tech");

    // Filter category
    const resCat = await fetch(`http://127.0.0.1:${server.port}/api/channels?category=Gaming`);
    const bodyCat = await resCat.json();
    expect(bodyCat.total).toBe(1);
    expect(bodyCat.channels[0].title).toBe("Beta Gaming");

    // Filter tag (exact JSON array containment)
    const resTag = await fetch(`http://127.0.0.1:${server.port}/api/channels?tag=coding`);
    const bodyTag = await resTag.json();
    expect(bodyTag.total).toBe(2);

    const resTagPartial = await fetch(`http://127.0.0.1:${server.port}/api/channels?tag=code`);
    const bodyTagPartial = await resTagPartial.json();
    expect(bodyTagPartial.total).toBe(0);
  });

  test("supports multi-page pagination over HTTP", async () => {
    const resPage1 = await fetch(`http://127.0.0.1:${server.port}/api/channels?page=1&pageSize=2&sortBy=title&sortDir=asc`);
    const body1 = await resPage1.json();
    expect(body1.total).toBe(3);
    expect(body1.channels.length).toBe(2);

    const resPage2 = await fetch(`http://127.0.0.1:${server.port}/api/channels?page=2&pageSize=2&sortBy=title&sortDir=asc`);
    const body2 = await resPage2.json();
    expect(body2.channels.length).toBe(1);
    expect(body2.channels[0].title).toBe("Gamma Tech");
  });

  test("returns channelIds for select-all matching filter when allIdsOnly=true", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/channels?allIdsOnly=true&category=Technology`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.channelIds).toEqual(["UC1", "UC3"]);
  });

  test("returns 400 for unknown sortBy field", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/channels?sortBy=unknown_col`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("returns distinct categories via /api/categories", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/categories`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toEqual(["Gaming", "Technology"]);
  });

  describe("POST /api/channels/tag", () => {
    test("returns 401 if unauthenticated", async () => {
      const unauthDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-unauth-tag-"));
      const unauthServer = createAppServer({
        port: 0,
        appDataDir: unauthDir,
        autoOpenBrowser: false,
      });

      const res = await fetch(`http://127.0.0.1:${unauthServer.port}/api/channels/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ["UC1"], category: "Education" }),
      });
      expect(res.status).toBe(401);
      unauthServer.stop(true);
      fs.rmSync(unauthDir, { recursive: true, force: true });
    });

    test("returns 400 if both category and tags are absent", async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/channels/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ["UC1"] }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();

      const resEmptyTags = await fetch(`http://127.0.0.1:${server.port}/api/channels/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ["UC1"], tags: ["", "   "] }),
      });
      expect(resEmptyTags.status).toBe(400);
    });

    test("returns 400 if channelIds is missing or invalid", async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/channels/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "Education" }),
      });
      expect(res.status).toBe(400);
    });

    test("bulk updates category across specified channels over HTTP", async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/channels/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ["UC1", "UC3"], category: "Dev" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.updatedCount).toBe(2);

      const resGet = await fetch(`http://127.0.0.1:${server.port}/api/channels?category=Dev`);
      const getBody = await resGet.json();
      expect(getBody.total).toBe(2);
      expect(getBody.channels.map((c: any) => c.title)).toEqual(["Alpha Tech", "Gamma Tech"]);
    });

    test("bulk merges tags without duplicating existing ones over HTTP", async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/channels/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ["UC1"], tags: ["coding", "react"] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.updatedCount).toBe(1);

      const resGet = await fetch(`http://127.0.0.1:${server.port}/api/channels?q=Alpha`);
      const getBody = await resGet.json();
      const channel = getBody.channels[0];
      expect(JSON.parse(channel.tags)).toEqual(["coding", "javascript", "react"]);
    });
  });
});

