import os from "node:os";

export function openBrowser(url: string, options?: { skip?: boolean }): boolean {
  if (options?.skip || process.env.NODE_ENV === "test" || process.env.NO_OPEN === "true") {
    return false;
  }

  const platform = os.platform();

  try {
    if (platform === "darwin") {
      Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
      return true;
    }

    if (platform === "win32") {
      Bun.spawn(["cmd", "/c", "start", "", url], { stdout: "ignore", stderr: "ignore" });
      return true;
    }

    // Default Linux / BSD
    Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" });
    return true;
  } catch (err) {
    console.error("Failed to open browser:", err);
    return false;
  }
}
