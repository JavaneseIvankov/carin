Task / scope:
- Restore development email verification/resend on `fix/registration-required-consent`, preserving existing changes.

Changes and affected files:
- Configuration fix; existing HTTPS callback validation remains in place.
- `infra/README.md`: document HTTPS URL alignment, worker startup, web same-origin setup, and queue vs delivery distinction.
- Ignored `carin-app/.env.local`: development API URL now uses the running HTTPS tunnel.
- Existing private `/tmp/carin-local-runtime.json`: configured public auth/media base and trusted HTTPS origin; copied local Resend settings without printing secrets.
- Temporary workstation tools: `/tmp/carin-cloudflared`, `/tmp/carin-dev-proxy.cjs`, `/tmp/carin-local-runtime.cjs` (now supports `email`). Tunnel exposes one HTTPS origin, proxy on loopback port 3000 routes API/auth/health to API port 3002 and app traffic to Expo port 8081. API, Expo, tunnel, proxy, and email worker are running.
- Updated the one nonexpired queued email's local URL to HTTPS before starting the worker; preserved its token and recipient.

Verification: commands, working directories, results, platform/device if relevant
- HTTPS `GET /health/ready` returned 200 through the tunnel.
- Read-only Resend domain API check returned 200 and confirmed configured sender domain is verified. No test email sent.
- One queued email existed before worker startup; queue was empty afterward. Given the unexpired task and successful worker deletion path, provider accepted delivery. Recipient inbox was not inspected.
- `node /tmp/carin-email-browser.cjs` passed on Chromium phone viewport: actual HTTPS app/API loads; resend builds HTTPS callback, sends the request and starts cooldown, with no HTTPS configuration message. Resend POST was intercepted for this browser check to avoid extra email.
- Screenshot: `/tmp/carin-email-https.png`.
- No product source changed in this task; existing app/API tests were not rerun.

Unverified work / blockers:
- Recipient receipt/spam placement and native Android/iOS callbacks are unverified.
- This is a temporary development tunnel; it must remain running, and a newly created tunnel requires environment updates and server restarts. See official setup: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- Existing user modification to tracked `infra/.env.example` contains real email configuration; preserved it rather than discarding user changes. Do not commit credentials.

Next step:
- Open the HTTPS app URL recorded in private local runtime `BETTER_AUTH_URL`, then check the verification email inbox/spam or use resend.
- For persistent setup, configure a stable development HTTPS origin and use documented Compose email profile with ignored infra/.env.

Worktree state:
- Uncommitted changes remain on `fix/registration-required-consent`. Prior mobile, API CORS, handoffs, and user infra/.env.example edits preserved. No commit/push.
