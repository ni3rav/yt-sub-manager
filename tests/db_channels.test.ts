import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, upsertChannels, getChannels, getDistinctCategories, getAllMatchingChannelIds, type ChannelRecord } from "../src/lib/db";

describe("SQLite Channels Query Seam", () => {
  let db: Database;

  beforeEach(() => {
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
  });

  afterEach(() => {
    db.close();
  });

  test("filters channels by case-insensitive title search (q)", () => {
    const res = getChannels(db, { q: "tech" });
    expect(res.total).toBe(2);
    expect(res.channels.map((c) => c.title)).toEqual(["Alpha Tech", "Gamma Tech"]);
  });

  test("filters channels by category", () => {
    const res = getChannels(db, { category: "Gaming" });
    expect(res.total).toBe(1);
    expect(res.channels[0].title).toBe("Beta Gaming");
  });

  test("filters channels by exact JSON array element containment", () => {
    // Exact match
    const resCoding = getChannels(db, { tag: "coding" });
    expect(resCoding.total).toBe(2);
    expect(resCoding.channels.map((c) => c.title)).toEqual(["Alpha Tech", "Gamma Tech"]);

    // Partial substring of tag string must NOT match
    const resPartial = getChannels(db, { tag: "code" });
    expect(resPartial.total).toBe(0);
  });

  test("fetches all matching channel IDs for select all", () => {
    const ids = getAllMatchingChannelIds(db, { category: "Technology" });
    expect(ids).toEqual(["UC1", "UC3"]);
  });

  test("sorts channels by specified allowed field and direction", () => {
    const resDesc = getChannels(db, { sortBy: "subscriber_count", sortDir: "desc" });
    expect(resDesc.channels.map((c) => c.title)).toEqual(["Beta Gaming", "Alpha Tech", "Gamma Tech"]);

    const resAsc = getChannels(db, { sortBy: "video_count", sortDir: "asc" });
    expect(resAsc.channels.map((c) => c.title)).toEqual(["Beta Gaming", "Alpha Tech", "Gamma Tech"]);
  });

  test("paginates channels correctly", () => {
    const page1 = getChannels(db, { page: 1, pageSize: 2, sortBy: "title", sortDir: "asc" });
    expect(page1.total).toBe(3);
    expect(page1.channels.length).toBe(2);
    expect(page1.channels.map((c) => c.title)).toEqual(["Alpha Tech", "Beta Gaming"]);

    const page2 = getChannels(db, { page: 2, pageSize: 2, sortBy: "title", sortDir: "asc" });
    expect(page2.channels.length).toBe(1);
    expect(page2.channels[0].title).toBe("Gamma Tech");
  });

  test("throws error for invalid sortBy parameter", () => {
    expect(() => getChannels(db, { sortBy: "invalid_column" as any })).toThrow();
  });

  test("fetches distinct categories", () => {
    const categories = getDistinctCategories(db);
    expect(categories).toEqual(["Gaming", "Technology"]);
  });
});
