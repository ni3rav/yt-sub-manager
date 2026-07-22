import { type Server } from "bun";
import { type Database } from "bun:sqlite";
import index from "./index.html";
import { ensureAppDataDir } from "./lib/paths";
import { decryptCredentials, encryptCredentials, deleteCredentials, type AppCredentials } from "./lib/credentials";
import { openBrowser } from "./lib/browser";
import { createOAuth2Client, getStoredOAuth2Client, verifyOrRefreshTokens, AuthRevokedError } from "./lib/oauth";
import { initDatabase, upsertChannels, getChannelsStats, getChannels, getAllMatchingChannelIds, getDistinctCategories, bulkTagAndCategory, getSubscriptionIds, deleteChannels, InvalidSortError } from "./lib/db";
import { fetchAllSubscriptions, createYouTubeClient, QuotaExceededError, isQuotaExceededError } from "./lib/youtube";

export interface ServerOptions {
  port?: number;
  hostname?: string;
  appDataDir?: string;
  autoOpenBrowser?: boolean;
  tokenExchanger?: (code: string) => Promise<{ access_token: string; refresh_token?: string; expiry_date?: number }>;
  db?: Database;
  youtubeClient?: any;
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

export function createAppServer(options: ServerOptions = {}): Server<unknown> {
  const appDataDir = ensureAppDataDir(options.appDataDir);
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;

  const db = options.db ? initDatabase(options.db) : initDatabase(appDataDir);

  const server = Bun.serve({
    hostname,
    port,
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
          return Response.json({ categories });
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

            const updatedCount = bulkTagAndCategory(db, body.channelIds, {
              category: hasCategory ? body.category : undefined,
              tags: hasTags ? validTags : undefined,
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

          try {
            const body = await req.json().catch(() => null);
            if (!body || !Array.isArray(body.channelIds) || body.channelIds.length === 0) {
              return Response.json({ error: "channelIds must be a non-empty array." }, { status: 400 });
            }

            const channelIds: string[] = body.channelIds;
            const subRecords = getSubscriptionIds(db, channelIds);
            const subMap = new Map(subRecords.map((r) => [r.channel_id, r.subscription_id]));

            let ytClient = options.youtubeClient;
            if (!ytClient) {
              const redirectUri = `http://127.0.0.1:${server.port}/oauth/callback`;
              const oauth2Client = getStoredOAuth2Client(appDataDir, redirectUri);
              if (!oauth2Client) {
                return Response.json({ error: "OAuth client not initialized." }, { status: 401 });
              }
              ytClient = createYouTubeClient(oauth2Client);
            }

            const succeeded: string[] = [];
            const failed: { channelId: string; reason: string }[] = [];
            let quotaStopped = false;

            const interCallDelayMs = typeof body.interCallDelayMs === "number" ? body.interCallDelayMs : 250;

            for (let i = 0; i < channelIds.length; i++) {
              const channelId = channelIds[i];
              const subscriptionId = subMap.get(channelId);

              if (!subscriptionId) {
                failed.push({ channelId, reason: "Subscription ID not found" });
                continue;
              }

              if (i > 0 && interCallDelayMs > 0) {
                await Bun.sleep(interCallDelayMs);
              }

              try {
                await ytClient.subscriptions.delete({ id: subscriptionId });
                succeeded.push(channelId);
              } catch (err: any) {
                if (isQuotaExceededError(err)) {
                  quotaStopped = true;
                  break;
                } else {
                  failed.push({ channelId, reason: err?.message || "Failed to unsubscribe" });
                }
              }
            }

            if (succeeded.length > 0) {
              deleteChannels(db, succeeded);
            }

            return Response.json({
              succeeded,
              failed,
              quotaStopped,
            });
          } catch (err: any) {
            return Response.json({ error: err?.message || "Failed to unsubscribe channels." }, { status: 500 });
          }
        },
      },

      "/*": index,
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
