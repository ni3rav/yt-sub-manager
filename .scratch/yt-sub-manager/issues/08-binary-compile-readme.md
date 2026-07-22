# 08 — Binary compile + README

**What to build:** The final packaging step that turns the app into a single distributable binary and documents how to use it. A `build:binary` script is added to `package.json`. The compiled binary is verified to run standalone (without `bun run`) from any working directory, correctly finding or creating its app data directory. The README is written with exact click-by-click Google Cloud Console setup instructions and platform-specific run instructions.

**Blocked by:** 05 — bulk tag/category, 06 — bulk unsubscribe with quota handling, 07 — export (all features must be complete before the binary is finalised).

**Status:** ready-for-agent

- [ ] `package.json` has a `build:binary` script that runs `bun build ./src/index.ts --compile --outfile yt-sub-manager`
- [ ] Running `bun run build:binary` produces an executable file named `yt-sub-manager` at the repo root
- [ ] The compiled binary runs without `bun` installed (e.g. `./yt-sub-manager` works on a machine with no Bun runtime)
- [ ] When executed from a different working directory (e.g. `~/Desktop/yt-sub-manager`), the binary still creates and uses the correct app data directory
- [ ] The binary starts the server, opens the browser, and all features (auth, sync, browse, tag, unsubscribe, export) work end-to-end from the compiled binary
- [ ] The README has a "Google Cloud Console Setup" section with step-by-step instructions: create a project, enable YouTube Data API v3, create a Desktop app OAuth 2.0 Client ID, download or copy the Client ID and Client Secret
- [ ] The README has a "Running the binary" section with platform-specific commands for macOS, Linux, and Windows
- [ ] The README notes where app data is stored on each platform and how to reset credentials (delete `credentials.enc`)
- [ ] The README notes the YouTube API quota limit for unsubscribing (~200 deletions per day) so users are not surprised
- [ ] `.gitignore` includes `yt-sub-manager` (the compiled binary) so it is not committed to the repo
