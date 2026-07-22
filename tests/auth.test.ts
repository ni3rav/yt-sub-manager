import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createAppServer } from "../src/server";
import { encryptCredentials, decryptCredentials } from "../src/lib/credentials";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("OAuth Setup & Auth Endpoints", () => {
  let server: ReturnType<typeof createAppServer>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-auth-test-"));
    server = createAppServer({
      port: 0,
      appDataDir: tempDir,
      autoOpenBrowser: false,
      tokenExchanger: async (code) => {
        if (code === "valid-code") {
          return {
            access_token: "mock-access-token",
            refresh_token: "mock-refresh-token",
            expiry_date: 1800000000000,
          };
        }
        throw new Error("Invalid authorization code");
      },
    });
  });

  afterEach(() => {
    if (server) {
      server.stop(true);
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("GET /api/auth/status returns setupRequired: true when no creds exist", async () => {
    const res = await fetch(`${server.url}api/auth/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ authenticated: false, setupRequired: true });
  });

  test("GET /api/auth/status returns authenticated: true when valid tokens exist", async () => {
    encryptCredentials(
      {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
      },
      tempDir
    );

    const res = await fetch(`${server.url}api/auth/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ authenticated: true });
    // Ensure secrets/tokens are never exposed in auth status
    expect((body as any).clientSecret).toBeUndefined();
    expect((body as any).accessToken).toBeUndefined();
  });

  test("POST /api/auth/setup validates missing input", async () => {
    const res = await fetch(`${server.url}api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "" }),
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/auth/setup saves creds and returns Google OAuth URL", async () => {
    const res = await fetch(`${server.url}api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "sample-client-id.apps.googleusercontent.com",
        clientSecret: "sample-secret",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.authUrl).toBeDefined();
    expect(body.authUrl).toContain("accounts.google.com");
    expect(body.authUrl).toContain(encodeURIComponent("https://www.googleapis.com/auth/youtube"));

    // Verify stored initial creds
    const stored = decryptCredentials(tempDir);
    expect(stored?.clientId).toBe("sample-client-id.apps.googleusercontent.com");
    expect(stored?.clientSecret).toBe("sample-secret");
  });

  test("GET /oauth/callback exchanges code for tokens and redirects to /", async () => {
    encryptCredentials(
      {
        clientId: "sample-client-id",
        clientSecret: "sample-secret",
      },
      tempDir
    );

    const res = await fetch(`${server.url}oauth/callback?code=valid-code`, {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");

    const stored = decryptCredentials(tempDir);
    expect(stored?.accessToken).toBe("mock-access-token");
    expect(stored?.refreshToken).toBe("mock-refresh-token");
  });

  test("POST /api/auth/disconnect clears credentials and returns status setupRequired", async () => {
    encryptCredentials(
      {
        clientId: "test-id",
        clientSecret: "test-secret",
        accessToken: "token",
      },
      tempDir
    );

    const disconnectRes = await fetch(`${server.url}api/auth/disconnect`, {
      method: "POST",
    });
    expect(disconnectRes.status).toBe(200);

    const statusRes = await fetch(`${server.url}api/auth/status`);
    const statusBody = await statusRes.json();
    expect(statusBody).toEqual({ authenticated: false, setupRequired: true });
  });
});
