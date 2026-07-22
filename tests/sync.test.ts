import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createAppServer } from "../src/server";
import { encryptCredentials } from "../src/lib/credentials";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("POST /api/sync HTTP API Seam", () => {
  let tempDir: string;
  let server: any;
  let db: Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-sync-test-"));
    // Encrypt fake credentials so auth succeeds
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
  });

  afterEach(() => {
    if (server) server.stop(true);
    if (db) db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns 401 if unauthenticated", async () => {
    const unauthDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-unauth-test-"));
    const unauthServer = createAppServer({
      port: 0,
      appDataDir: unauthDir,
      autoOpenBrowser: false,
    });

    const res = await fetch(`http://127.0.0.1:${unauthServer.port}/api/sync`, {
      method: "POST",
    });

    expect(res.status).toBe(401);
    unauthServer.stop(true);
    fs.rmSync(unauthDir, { recursive: true, force: true });
  });

  test("syncs multi-page subscriptions into local SQLite database", async () => {
    const mockYoutube = {
      subscriptions: {
        list: async (params: any) => {
          if (params.pageToken === "page2") {
            return {
              data: {
                nextPageToken: undefined,
                items: [
                  {
                    id: "sub_2",
                    snippet: {
                      resourceId: { channelId: "UC_P2" },
                      title: "Channel Page 2",
                      description: "Desc 2",
                      thumbnails: { default: { url: "http://thumb2.jpg" } },
                      publishedAt: "2023-02-01T00:00:00Z",
                    },
                  },
                ],
              },
            };
          }
          return {
            data: {
              nextPageToken: "page2",
              items: [
                {
                  id: "sub_1",
                  snippet: {
                    resourceId: { channelId: "UC_P1" },
                    title: "Channel Page 1",
                    description: "Desc 1",
                    thumbnails: { default: { url: "http://thumb1.jpg" } },
                    publishedAt: "2023-01-01T00:00:00Z",
                  },
                },
              ],
            },
          };
        },
      },
    };

    server = createAppServer({
      port: 0,
      appDataDir: tempDir,
      autoOpenBrowser: false,
      db,
      youtubeClient: mockYoutube,
    });

    // Mock verifyOrRefreshTokens by putting valid token in creds
    const res = await fetch(`http://127.0.0.1:${server.port}/api/sync`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(2);
    expect(body.errors).toEqual([]);
    expect(body.lastSyncedAt).toBeDefined();

    // Verify DB rows
    const rows = db.prepare("SELECT * FROM channels ORDER BY channel_id").all() as any[];
    expect(rows.length).toBe(2);
    expect(rows[0].subscription_id).toBe("sub_1");
    expect(rows[1].subscription_id).toBe("sub_2");

    // Re-sync test to ensure no duplicate rows
    const res2 = await fetch(`http://127.0.0.1:${server.port}/api/sync`, {
      method: "POST",
    });
    const body2 = await res2.json();
    expect(body2.count).toBe(2);

    const rowsAfterResync = db.prepare("SELECT * FROM channels").all();
    expect(rowsAfterResync.length).toBe(2);
  });

  test("handles quotaExceeded mid-pagination and returns structured partial response", async () => {
    const mockYoutube = {
      subscriptions: {
        list: async (params: any) => {
          if (params.pageToken === "page2") {
            const err: any = new Error("Daily quota exceeded");
            err.code = 403;
            err.errors = [{ reason: "quotaExceeded", message: "Daily quota exceeded" }];
            throw err;
          }
          return {
            data: {
              nextPageToken: "page2",
              items: [
                {
                  id: "sub_1",
                  snippet: {
                    resourceId: { channelId: "UC_P1" },
                    title: "Channel Page 1",
                    publishedAt: "2023-01-01T00:00:00Z",
                  },
                },
              ],
            },
          };
        },
      },
    };

    server = createAppServer({
      port: 0,
      appDataDir: tempDir,
      autoOpenBrowser: false,
      db,
      youtubeClient: mockYoutube,
    });

    const res = await fetch(`http://127.0.0.1:${server.port}/api/sync`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.errors.length).toBe(1);
    expect(body.errors[0].reason).toBe("quotaExceeded");

    // Verify DB saved the item before quota exception
    const rows = db.prepare("SELECT * FROM channels").all();
    expect(rows.length).toBe(1);
  });
});
