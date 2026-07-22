# 01 — Foundation: app data dir, encrypted credential store, dynamic-port server, browser-open

**What to build:** The binary infrastructure that everything else builds on. When the binary is run, it creates the OS-appropriate app data directory if it does not exist, binds a `Bun.serve` HTTP server to a free port on `127.0.0.1`, opens the user's default browser to the server URL, and serves a minimal React shell. The credential store module can encrypt and decrypt a credential blob using AES-256-GCM with a machine-local key file (chmod 600). `GET /api/auth/status` returns `{ authenticated: false, setupRequired: true }` at this stage. All app data paths are derived from `os.homedir()` — never relative paths — so the binary works from any working directory.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] App data directory is created on first run at the correct OS-specific path (macOS: `~/Library/Application Support/yt-sub-manager/`, Linux: `~/.local/share/yt-sub-manager/`, Windows: `%APPDATA%/yt-sub-manager/`)
- [x] A 32-byte random master key is generated on first run and written to `.key` in the app data dir with permissions 0o600; subsequent runs reuse the existing key
- [x] `encryptCredentials(data)` serialises a JSON object, encrypts it with AES-256-GCM using the master key, and writes `{ iv, authTag, ciphertext }` as JSON to `credentials.enc` in the app data dir
- [x] `decryptCredentials()` reads `credentials.enc`, decrypts it, and returns the original object; returns `null` if the file does not exist
- [x] `Bun.serve` binds to port 0 (OS-assigned free port) on `127.0.0.1`
- [x] The resolved server URL is opened in the user's default browser immediately on startup using the platform-appropriate command (`open` on macOS, `xdg-open` on Linux, `start` on Windows) via `Bun.spawn`
- [x] `GET /api/auth/status` returns `{ authenticated: false, setupRequired: true }`
- [x] The React frontend loads in the browser (placeholder UI is acceptable at this stage)
- [x] Credential store unit tests: encrypt/decrypt round-trip, key file created with correct permissions, `decryptCredentials()` returns null when no file exists
- [x] All app data file accesses use absolute paths derived from `os.homedir()`; no relative paths
