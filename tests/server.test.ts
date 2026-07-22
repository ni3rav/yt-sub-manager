import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createAppServer } from "../src/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("HTTP Server & API Foundation", () => {
  let server: ReturnType<typeof createAppServer>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-server-test-"));
    server = createAppServer({ port: 0, appDataDir: tempDir, autoOpenBrowser: false });
  });

  afterEach(() => {
    if (server) {
      server.stop(true);
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("Binds to port 0 on 127.0.0.1 and assigns a dynamic port", () => {
    expect(server.hostname).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
    expect(server.url.origin).toContain("127.0.0.1");
  });

  test("GET /api/auth/status returns { authenticated: false, setupRequired: true }", async () => {
    const res = await fetch(`${server.url}api/auth/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ authenticated: false, setupRequired: true });
  });

  test("GET / returns 200 with HTML content", async () => {
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("html");
  });
});
