import { serve, type Server } from "bun";
import index from "./index.html";
import { ensureAppDataDir } from "./lib/paths";
import { decryptCredentials } from "./lib/credentials";
import { openBrowser } from "./lib/browser";

export interface ServerOptions {
  port?: number;
  hostname?: string;
  appDataDir?: string;
  autoOpenBrowser?: boolean;
}

export function createAppServer(options: ServerOptions = {}): Server<unknown> {
  const appDataDir = ensureAppDataDir(options.appDataDir);
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;

  const server = serve({
    hostname,
    port,
    routes: {
      "/api/auth/status": {
        async GET() {
          const creds = decryptCredentials(appDataDir);
          const isAuthenticated = Boolean(creds?.accessToken);
          return Response.json({
            authenticated: isAuthenticated,
            setupRequired: !isAuthenticated,
          });
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
