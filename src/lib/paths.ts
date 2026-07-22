import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export function getAppDataDir(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }

  if (process.env.YT_APP_DATA_DIR) {
    return path.resolve(process.env.YT_APP_DATA_DIR);
  }

  const platform = os.platform();
  const home = os.homedir();

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "yt-sub-manager");
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "yt-sub-manager");
  }

  // Default to Linux / XDG standard
  const xdgData = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
  return path.join(xdgData, "yt-sub-manager");
}

export function ensureAppDataDir(customPath?: string): string {
  const dir = getAppDataDir(customPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
