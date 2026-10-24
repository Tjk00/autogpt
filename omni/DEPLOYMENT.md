# Phase 2: secure deployment recovery

**Current state: source pushed; production and live AI BLOCKED.** There is no Cloudflare authorization in this sandbox. Both Cloudflare and OpenRouter TLS connections fail under its outbound network policy. The Cloudflare connector is unsupported. The current GitHub integration can push source, but listing Actions secrets returns HTTP 403; it cannot configure deployment credentials. Never send passwords/tokens/API keys in chat.

## Option A — authorized terminal with the required outbound access

Use the production setup commands in README section 10. `wrangler login` opens Cloudflare's own OAuth flow; this is not GitHub authorization. Only use an account whose Workers/D1 Free status you personally verified. Stop if payment/card entry is required. Do not upgrade or add a top-up.

1. `npx wrangler login` in the authorized environment.
2. `npx wrangler d1 create omni` (or reuse an existing matching database).
3. Put its actual UUID into `wrangler.jsonc`; keep binding `DB` and migrations directory `migrations`.
4. `npm run db:remote`.
5. `npx wrangler secret put ADMIN_PASSWORD` and enter a new unique production password interactively.
6. Optional: `npx wrangler secret put OPENROUTER_API_KEY`, entering a dedicated free-account key interactively. Do not set `LOCAL_PREVIEW` remotely.
7. `npm run deploy`. This deliberately refuses the placeholder database ID.
8. Copy the **actual HTTPS workers.dev URL printed after success**. No URL is known in advance here.
9. Verify it with the smoke script below and then in Mobile Safari.

Sessions use per-login 256-bit random opaque tokens hashed in D1, not signed browser tokens. There is no missing global session-signing secret to configure. A new production database has none of the local sessions. Password rotation alone does not revoke existing sessions; revoke them explicitly in D1 when rotating a compromised production password.

## Option B — owner-managed GitHub secrets and a manual workflow

`deployment/manual-cloudflare.yml` is an **inactive template**, not a deployed workflow. It does not run on pushes, PRs or schedules. No Actions run was started in this session. It targets standard `ubuntu-latest` on this **public** repository and refuses private-repository execution; confirm your account's applicable Actions billing rules before use. It never upgrades Cloudflare plans. Its Free-plan confirmation is an owner attestation, not an independently verified billing API check.

From your iPhone, use the GitHub and Cloudflare websites directly, with their normal secure login flows:

1. In Cloudflare, verify Free Workers/D1 enrollment without a payment card. Create the D1 database `omni` in that account, or reuse an existing matching database. Record its actual UUID.
2. Create a narrowly scoped Cloudflare API token for that account only: the permissions needed by Wrangler include Workers Scripts Edit, D1 Edit and Account Settings Read. Do not grant zone/domain access unless required by a separately reviewed setup. This app uses workers.dev, not a purchased domain.
3. In the repository's **Settings → Secrets and variables → Actions**, create repository secrets:
   - `OMNI_CLOUDFLARE_API_TOKEN`
   - `OMNI_CLOUDFLARE_ACCOUNT_ID`
   - `OMNI_ADMIN_PASSWORD` (new unique password, at least 20 characters)
   - Optional `OMNI_OPENROUTER_API_KEY` (free-tier account; no credit/top-up)
4. Add repository variables `OMNI_D1_DATABASE_ID` and, when known, `OMNI_PUBLIC_URL`. Database IDs and URLs are not secrets.
5. After reviewing the template, install it at `.github/workflows/omni-deploy.yml` through a reviewed PR. **Workflow dispatch discovery requires it on the default branch.** This session has not modified or merged into `master`. The template explicitly checks out `arena/9a131784-autogpt` for application source.
6. On GitHub's Actions page, choose the manual workflow and explicitly confirm deployment/migrations and the account's Free-plan status. This is the authorization step. Build/test steps have no provider/Cloudflare credentials. Deployment steps receive secrets through environment variables, never source literals. A temporary secret file is ignored and removed; it is not uploaded as an artifact.
7. The first run cannot verify a previously unknown URL automatically. After Wrangler prints the real URL, set `OMNI_PUBLIC_URL` and rerun. A missing URL intentionally fails verification rather than fabricating deployment success. Creating/updating an existing deployment and idempotent migrations on a rerun do not imply the earlier URL was verified.

The template has been locally inspected/formatted, **not executed against Cloudflare**. It cannot verify account quota/eligibility itself or activate credentials. Omitting a provider secret on a later deployment does not remove an already configured remote key: Wrangler's secret upload is additive. Audit or remove stale remote secrets with Cloudflare's own controls. If `LOCAL_PREVIEW` was ever set remotely, remove it explicitly before verification.

## Verify a real deployment without exposing credentials

`scripts/verify-deployment.mjs` reads these from the environment, not arguments or the browser:

- `OMNI_URL`: actual verified candidate HTTPS origin
- `OMNI_ADMIN_PASSWORD`: the configured owner password
- `OMNI_VERIFY_FREE_AI=true`: **optional explicit authorization** for one real bounded free-model task

Run `npm run verify:deployment` from a secure environment supplying those variables. It rejects redirects and non-HTTPS remote URLs, checks health/database/configuration, checks unauthorized API rejection, logs in, checks secure cookie attributes, creates the requested cleaning-company headline task, checks database persistence, logs out, and verifies the old session is rejected. It does not print the password or session token.

If no provider key exists, it runs the task only to confirm a genuine blocked state. If a key exists but real-AI verification was not explicitly enabled, it leaves the task queued rather than silently invoking inference. With explicit AI verification, it requires completion and an exact zero provider-reported response cost. A missing cost is not treated as confirmed zero. Independent account billing-ledger verification remains required before claiming zero account charges.

The smoke script was successfully run against the local app with `OMNI_VERIFY_LOCAL=true`. This is **not public deployment evidence**. Local HTTP is accepted only for localhost and only with that explicit flag.
