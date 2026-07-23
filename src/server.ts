import { type Server } from "bun";
import { type Database } from "bun:sqlite";
import index from "./index.html";
import { ensureAppDataDir } from "./lib/paths";
import { decryptCredentials, encryptCredentials, deleteCredentials, type AppCredentials } from "./lib/credentials";
import { openBrowser } from "./lib/browser";
import { createOAuth2Client, getStoredOAuth2Client, verifyOrRefreshTokens, AuthRevokedError } from "./lib/oauth";
import { initDatabase, upsertChannels, getChannelsStats, getChannels, getAllMatchingChannelIds, getDistinctCategories, getCategoryStats, bulkTagAndCategory, getSubscriptionIds, deleteChannels, getChannelTitles, recordAction, getRecentActions, getActionById, InvalidSortError, createExportStream, type ActionRecord } from "./lib/db";
import { fetchAllSubscriptions, createYouTubeClient, QuotaExceededError, isQuotaExceededError, isSubscriptionNotFoundError } from "./lib/youtube";

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

  function getYouTubeClientOrError(): { ytClient: any } | { errorResponse: Response } {
    if (options.youtubeClient) return { ytClient: options.youtubeClient };
    const redirectUri = `http://127.0.0.1:${server.port}/oauth/callback`;
    const oauth2Client = getStoredOAuth2Client(appDataDir, redirectUri);
    if (!oauth2Client) {
      return { errorResponse: Response.json({ error: "OAuth client not initialized." }, { status: 401 }) };
    }
    return { ytClient: createYouTubeClient(oauth2Client) };
  }

  /**
   * Streams newline-delimited JSON progress events while unsubscribing.
   * A buffered JSON response would trip the connection idle timeout on large
   * batches (250 ms delay per channel adds up), and the client needs a live
   * progress counter anyway. The completed batch is recorded in the actions
   * log so it can be redone later.
   */
  function createUnsubscribeStreamResponse(params: {
    ytClient: any;
    channelIds: string[];
    interCallDelayMs: number;
    /** Channels from the original action that are already gone locally (redo). */
    skipped?: string[];
    /** Extra fields persisted in the action payload (e.g. redoOf). */
    payloadExtras?: Record<string, unknown>;
  }): Response {
    const { ytClient, channelIds, interCallDelayMs, skipped = [], payloadExtras = {} } = params;

    const subMap = new Map(getSubscriptionIds(db, channelIds).map((r) => [r.channel_id, r.subscription_id]));
    // Snapshot titles now: rows are deleted as the batch progresses, but the
    // action log should still display meaningful names afterwards.
    const titles = getChannelTitles(db, channelIds);

    const encoder = new TextEncoder();
    const total = channelIds.length;

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };

        const succeeded: string[] = [];
        const failed: { channelId: string; reason: string }[] = [];
        let quotaStopped = false;

        try {
          for (let i = 0; i < channelIds.length; i++) {
            const channelId = channelIds[i]!;
            const subscriptionId = subMap.get(channelId);

            if (!subscriptionId) {
              const reason = "Subscription ID not found";
              failed.push({ channelId, reason });
              emit({ type: "progress", processed: i + 1, total, channelId, status: "failed", reason });
              continue;
            }

            if (i > 0 && interCallDelayMs > 0) {
              await Bun.sleep(interCallDelayMs);
            }

            try {
              await ytClient.subscriptions.delete({ id: subscriptionId });
              succeeded.push(channelId);
              // Delete immediately so an interrupted batch leaves the
              // local DB consistent with YouTube.
              deleteChannels(db, [channelId]);
              emit({ type: "progress", processed: i + 1, total, channelId, status: "ok" });
            } catch (err: any) {
              if (isQuotaExceededError(err)) {
                quotaStopped = true;
                break;
              }
              if (isSubscriptionNotFoundError(err)) {
                // Already unsubscribed on YouTube; converge local state.
                succeeded.push(channelId);
                deleteChannels(db, [channelId]);
                emit({ type: "progress", processed: i + 1, total, channelId, status: "ok" });
              } else {
                const reason = err?.message || "Failed to unsubscribe";
                failed.push({ channelId, reason });
                emit({ type: "progress", processed: i + 1, total, channelId, status: "failed", reason });
              }
            }
          }
        } catch (err: any) {
          emit({ type: "error", message: err?.message || "Failed to unsubscribe channels." });
        }

        try {
          recordAction(db, {
            type: "unsubscribe",
            payload: { channelIds, titles, ...payloadExtras },
            total,
            succeededCount: succeeded.length,
            failedCount: failed.length,
            quotaStopped,
          });
        } catch (err) {
          console.error("Failed to record unsubscribe action:", err);
        }

        emit({ type: "done", succeeded, failed, quotaStopped, skipped });
        controller.close();
      },
    });

    return new Response(stream, { headers: NDJSON_HEADERS });
  }

  const server = Bun.serve({
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

          const clientResult = getYouTubeClientOrError();
          if ("errorResponse" in clientResult) return clientResult.errorResponse;

          return createUnsubscribeStreamResponse({
            ytClient: clientResult.ytClient,
            channelIds: body.channelIds,
            interCallDelayMs: typeof body.interCallDelayMs === "number" ? body.interCallDelayMs : 250,
          });
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
          const interCallDelayMs = typeof body?.interCallDelayMs === "number" ? body.interCallDelayMs : 250;

          if (action.type === "unsubscribe") {
            const clientResult = getYouTubeClientOrError();
            if ("errorResponse" in clientResult) return clientResult.errorResponse;

            // Only re-attempt channels still present locally; the rest were
            // already unsubscribed and are reported as skipped.
            const stillPresent = new Set(getSubscriptionIds(db, requestedIds).map((r) => r.channel_id));
            const toAttempt = requestedIds.filter((cid) => stillPresent.has(cid));
            const skipped = requestedIds.filter((cid) => !stillPresent.has(cid));

            return createUnsubscribeStreamResponse({
              ytClient: clientResult.ytClient,
              channelIds: toAttempt,
              interCallDelayMs,
              skipped,
              payloadExtras: { redoOf: action.id },
            });
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

  if (options.autoOpenBrowser !== false) {
    openBrowser(server.url.toString());
  }

  return server;
}
