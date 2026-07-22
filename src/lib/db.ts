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

export interface GetChannelsOptions {
  q?: string;
  sortBy?: "title" | "subscribed_at" | "video_count" | "subscriber_count";
  sortDir?: "asc" | "desc";
  category?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

const ALLOWED_SORT_FIELDS = new Set(["title", "subscribed_at", "video_count", "subscriber_count"]);

export class InvalidSortError extends Error {
  constructor(message = "Invalid sortBy parameter.") {
    super(message);
    this.name = "InvalidSortError";
  }
}

function buildWhereClause(options: { q?: string; category?: string; tag?: string }): { whereSql: string; params: any[] } {
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (options.q && options.q.trim()) {
    whereClauses.push("title LIKE ?");
    params.push(`%${options.q.trim()}%`);
  }

  if (options.category && options.category.trim()) {
    whereClauses.push("category = ?");
    params.push(options.category.trim());
  }

  if (options.tag && options.tag.trim()) {
    whereClauses.push("EXISTS (SELECT 1 FROM json_each(channels.tags) WHERE json_each.value = ?)");
    params.push(options.tag.trim());
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  return { whereSql, params };
}

export function getChannels(db: Database, options: GetChannelsOptions = {}) {
  const {
    q,
    sortBy = "title",
    sortDir = "asc",
    category,
    tag,
    page = 1,
    pageSize = 20,
  } = options;

  if (options.sortBy && !ALLOWED_SORT_FIELDS.has(options.sortBy)) {
    throw new InvalidSortError(`Invalid sortBy parameter: ${options.sortBy}`);
  }

  const { whereSql, params } = buildWhereClause({ q, category, tag });

  // Count total matching
  const countSql = `SELECT COUNT(*) as total FROM channels ${whereSql}`;
  const countRow = db.prepare(countSql).get(...params) as { total: number } | undefined;
  const total = countRow?.total ?? 0;

  // Sorting
  const sortColumn = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : "title";
  const direction = sortDir.toLowerCase() === "desc" ? "DESC" : "ASC";

  // Pagination
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.max(1, Number(pageSize) || 20);
  const offset = (pageNum - 1) * size;

  const dataSql = `
    SELECT * FROM channels
    ${whereSql}
    ORDER BY ${sortColumn} ${direction}
    LIMIT ? OFFSET ?
  `;

  const channels = db.prepare(dataSql).all(...params, size, offset) as ChannelRecord[];

  return {
    channels,
    total,
    page: pageNum,
    pageSize: size,
  };
}

export function getAllMatchingChannelIds(db: Database, options: Omit<GetChannelsOptions, "page" | "pageSize"> = {}): string[] {
  const { q, category, tag } = options;
  const { whereSql, params } = buildWhereClause({ q, category, tag });
  const rows = db.prepare(`SELECT channel_id FROM channels ${whereSql}`).all(...params) as { channel_id: string }[];
  return rows.map((r) => r.channel_id);
}

export function getDistinctCategories(db: Database): string[] {
  const rows = db
    .prepare("SELECT DISTINCT category FROM channels WHERE category IS NOT NULL AND category != '' ORDER BY category ASC")
    .all() as { category: string }[];
  return rows.map((r) => r.category);
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

export interface BulkTagCategoryOptions {
  category?: string;
  tags?: string[];
}

export function bulkTagAndCategory(
  db: Database,
  channelIds: string[],
  options: BulkTagCategoryOptions
): number {
  if (!channelIds || channelIds.length === 0) return 0;
  if (options.category === undefined && (!options.tags || options.tags.length === 0)) return 0;

  const updateCategoryStmt = db.prepare("UPDATE channels SET category = ? WHERE channel_id = ?");
  const getTagsStmt = db.prepare("SELECT tags FROM channels WHERE channel_id = ?");
  const updateTagsStmt = db.prepare("UPDATE channels SET tags = ? WHERE channel_id = ?");

  let updatedCount = 0;

  const transaction = db.transaction((ids: string[]) => {
    for (const id of ids) {
      let rowUpdated = false;

      if (options.category !== undefined) {
        const res = updateCategoryStmt.run(options.category, id);
        if (res.changes > 0) rowUpdated = true;
      }

      if (options.tags && options.tags.length > 0) {
        const row = getTagsStmt.get(id) as { tags: string } | undefined;
        if (row) {
          let existingTags: string[] = [];
          try {
            existingTags = JSON.parse(row.tags || "[]");
            if (!Array.isArray(existingTags)) existingTags = [];
          } catch {
            existingTags = [];
          }

          const newTags = options.tags.filter((t) => typeof t === "string" && t.trim() !== "");
          const merged = [...existingTags];
          for (const nt of newTags) {
            const trimmed = nt.trim();
            if (!merged.includes(trimmed)) {
              merged.push(trimmed);
            }
          }

          const res = updateTagsStmt.run(JSON.stringify(merged), id);
          if (res.changes > 0) rowUpdated = true;
        }
      }

      if (rowUpdated) {
        updatedCount++;
      }
    }
  });

  transaction(channelIds);
  return updatedCount;
}

export function getSubscriptionIds(
  db: Database,
  channelIds: string[]
): { channel_id: string; subscription_id: string }[] {
  if (!channelIds || channelIds.length === 0) return [];
  const stmt = db.prepare(
    `SELECT channel_id, subscription_id FROM channels WHERE channel_id IN (${channelIds.map(() => "?").join(",")})`
  );
  return stmt.all(...channelIds) as { channel_id: string; subscription_id: string }[];
}

export function deleteChannels(db: Database, channelIds: string[]): number {
  if (!channelIds || channelIds.length === 0) return 0;
  const stmt = db.prepare("DELETE FROM channels WHERE channel_id = ?");
  let deletedCount = 0;
  const transaction = db.transaction((ids: string[]) => {
    for (const id of ids) {
      const res = stmt.run(id);
      deletedCount += res.changes;
    }
  });
  transaction(channelIds);
  return deletedCount;
}

export interface ExportChannelsOptions {
  format: "csv" | "json";
  scope?: "filtered" | "all";
  q?: string;
  sortBy?: "title" | "subscribed_at" | "video_count" | "subscriber_count";
  sortDir?: "asc" | "desc";
  category?: string;
  tag?: string;
}

export function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseTags(tagsJson: string | null | undefined): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createExportStream(db: Database, options: ExportChannelsOptions): ReadableStream {
  const {
    format,
    scope = "filtered",
    q,
    sortBy = "title",
    sortDir = "asc",
    category,
    tag,
  } = options;

  if (sortBy && !ALLOWED_SORT_FIELDS.has(sortBy)) {
    throw new InvalidSortError(`Invalid sortBy parameter: ${sortBy}`);
  }

  const sortColumn = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : "title";
  const direction = sortDir.toLowerCase() === "desc" ? "DESC" : "ASC";

  const { whereSql, params } = scope === "all"
    ? { whereSql: "", params: [] }
    : buildWhereClause({ q, category, tag });

  const querySql = `
    SELECT * FROM channels
    ${whereSql}
    ORDER BY ${sortColumn} ${direction}
  `;

  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      const statement = db.prepare(querySql);
      const iterator = statement.iterate(...params) as Iterable<ChannelRecord>;

      if (format === "csv") {
        const header = "channel_id,subscription_id,title,description,thumbnail_url,subscribed_at,video_count,subscriber_count,category,tags\n";
        controller.enqueue(encoder.encode(header));
        for (const row of iterator) {
          const tagsStr = parseTags(row.tags).join(", ");
          const line = [
            escapeCsvCell(row.channel_id),
            escapeCsvCell(row.subscription_id),
            escapeCsvCell(row.title),
            escapeCsvCell(row.description),
            escapeCsvCell(row.thumbnail_url),
            escapeCsvCell(row.subscribed_at),
            escapeCsvCell(row.video_count),
            escapeCsvCell(row.subscriber_count),
            escapeCsvCell(row.category),
            escapeCsvCell(tagsStr),
          ].join(",") + "\n";
          controller.enqueue(encoder.encode(line));
        }
      } else {
        controller.enqueue(encoder.encode("[\n"));
        let isFirst = true;
        for (const row of iterator) {
          const jsonObj = {
            channel_id: row.channel_id,
            subscription_id: row.subscription_id,
            title: row.title,
            description: row.description ?? null,
            thumbnail_url: row.thumbnail_url ?? null,
            subscribed_at: row.subscribed_at ?? null,
            video_count: row.video_count ?? null,
            subscriber_count: row.subscriber_count ?? null,
            category: row.category ?? null,
            tags: parseTags(row.tags),
          };
          const jsonStr = JSON.stringify(jsonObj);
          if (!isFirst) {
            controller.enqueue(encoder.encode(",\n" + jsonStr));
          } else {
            controller.enqueue(encoder.encode(jsonStr));
            isFirst = false;
          }
        }
        controller.enqueue(encoder.encode("\n]"));
      }

      controller.close();
    },
  });
}



