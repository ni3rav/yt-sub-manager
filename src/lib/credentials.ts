import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureAppDataDir, getAppDataDir } from "./paths";

const KEY_FILE_NAME = ".key";
const CREDS_FILE_NAME = "credentials.enc";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number | null;
}

export function getMasterKeyPath(customDir?: string): string {
  return path.join(getAppDataDir(customDir), KEY_FILE_NAME);
}

export function getCredentialsPath(customDir?: string): string {
  return path.join(getAppDataDir(customDir), CREDS_FILE_NAME);
}

export function getMasterKey(customDir?: string): Buffer {
  const appDataDir = ensureAppDataDir(customDir);
  const keyPath = path.join(appDataDir, KEY_FILE_NAME);

  if (fs.existsSync(keyPath)) {
    const existingKey = fs.readFileSync(keyPath);
    if (existingKey.length === KEY_BYTES) {
      return existingKey;
    }
  }

  const newKey = crypto.randomBytes(KEY_BYTES);
  fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
  return newKey;
}

export function encryptCredentials(data: Record<string, any>, customDir?: string): void {
  const appDataDir = ensureAppDataDir(customDir);
  const masterKey = getMasterKey(appDataDir);

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

  const serializedData = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(serializedData, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload = {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };

  const credsPath = path.join(appDataDir, CREDS_FILE_NAME);
  fs.writeFileSync(credsPath, JSON.stringify(payload, null, 2), "utf8");
}

export function decryptCredentials<T = Record<string, any>>(customDir?: string): T | null {
  const appDataDir = getAppDataDir(customDir);
  const credsPath = path.join(appDataDir, CREDS_FILE_NAME);

  if (!fs.existsSync(credsPath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(credsPath, "utf8");
    const payload = JSON.parse(fileContent);

    if (!payload.iv || !payload.authTag || !payload.ciphertext) {
      return null;
    }

    const masterKey = getMasterKey(appDataDir);
    const iv = Buffer.from(payload.iv, "hex");
    const authTag = Buffer.from(payload.authTag, "hex");
    const ciphertext = Buffer.from(payload.ciphertext, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch (err) {
    return null;
  }
}

export function deleteCredentials(customDir?: string): void {
  const credsPath = getCredentialsPath(customDir);
  if (fs.existsSync(credsPath)) {
    fs.unlinkSync(credsPath);
  }
}
