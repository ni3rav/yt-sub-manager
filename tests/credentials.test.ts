import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAppDataDir, ensureAppDataDir } from "../src/lib/paths";
import {
  encryptCredentials,
  decryptCredentials,
  deleteCredentials,
  getMasterKeyPath,
  getCredentialsPath,
} from "../src/lib/credentials";

describe("AppData Directories", () => {
  test("getAppDataDir returns an absolute path derived from homedir", () => {
    const dir = getAppDataDir();
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir.startsWith(os.homedir()) || dir.includes("AppData")).toBe(true);
    expect(dir).toContain("yt-sub-manager");
  });

  test("ensureAppDataDir creates directory recursively", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-test-dir-"));
    const subDir = path.join(tmpDir, "nested", "yt-sub-manager");
    expect(fs.existsSync(subDir)).toBe(false);

    ensureAppDataDir(subDir);
    expect(fs.existsSync(subDir)).toBe(true);

    // cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("Credential Store", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-creds-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("decryptCredentials returns null when no credential file exists", () => {
    const creds = decryptCredentials(tempDir);
    expect(creds).toBeNull();
  });

  test("encryptCredentials and decryptCredentials round-trip successfully", () => {
    const payload = {
      clientId: "test-client-id.apps.googleusercontent.com",
      clientSecret: "test-client-secret-12345",
      accessToken: "ya29.test-access-token",
      refreshToken: "1//test-refresh-token",
      expiry: 1700000000000,
    };

    encryptCredentials(payload, tempDir);

    const decrypted = decryptCredentials(tempDir);
    expect(decrypted).toEqual(payload);
  });

  test("creates a 32-byte master key on first encrypt and sets 0o600 permissions", () => {
    const keyPath = getMasterKeyPath(tempDir);
    expect(fs.existsSync(keyPath)).toBe(false);

    encryptCredentials({ foo: "bar" }, tempDir);

    expect(fs.existsSync(keyPath)).toBe(true);
    const keyBuffer = fs.readFileSync(keyPath);
    expect(keyBuffer.length).toBe(32);

    const stat = fs.statSync(keyPath);
    // Mask with 0o777 to check file permissions mode
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("deleteCredentials removes credentials file but leaves key file intact", () => {
    const credPath = getCredentialsPath(tempDir);
    const keyPath = getMasterKeyPath(tempDir);

    encryptCredentials({ secret: "data" }, tempDir);
    expect(fs.existsSync(credPath)).toBe(true);
    expect(fs.existsSync(keyPath)).toBe(true);

    deleteCredentials(tempDir);
    expect(fs.existsSync(credPath)).toBe(false);
    expect(fs.existsSync(keyPath)).toBe(true);
    expect(decryptCredentials(tempDir)).toBeNull();
  });
});
