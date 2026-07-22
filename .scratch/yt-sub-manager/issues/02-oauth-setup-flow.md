# 02 — OAuth setup flow: setup screen, auth routes, token storage

**What to build:** The complete first-run authentication experience. When the user opens the app and no credentials are stored, they see a setup screen with step-by-step instructions for creating a Google Cloud project, enabling the YouTube Data API v3, and creating a Desktop app OAuth Client ID. They enter their Client ID and Client Secret into the form and click Connect. The backend encrypts the credentials, constructs an OAuth2 consent URL using the `googleapis` package with scope `https://www.googleapis.com/auth/youtube`, and the consent page opens in the browser. After the user grants access, Google redirects to `/oauth/callback`, which exchanges the code for access and refresh tokens, encrypts and stores them, and redirects the browser back to the dashboard. From this point, the access token is refreshed silently on every API call using the stored refresh token. If a refresh fails (revoked access), stored tokens are wiped and the user is routed back to the setup screen with an explanatory message. A Disconnect button in the UI wipes `credentials.enc` and returns the user to setup.

**Blocked by:** 01 — foundation (credential store, server, app data dir).

**Status:** completed

- [x] `GET /api/auth/status` returns `{ authenticated: true }` when valid credentials are stored, `{ authenticated: false, setupRequired: true }` otherwise
- [x] The React frontend shows `<SetupScreen>` when auth status is not authenticated, and the main `<Dashboard>` shell when authenticated
- [x] `<SetupScreen>` displays clear step-by-step instructions for Google Cloud Console setup (create project → enable YouTube Data API v3 → create Desktop app OAuth Client ID) and a link to the Google Cloud Console
- [x] `<SetupScreen>` has Client ID and Client Secret input fields and a Connect button
- [x] `POST /api/auth/setup` accepts `{ clientId, clientSecret }`, encrypts and persists them, constructs an OAuth2 consent URL with redirect URI `http://127.0.0.1:<port>/oauth/callback` and scope `https://www.googleapis.com/auth/youtube`, and returns `{ authUrl }` to the frontend
- [x] The frontend navigates the browser to the returned `authUrl` after a successful setup submission
- [x] `GET /oauth/callback` exchanges the `code` query param for access and refresh tokens, encrypts and stores them alongside the client credentials, and redirects to `/`
- [x] Client Secret and tokens are never present in any API response body sent to the browser
- [x] After successful auth, `GET /api/auth/status` returns `{ authenticated: true }`
- [x] Every subsequent YouTube API call uses the `googleapis` OAuth2 client, which transparently refreshes the access token when it expires
- [x] When token refresh fails (e.g. revoked access), `credentials.enc` is deleted, the API returns a 401 with `{ reason: 'auth_revoked' }`, and the frontend routes back to `<SetupScreen>` with the message "Your Google access was revoked. Please reconnect."
- [x] `POST /api/auth/disconnect` deletes `credentials.enc` and returns 200; the frontend returns to `<SetupScreen>` on receiving this response
- [x] A Disconnect button is visible in the authenticated dashboard shell
- [x] HTTP API tests: `/api/auth/status` returns correct shape when credentials present vs absent; `/api/auth/setup` with valid body returns an authUrl; `/oauth/callback` with a stubbed token exchange stores tokens; `/api/auth/disconnect` removes the credentials file
