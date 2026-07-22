import { google } from "googleapis";
import { encryptCredentials, decryptCredentials, deleteCredentials } from "./credentials";

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number | null;
}

export class AuthRevokedError extends Error {
  constructor(message = "Your Google access was revoked. Please reconnect.") {
    super(message);
    this.name = "AuthRevokedError";
  }
}

export function createOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getStoredOAuth2Client(appDataDir?: string, redirectUri?: string) {
  const creds = decryptCredentials<AppCredentials>(appDataDir);
  if (!creds || !creds.clientId || !creds.clientSecret) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);

  if (creds.accessToken || creds.refreshToken) {
    oauth2Client.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
      expiry_date: creds.expiryDate ?? undefined,
    });
  }

  oauth2Client.on("tokens", (tokens) => {
    const existing = decryptCredentials<AppCredentials>(appDataDir) || creds;
    encryptCredentials(
      {
        ...existing,
        accessToken: tokens.access_token || existing.accessToken,
        refreshToken: tokens.refresh_token || existing.refreshToken,
        expiryDate: tokens.expiry_date ?? existing.expiryDate,
      },
      appDataDir
    );
  });

  return oauth2Client;
}

export async function verifyOrRefreshTokens(appDataDir?: string): Promise<string> {
  const oauth2Client = getStoredOAuth2Client(appDataDir);
  if (!oauth2Client) {
    throw new AuthRevokedError();
  }

  try {
    const tokenRes = await oauth2Client.getAccessToken();
    if (!tokenRes.token) {
      deleteCredentials(appDataDir);
      throw new AuthRevokedError();
    }
    return tokenRes.token;
  } catch (err: any) {
    if (err?.name === "AuthRevokedError") throw err;

    // Handle revoked token or invalid grant
    const errMsg = err?.message || "";
    if (errMsg.includes("invalid_grant") || errMsg.includes("Token has been expired or revoked")) {
      deleteCredentials(appDataDir);
      throw new AuthRevokedError();
    }
    throw err;
  }
}
