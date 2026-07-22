import { describe, test, expect, afterEach } from "bun:test";
import { createAppServer } from "../src/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("HTTP Server & API Foundation", () => {
  let server: ReturnType<typeof createAppServer> | null = null;
  let tempDir: string | null = null;

  afterEach(() => {
    if (server) {
      server.stop(true);
      server = null;
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test("Binds to port 0 on 127.0.0.1 and assigns a dynamic port", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-server-test-"));
    server = createAppServer({ port: 0, appDataDir: tempDir, autoOpenBrowser: false });

    expect(server.hostname).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
    expect(server.url.origin).toContain("127.0.0.1");
  });

  test("GET /api/auth/status returns { authenticated: false, setupRequired: true }", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-server-test-"));
    server = createAppServer({ port: 0, appDataDir: tempDir, autoOpenBrowser: false });

    const res = await fetch(`${server.url}api/auth/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ authenticated: false, setupRequired: true });
  });

  test("GET / returns 200 with HTML content", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-server-test-"));
    server = createAppServer({ port: 0, appDataDir: tempDir, autoOpenBrowser: false });

    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("html");
  });
});
