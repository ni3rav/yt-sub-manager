import { type Server } from "bun";
import index from "./index.html";
import { ensureAppDataDir } from "./lib/paths";
import { decryptCredentials, encryptCredentials, deleteCredentials, type AppCredentials } from "./lib/credentials";
import { openBrowser } from "./lib/browser";
import { createOAuth2Client, verifyOrRefreshTokens, AuthRevokedError } from "./lib/oauth";

export interface ServerOptions {
  port?: number;
  hostname?: string;
  appDataDir?: string;
  autoOpenBrowser?: boolean;
  tokenExchanger?: (code: string) => Promise<{ access_token: string; refresh_token?: string; expiry_date?: number }>;
}

export function createAppServer(options: ServerOptions = {}): Server<unknown> {
  const appDataDir = ensureAppDataDir(options.appDataDir);
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;

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

          try {
            await verifyOrRefreshTokens(appDataDir);
            return Response.json({ authenticated: true });
          } catch (err: any) {
            if (err instanceof AuthRevokedError) {
              return Response.json(
                {
                  authenticated: false,
                  setupRequired: true,
                  reason: "auth_revoked",
                  error: "Your Google access was revoked. Please reconnect.",
                },
                { status: 401 }
              );
            }
            return Response.json({ authenticated: false, setupRequired: true });
          }
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
