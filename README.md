# YouTube Subscription Manager

A self-hosted desktop app that lets you browse, search, tag, categorise, bulk-unsubscribe, and export your YouTube subscriptions — all running locally with no third-party cloud services.

---

## Table of Contents

1. [Google Cloud Console Setup](#google-cloud-console-setup)
2. [Running the Binary](#running-the-binary)
3. [App Data Storage](#app-data-storage)
4. [Resetting Credentials](#resetting-credentials)
5. [YouTube API Quota Limit](#youtube-api-quota-limit)
6. [Development](#development)

---

## Google Cloud Console Setup

The app uses Google's official YouTube Data API v3 and OAuth 2.0.  
You need a **Client ID** and **Client Secret** from the Google Cloud Console before you can authenticate.

### Step 1 — Create a Google Cloud Project

1. Open [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with your Google account.
2. Click the project dropdown at the top of the page (next to the Google Cloud logo).
3. Click **New Project**.
4. Enter a project name (e.g. `yt-sub-manager`) and click **Create**.
5. Wait for the project to be created, then make sure it is selected in the dropdown.

### Step 2 — Enable the YouTube Data API v3

1. In the left sidebar, go to **APIs & Services → Library**.
2. Search for **YouTube Data API v3**.
3. Click on the result, then click **Enable**.

### Step 3 — Configure the OAuth Consent Screen

1. In the left sidebar, go to **APIs & Services → OAuth consent screen**.
2. Select **External** as the user type and click **Create**.
3. Fill in the required fields:
   - **App name** — any name you like (e.g. `yt-sub-manager`)
   - **User support email** — your email address
   - **Developer contact information** — your email address
4. Click **Save and Continue** through the Scopes and Test Users steps (no changes needed).
5. On the **Summary** page, click **Back to Dashboard**.
6. Under **Publishing status**, the app will be in **Testing** mode. While in testing mode, only Google accounts you explicitly add as test users can authorise the app.
7. Click **Add Users**, enter your Google account email, and click **Add**.

### Step 4 — Create a Desktop App OAuth 2.0 Client ID

1. In the left sidebar, go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials** → **OAuth client ID**.
3. For **Application type**, select **Desktop app**.
4. Give it a name (e.g. `yt-sub-manager desktop`) and click **Create**.
5. A dialog will show your **Client ID** and **Client Secret**.  
   Copy both values — you will paste them into the app on first run.  
   You can also click **Download JSON** if you want to keep a local backup.

---

## Running the Binary

Download the binary for your platform from the releases page, or build it yourself:

```bash
bun run build:binary
```

This creates a single executable file named `yt-sub-manager` in the repo root.

### macOS / Linux

```bash
# Make the binary executable (first time only)
chmod +x yt-sub-manager

# Run it
./yt-sub-manager
```

Or from any directory:

```bash
/path/to/yt-sub-manager
```

### Windows

```powershell
# In PowerShell or Command Prompt
.\yt-sub-manager.exe
```

> **First run:** The app opens in your default browser automatically. Paste your **Client ID** and **Client Secret** from Google Cloud Console when prompted, then click **Connect with Google** to complete OAuth.

---

## App Data Storage

The binary stores all data (encrypted credentials and the SQLite subscription database) in a platform-specific directory.  
The app never writes to the directory it was launched from, so you can run it from anywhere.

| Platform | Location |
|----------|----------|
| **macOS** | `~/Library/Application Support/yt-sub-manager/` |
| **Linux** | `~/.local/share/yt-sub-manager/` (or `$XDG_DATA_HOME/yt-sub-manager/` if set) |
| **Windows** | `%APPDATA%\yt-sub-manager\` (e.g. `C:\Users\<you>\AppData\Roaming\yt-sub-manager\`) |

Files inside that directory:

| File | Purpose |
|------|---------|
| `credentials.enc` | AES-256-GCM encrypted Client ID, Client Secret, access token, and refresh token |
| `subscriptions.db` | SQLite database with your subscription list, tags, and categories |

---

## Resetting Credentials

To disconnect your Google account and start over:

**Option A — from the app UI**  
Click **Disconnect** in the Settings panel (top-right of the app). This deletes the encrypted credential file and resets the auth state.

**Option B — manually**  
Delete the `credentials.enc` file from the app data directory for your platform (see table above):

```bash
# macOS
rm ~/Library/Application\ Support/yt-sub-manager/credentials.enc

# Linux
rm ~/.local/share/yt-sub-manager/credentials.enc
```

```powershell
# Windows (PowerShell)
Remove-Item "$env:APPDATA\yt-sub-manager\credentials.enc"
```

On the next launch, the app will prompt you to enter your Client ID and Client Secret again.

---

## YouTube API Quota Limit

The YouTube Data API v3 enforces a **daily quota of 10,000 units** per project.

**Unsubscribing costs 50 units per channel.**  
This means you can unsubscribe from roughly **~200 channels per day** before the quota is exhausted.

If the quota is hit mid-batch, the app will stop unsubscribing, report which channels succeeded and which were not processed, and show a quota-exceeded warning. The channels that were successfully unsubscribed will be removed from the local database. You can resume the next day once the quota resets (midnight Pacific Time).

> **Tip:** Syncing subscriptions costs 1 unit per API page (~50 subscriptions). For most users a single sync uses well under 100 units.

---

## Development

Requirements: [Bun](https://bun.sh) v1.x

```bash
# Install dependencies
bun install

# Start the development server (with hot reload)
bun dev

# Run tests
bun test

# Compile a standalone binary
bun run build:binary
```
