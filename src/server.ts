import { type Server } from "bun";
import { type Database } from "bun:sqlite";
import index from "./index.html";
import { ensureAppDataDir } from "./lib/paths";
import { decryptCredentials, encryptCredentials, deleteCredentials, type AppCredentials } from "./lib/credentials";
import { openBrowser } from "./lib/browser";
import { createOAuth2Client, getStoredOAuth2Client, verifyOrRefreshTokens, AuthRevokedError } from "./lib/oauth";
import { initDatabase, upsertChannels, getChannelsStats, getChannels, getAllMatchingChannelIds, getDistinctCategories, getCategoryStats, bulkTagAndCategory, getSubscriptionIds, getChannelTitles, recordAction, getRecentActions, getActionById, InvalidSortError, createExportStream, type ActionRecord } from "./lib/db";
import { fetchAllSubscriptions, createYouTubeClient, QuotaExceededError } from "./lib/youtube";
import { UnsubscribeQueue } from "./lib/unsubscribeQueue";

export interface ServerOptions {
  port?: number;
  hostname?: string;
  appDataDir?: string;
  autoOpenBrowser?: boolean;
  tokenExchanger?: (code: string) => Promise<{ access_token: string; refresh_token?: string; expiry_date?: number }>;
  db?: Database;
  youtubeClient?: any;
  /**
   * Override the default `src/index.html` bundle with a pre-built HTML file
   * (e.g. `dist/index.html` produced by `bun run build`). Use this when
   * compiling to a binary so that the Tailwind-processed CSS is embedded
   * rather than the raw source CSS.
   */
  indexHtml?: any;
}

async function authenticateRequest(appDataDir: string): Promise<Response | null> {
  try {
    await verifyOrRefreshTokens(appDataDir);
    return null;
  } catch (err: any) {
    if (err instanceof AuthRevokedError) {
      return Response.json(
        { error: "Your Google access was revoked. Please reconnect.", reason: "auth_revoked" },
        { status: 401 }
      );
    }
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
}

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

function serializeAction(action: ActionRecord) {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(action.payload || "{}");
  } catch {
    payload = {};
  }
  return {
    id: action.id,
    type: action.type,
    payload,
    total: action.total,
    succeededCount: action.succeeded_count,
    failedCount: action.failed_count,
    quotaStopped: Boolean(action.quota_stopped),
    createdAt: action.created_at,
  };
}

export function createAppServer(options: ServerOptions = {}): Server<unknown> {
  const appDataDir = ensureAppDataDir(options.appDataDir);
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;

  const db = options.db ? initDatabase(options.db) : initDatabase(appDataDir);
  let server: Server<unknown>;
  const unsubscribeQueue = new UnsubscribeQueue({
    db,
    getYouTubeClient: () => {
      if (options.youtubeClient) return options.youtubeClient;
      if (!server) return null;
      const redirectUri = `http://127.0.0.1:${server.port}/oauth/callback`;
      const oauth2Client = getStoredOAuth2Client(appDataDir, redirectUri);
      return oauth2Client ? createYouTubeClient(oauth2Client) : null;
    },
  });

  server = Bun.serve({
    hostname,
    port,
    // Full syncs page through the YouTube API and can quietly exceed the
    // default 10 s idle timeout for accounts with many subscriptions.
    idleTimeout: 120,
    routes: {
      "/api/auth/status": {
        async GET() {
          const creds = decryptCredentials<AppCredentials>(appDataDir);
          const hasTokens = Boolean(creds?.accessToken || creds?.refreshToken);
          if (!hasTokens) {
            return Response.json({ authenticated: false, setupRequired: true });
          }

          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          return Response.json({ authenticated: true });
        },
      },

      "/api/auth/setup": {
        async POST(req) {
          try {
            const body = await req.json().catch(() => null);
            if (!body || typeof body.clientId !== "string" || typeof body.clientSecret !== "string") {
              return Response.json({ error: "Client ID and Client Secret are required." }, { status: 400 });
            }

            const clientId = body.clientId.trim();
            const clientSecret = body.clientSecret.trim();

            if (!clientId || !clientSecret) {
              return Response.json({ error: "Client ID and Client Secret cannot be empty." }, { status: 400 });
            }

            const existing = decryptCredentials<AppCredentials>(appDataDir) || {};
            encryptCredentials(
              {
                ...existing,
                clientId,
                clientSecret,
              },
              appDataDir
            );

            const redirectUri = `http://127.0.0.1:${server.port}/oauth/callback`;
            const oauth2Client = createOAuth2Client(clientId, clientSecret, redirectUri);

            const authUrl = oauth2Client.generateAuthUrl({
              access_type: "offline",
              scope: ["https://www.googleapis.com/auth/youtube"],
              prompt: "consent",
            });

            return Response.json({ authUrl });
          } catch (err: any) {
            return Response.json({ error: err?.message || "Failed to setup auth." }, { status: 500 });
          }
        },
      },

      "/oauth/callback": {
        async GET(req) {
          const reqUrl = new URL(req.url);
          const code = reqUrl.searchParams.get("code");
          const errorParam = reqUrl.searchParams.get("error");

          if (errorParam || !code) {
            const redirectError = encodeURIComponent(errorParam || "Authorization failed");
            return Response.redirect(`/?error=${redirectError}`, 302);
          }

          const creds = decryptCredentials<AppCredentials>(appDataDir);
          if (!creds || !creds.clientId || !creds.clientSecret) {
            return Response.redirect("/?error=Missing+client+credentials", 302);
          }

          try {
            let tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null };

            if (options.tokenExchanger) {
              tokens = await options.tokenExchanger(code);
            } else {
              const redirectUri = `http://127.0.0.1:${server.port}/oauth/callback`;
              const oauth2Client = createOAuth2Client(creds.clientId, creds.clientSecret, redirectUri);
              const tokenRes = await oauth2Client.getToken(code);
              tokens = tokenRes.tokens;
            }

            encryptCredentials(
              {
                ...creds,
                accessToken: tokens.access_token || creds.accessToken,
                refreshToken: tokens.refresh_token || creds.refreshToken,
                expiryDate: tokens.expiry_date ?? creds.expiryDate,
              },
              appDataDir
            );

            return Response.redirect("/", 302);
          } catch (err: any) {
            const redirectError = encodeURIComponent(err?.message || "Failed to exchange authorization code");
            return Response.redirect(`/?error=${redirectError}`, 302);
          }
        },
      },

      "/api/auth/disconnect": {
        async POST() {
          deleteCredentials(appDataDir);
          return Response.json({ success: true });
        },
      },

      "/api/sync": {
        async GET() {
          const stats = getChannelsStats(db);
          return Response.json({ count: stats.totalCount, lastSyncedAt: stats.lastSyncedAt });
        },

        async POST() {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          const syncTimestamp = new Date().toISOString();
          let ytClient = options.youtubeClient;

          if (!ytClient) {
            const redirectUri = `http://127.0.0.1:${server.port}/oauth/callback`;
            const oauth2Client = getStoredOAuth2Client(appDataDir, redirectUri);
            if (!oauth2Client) {
              return Response.json({ error: "OAuth client not initialized." }, { status: 401 });
            }
            ytClient = createYouTubeClient(oauth2Client);
          }

          try {
            const result = await fetchAllSubscriptions(ytClient, syncTimestamp);
            upsertChannels(db, result.items);
            return Response.json({
              count: result.items.length,
              errors: result.errors,
              lastSyncedAt: syncTimestamp,
            });
          } catch (err: any) {
            if (err instanceof QuotaExceededError) {
              if (err.partialItems && err.partialItems.length > 0) {
                upsertChannels(db, err.partialItems);
              }
              return Response.json({
                count: err.partialItems?.length ?? 0,
                errors: [{ reason: "quotaExceeded", message: err.message }],
                lastSyncedAt: syncTimestamp,
              });
            }
            return Response.json(
              { error: err?.message || "Failed to sync subscriptions." },
              { status: 500 }
            );
          }
        },
      },

      "/api/categories": {
        async GET() {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          const categories = getDistinctCategories(db);
          const stats = getCategoryStats(db);
          return Response.json({ categories, stats });
        },
      },

      "/api/channels": {
        async GET(req) {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          const url = new URL(req.url);
          const q = url.searchParams.get("q") || undefined;
          const sortBy = (url.searchParams.get("sortBy") as any) || undefined;
          const sortDir = (url.searchParams.get("sortDir") as any) || undefined;
          const category = url.searchParams.get("category") || undefined;
          const tag = url.searchParams.get("tag") || undefined;
          const page = url.searchParams.get("page") ? Number(url.searchParams.get("page")) : 1;
          const pageSize = url.searchParams.get("pageSize") ? Number(url.searchParams.get("pageSize")) : 20;
          const allIdsOnly = url.searchParams.get("allIdsOnly") === "true";

          try {
            if (allIdsOnly) {
              const channelIds = getAllMatchingChannelIds(db, { q, category, tag });
              return Response.json({ channelIds });
            }

            const result = getChannels(db, {
              q,
              sortBy,
              sortDir,
              category,
              tag,
              page,
              pageSize,
            });

            return Response.json(result);
          } catch (err: any) {
            if (err instanceof InvalidSortError) {
              return Response.json({ error: err.message }, { status: 400 });
            }
            return Response.json({ error: err?.message || "Failed to fetch channels." }, { status: 500 });
          }
        },
      },

      "/api/channels/tag": {
        async POST(req) {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          try {
            const body = await req.json().catch(() => null);
            if (!body || !Array.isArray(body.channelIds) || body.channelIds.length === 0) {
              return Response.json({ error: "channelIds must be a non-empty array." }, { status: 400 });
            }

            const hasCategory = typeof body.category === "string";
            const validTags = Array.isArray(body.tags)
              ? body.tags.map((t: any) => (typeof t === "string" ? t.trim() : "")).filter((t: string) => t !== "")
              : [];
            const hasTags = validTags.length > 0;

            if (!hasCategory && !hasTags) {
              return Response.json(
                { error: "At least one of 'category' or 'tags' must be provided." },
                { status: 400 }
              );
            }

            // Snapshot titles before applying so the action log stays readable.
            const titles = getChannelTitles(db, body.channelIds);

            const updatedCount = bulkTagAndCategory(db, body.channelIds, {
              category: hasCategory ? body.category : undefined,
              tags: hasTags ? validTags : undefined,
            });

            recordAction(db, {
              type: "tag",
              payload: {
                channelIds: body.channelIds,
                titles,
                category: hasCategory ? body.category : undefined,
                tags: hasTags ? validTags : undefined,
              },
              total: body.channelIds.length,
              succeededCount: updatedCount,
              failedCount: body.channelIds.length - updatedCount,
              quotaStopped: false,
            });

            return Response.json({ updatedCount });
          } catch (err: any) {
            return Response.json({ error: err?.message || "Failed to update channels." }, { status: 500 });
          }
        },
      },

      "/api/channels/unsubscribe": {
        async POST(req) {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          const body = await req.json().catch(() => null);
          if (!body || !Array.isArray(body.channelIds) || body.channelIds.length === 0) {
            return Response.json({ error: "channelIds must be a non-empty array." }, { status: 400 });
          }

          const job = unsubscribeQueue.enqueue({
            channelIds: body.channelIds,
            interCallDelayMs: typeof body.interCallDelayMs === "number" ? body.interCallDelayMs : undefined,
            retryBaseDelayMs: typeof body.retryBaseDelayMs === "number" ? body.retryBaseDelayMs : undefined,
          });
          return Response.json({ job }, { status: 202 });
        },
      },

      "/api/unsubscribe/jobs": {
        async GET() {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;
          return Response.json({ jobs: unsubscribeQueue.list() });
        },
      },

      "/api/unsubscribe/jobs/:id": {
        async GET(req) {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;
          const job = unsubscribeQueue.get(req.params.id);
          return job
            ? Response.json({ job })
            : Response.json({ error: "Unsubscribe job not found." }, { status: 404 });
        },
      },

      "/api/actions": {
        async GET() {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          const actions = getRecentActions(db).map(serializeAction);
          return Response.json({ actions });
        },
      },

      "/api/actions/:id/redo": {
        async POST(req) {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          const id = Number(req.params.id);
          const action = Number.isInteger(id) ? getActionById(db, id) : null;
          if (!action) {
            return Response.json({ error: "Action not found." }, { status: 404 });
          }

          let payload: any = {};
          try {
            payload = JSON.parse(action.payload || "{}");
          } catch {
            payload = {};
          }
          const requestedIds: string[] = Array.isArray(payload.channelIds) ? payload.channelIds : [];

          const body = await req.json().catch(() => null);

          if (action.type === "unsubscribe") {
            // Only re-attempt channels still present locally; the rest were
            // already unsubscribed and are reported as skipped.
            const stillPresent = new Set(getSubscriptionIds(db, requestedIds).map((r) => r.channel_id));
            const toAttempt = requestedIds.filter((cid) => stillPresent.has(cid));
            const skipped = requestedIds.filter((cid) => !stillPresent.has(cid));

            const job = unsubscribeQueue.enqueue({
              channelIds: toAttempt,
              skippedChannelIds: skipped,
              redoOf: action.id,
              interCallDelayMs:
                typeof body?.interCallDelayMs === "number" ? body.interCallDelayMs : undefined,
              retryBaseDelayMs:
                typeof body?.retryBaseDelayMs === "number" ? body.retryBaseDelayMs : undefined,
            });
            return Response.json({ job }, { status: 202 });
          }

          // Tag actions apply instantly; emit the same NDJSON protocol so the
          // client handles every redo identically.
          const stillPresentTitles = getChannelTitles(db, requestedIds);
          const applicableIds = requestedIds.filter((cid) => cid in stillPresentTitles);
          const skipped = requestedIds.filter((cid) => !(cid in stillPresentTitles));

          const updatedCount =
            applicableIds.length > 0
              ? bulkTagAndCategory(db, applicableIds, {
                  category: typeof payload.category === "string" ? payload.category : undefined,
                  tags: Array.isArray(payload.tags) ? payload.tags : undefined,
                })
              : 0;

          recordAction(db, {
            type: "tag",
            payload: {
              channelIds: applicableIds,
              titles: stillPresentTitles,
              category: payload.category,
              tags: payload.tags,
              redoOf: action.id,
            },
            total: applicableIds.length,
            succeededCount: updatedCount,
            failedCount: applicableIds.length - updatedCount,
            quotaStopped: false,
          });

          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              const emit = (event: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
              };
              emit({ type: "progress", processed: applicableIds.length, total: applicableIds.length, status: "ok" });
              emit({ type: "done", succeeded: applicableIds, failed: [], quotaStopped: false, skipped });
              controller.close();
            },
          });
          return new Response(stream, { headers: NDJSON_HEADERS });
        },
      },

      "/api/export": {
        async GET(req) {
          const authErr = await authenticateRequest(appDataDir);
          if (authErr) return authErr;

          const url = new URL(req.url);
          const formatRaw = url.searchParams.get("format")?.toLowerCase();
          if (formatRaw !== "csv" && formatRaw !== "json") {
            return Response.json(
              { error: "Invalid format. Must be 'csv' or 'json'." },
              { status: 400 }
            );
          }
          const format: "csv" | "json" = formatRaw;

          const scopeRaw = url.searchParams.get("scope")?.toLowerCase();
          const scope: "filtered" | "all" = scopeRaw === "all" ? "all" : "filtered";

          const q = url.searchParams.get("q") || undefined;
          const sortBy = (url.searchParams.get("sortBy") as any) || undefined;
          const sortDir = (url.searchParams.get("sortDir") as any) || undefined;
          const category = url.searchParams.get("category") || undefined;
          const tag = url.searchParams.get("tag") || undefined;

          try {
            const stream = createExportStream(db, {
              format,
              scope,
              q,
              sortBy,
              sortDir,
              category,
              tag,
            });

            const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
            const filename = `subscriptions.${format}`;

            return new Response(stream, {
              headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${filename}"`,
              },
            });
          } catch (err: any) {
            if (err instanceof InvalidSortError) {
              return Response.json({ error: err.message }, { status: 400 });
            }
            return Response.json({ error: err?.message || "Failed to export subscriptions." }, { status: 500 });
          }
        },
      },

      "/*": options.indexHtml ?? index,
    },
    development: process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
  });

  unsubscribeQueue.start();
  const stopServer = server.stop.bind(server);
  server.stop = ((closeActiveConnections?: boolean) => {
    unsubscribeQueue.stop();
    return stopServer(closeActiveConnections);
  }) as typeof server.stop;

  if (options.autoOpenBrowser !== false) {
    openBrowser(server.url.toString());
  }

  return server;
}
