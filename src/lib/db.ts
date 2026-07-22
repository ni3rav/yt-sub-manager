import { Database } from "bun:sqlite";
import path from "node:path";
import { getAppDataDir, ensureAppDataDir } from "./paths";

export interface ChannelRecord {
  channel_id: string;
  subscription_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  subscribed_at: string | null;
  video_count: number | null;
  subscriber_count: number | null;
  category: string | null;
  tags: string; // JSON string e.g. "[]"
  last_synced_at: string;
}

let activeDbInstance: Database | null = null;

export function getDatabasePath(customDir?: string): string {
  return path.join(getAppDataDir(customDir), "db.sqlite");
}

export function initDatabase(dbInstanceOrDir?: Database | string): Database {
  if (typeof dbInstanceOrDir === "object" && dbInstanceOrDir !== null) {
    createSchema(dbInstanceOrDir);
    return dbInstanceOrDir;
  }

  const appDataDir = ensureAppDataDir(dbInstanceOrDir as string | undefined);
  const dbPath = path.join(appDataDir, "db.sqlite");

  if (!activeDbInstance || activeDbInstance.filename !== dbPath) {
    activeDbInstance = new Database(dbPath, { create: true });
    createSchema(activeDbInstance);
  }

  return activeDbInstance;
}

function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      channel_id       TEXT PRIMARY KEY,
      subscription_id  TEXT NOT NULL,
      title            TEXT NOT NULL,
      description      TEXT,
      thumbnail_url    TEXT,
      subscribed_at    TEXT,
      video_count      INTEGER,
      subscriber_count INTEGER,
      category         TEXT,
      tags             TEXT DEFAULT '[]',
      last_synced_at   TEXT
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_channels_title ON channels (title);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_channels_subscribed ON channels (subscribed_at);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_channels_category ON channels (category);`);
}

export function upsertChannels(db: Database, channels: ChannelRecord[]): void {
  const statement = db.prepare(`
    INSERT INTO channels (
      channel_id,
      subscription_id,
      title,
      description,
      thumbnail_url,
      subscribed_at,
      video_count,
      subscriber_count,
      category,
      tags,
      last_synced_at
    ) VALUES (
      $channel_id,
      $subscription_id,
      $title,
      $description,
      $thumbnail_url,
      $subscribed_at,
      $video_count,
      $subscriber_count,
      $category,
      $tags,
      $last_synced_at
    )
    ON CONFLICT(channel_id) DO UPDATE SET
      subscription_id = excluded.subscription_id,
      title = excluded.title,
      description = excluded.description,
      thumbnail_url = excluded.thumbnail_url,
      subscribed_at = excluded.subscribed_at,
      video_count = COALESCE(excluded.video_count, channels.video_count),
      subscriber_count = COALESCE(excluded.subscriber_count, channels.subscriber_count),
      last_synced_at = excluded.last_synced_at;
  `);

  const transaction = db.transaction((rows: ChannelRecord[]) => {
    for (const ch of rows) {
      statement.run({
        $channel_id: ch.channel_id,
        $subscription_id: ch.subscription_id,
        $title: ch.title,
        $description: ch.description ?? null,
        $thumbnail_url: ch.thumbnail_url ?? null,
        $subscribed_at: ch.subscribed_at ?? null,
        $video_count: ch.video_count ?? null,
        $subscriber_count: ch.subscriber_count ?? null,
        $category: ch.category ?? null,
        $tags: ch.tags ?? "[]",
        $last_synced_at: ch.last_synced_at,
      });
    }
  });

  transaction(channels);
}

export function getChannelsStats(db: Database): { totalCount: number; lastSyncedAt: string | null } {
  const countRow = db.prepare("SELECT COUNT(*) as count FROM channels").get() as { count: number } | undefined;
  const lastSyncRow = db.prepare("SELECT MAX(last_synced_at) as last_synced_at FROM channels").get() as
    | { last_synced_at: string | null }
    | undefined;

  return {
    totalCount: countRow?.count ?? 0,
    lastSyncedAt: lastSyncRow?.last_synced_at ?? null,
  };
}
