import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, upsertChannels, getChannelsStats, type ChannelRecord } from "../src/lib/db";

describe("SQLite Database Seam", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  test("initializes channels table and indexes", () => {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='channels'").get();
    expect(tableCheck).toBeDefined();

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_channels_title");
    expect(indexNames).toContain("idx_channels_subscribed");
    expect(indexNames).toContain("idx_channels_category");
  });

  test("upserts channels and updates last_synced_at without duplicating rows", () => {
    const channel1: ChannelRecord = {
      channel_id: "UC123",
      subscription_id: "sub_1",
      title: "Tech Channel",
      description: "Tech videos",
      thumbnail_url: "https://example.com/thumb.jpg",
      subscribed_at: "2023-01-01T00:00:00Z",
      video_count: 100,
      subscriber_count: 5000,
      category: null,
      tags: "[]",
      last_synced_at: "2026-07-22T10:00:00Z",
    };

    upsertChannels(db, [channel1]);
    let stats = getChannelsStats(db);
    expect(stats.totalCount).toBe(1);
    expect(stats.lastSyncedAt).toBe("2026-07-22T10:00:00Z");

    // Re-sync same channel with updated info
    const updatedChannel1: ChannelRecord = {
      ...channel1,
      title: "Tech Channel Updated",
      last_synced_at: "2026-07-22T12:00:00Z",
    };

    upsertChannels(db, [updatedChannel1]);
    stats = getChannelsStats(db);
    expect(stats.totalCount).toBe(1);
    expect(stats.lastSyncedAt).toBe("2026-07-22T12:00:00Z");

    const row = db.prepare("SELECT * FROM channels WHERE channel_id = ?").get("UC123") as any;
    expect(row.title).toBe("Tech Channel Updated");
    expect(row.subscription_id).toBe("sub_1");
  });
});
