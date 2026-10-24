# OMNI AUTOGPT GOD MODE — foundation v0.1

An independently implemented, single-owner AI workspace in `omni/`. **This is a tested foundation, not a completed autonomous operating system.** The original AutoGPT platform and Classic are unchanged. No platform source, branding assets, integration blocks or execution engine were copied into this application.

## Delivery summary — 2026-10-24

- Working branch: `arena/9a131784-autogpt` (Arena fixes the session branch; `feature/omni-autogpt-godmode` was not created).
- GitHub CLI authentication was verified. Phase 2 preservation and deployment results are recorded in `PHASE2_REPORT.md`.
- Local Workers preview: port **8787**, serving the production frontend build and a real local D1 database. This is an ephemeral Arena preview, **not a production deployment**.
- No default or public development password is supplied. Configure a unique local password in ignored `.dev.vars`; production requires a separate strong Worker secret.
- Open the live preview **in a separate browser tab**, particularly on Safari. Embedded cross-site previews may block the secure SameSite session cookie.
- No provider key is configured. Real task requests are saved and become **blocked**, with a reason. The UI contains no seeded business records, simulated progress, or artificial completion counts. Browser tests create clearly labeled `[Browser test ...]` tasks through the actual API.
- Production URL: **none**. Cloudflare authentication is absent; this sandbox's outbound host restrictions also exclude Cloudflare and AI endpoints. A Cloudflare connector lookup returned unsupported. GitHub authentication does not grant Cloudflare authorization.

## 1. Repository audit

| Area                | Inspected evidence                                                                                                                                | Decision                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend            | `autogpt_platform/frontend/package.json`: Next.js/React/TypeScript, Node 24 requirement, generated API clients and substantial build requirements | Preserve; do not transplant into a Worker                                                                                                                                   |
| Backend             | `autogpt_platform/backend/backend/`: Python/FastAPI API, executor, copilot, scheduler, notifications, integrations, WebSocket services            | Preserve; not a serverless Worker workload                                                                                                                                  |
| Infrastructure      | `autogpt_platform/docker-compose.yml`: PostgreSQL, Redis cluster, RabbitMQ, FalkorDB, ClamAV and multiple long-lived services                     | Complete platform cannot be faithfully deployed to the proposed tiny request-driven Worker                                                                                  |
| Database            | `autogpt_platform/backend/schema.prisma`: PostgreSQL/Prisma Python client, account/session/auth schema; extensive migrations                      | New D1 schema rather than unsafe SQL translation                                                                                                                            |
| Authentication      | Backend `data/auth`, frontend auth integration, Better Auth migration plus legacy Supabase compatibility                                          | Independent single-owner server-side sessions                                                                                                                               |
| Execution/workflows | Backend executor, batch executor, scheduler, graph templates, integration blocks and OAuth handlers                                               | No false claim of compatible execution; OMNI has a much smaller fixed pipeline                                                                                              |
| Deployment          | Existing Docker, single-container, installer and platform configuration                                                                           | Original deployment remains intact                                                                                                                                          |
| Classic             | `classic/` contains the original Python-based AutoGPT components                                                                                  | Not needed for the browser/serverless foundation                                                                                                                            |
| Licensing           | Root `LICENSE` describes MIT outside `autogpt_platform`; `autogpt_platform/LICENSE.md` is PolyForm Shield, including a noncompete restriction     | Independently written code, separately MIT-licensed in this directory; all original notices retained. Obtain legal review before reusing Shield code in a competing product |

Reusable **concepts**: bounded task execution, tool permissions, execution records, model routing and workflow history. No old component is represented as reused when it is not.

## 2. Architecture

```text
Mobile browser (React + TypeScript + Vite, local system fonts)
    │ same-origin HTTPS + HttpOnly/Secure/SameSite=Strict session cookie
Cloudflare Worker (TypeScript, fixed tool permissions, no shell/eval)
    ├── D1: sessions, rate limits, tasks/revisions, audit records
    ├── Workers Static Assets: compiled React application
    └── OpenRouter: key verification → zero-price catalog → bounded inference

Generated source → server-side structural validation → stored source bundle
                 → sanitized sandboxed static browser preview / ZIP download
```

Plain CSS replaces Tailwind for this small independent application: no extra styling runtime or generator, fewer dependencies, equivalent responsive controls. No Docker, Redis, paid database, paid model default, external fonts or analytics services are required.

Execution is **request-driven**. A task is created first, then an authenticated run request atomically claims it. The fixed plan validates access, loads an optional source revision, verifies free models, calls inference, validates output and saves results. This is **not** dynamic autonomous planning, web browsing, tool discovery or recursive delegation.

Limits: objective 3–8,000 characters; request body 16 KB; key verification timeout 5 seconds; catalog timeout 8 seconds; at most 2 inference requests at 20 seconds each; maximum 3,500 output tokens per attempt. No automatic retry loop beyond a single free-model fallback. Failed/blocked tasks can be retried manually, subject to rate limits. Running records older than 90 seconds are marked interrupted when history is requested. Closing a browser does not establish a background-execution guarantee.

## 3. Local setup

Requires Node **22.19+** (tested on 22.22.3) and npm.

```sh
cd omni
npm ci
cp .dev.vars.example .dev.vars
# Edit .dev.vars and set a unique ADMIN_PASSWORD of at least 16 characters.
# OPENROUTER_API_KEY is optional; omitted credentials produce honest blocked tasks.
npm run db:local
npm run build
npm run dev:api
```

The all-in-one local app listens on `0.0.0.0:8787`. Open `http://localhost:8787` locally, or use Arena's HTTPS preview. Localhost browsers accept Secure cookies as a special case; arbitrary non-HTTPS LAN URLs are unsupported. Do not expose a development workspace containing sensitive data or provider secrets.

For frontend hot reload, run `npm run dev` in a second terminal. Vite serves port 5173 and proxies relative `/api` requests to the Worker. Browser code does not reference backend localhost URLs.

`LOCAL_PREVIEW=true` is a **development-only** ignored environment setting used in Arena to permit embedding the preview. Do not configure this secret in production. The production response denies framing. If your browser blocks third-party cookies, open the preview as a full tab rather than weakening session security.

## 4. Database configuration

- Binding: `DB`; database name: `omni`.
- `migrations/0001_initial.sql`: sessions, counters, tasks and audit.
- `migrations/0002_revisions.sql`: source revision relationship and cleanup/query indexes.
- Session tokens are generated with 256 bits of randomness; only SHA-256 hashes are stored; expiry is 24 hours.
- Local SQLite state lives in ignored `.wrangler/state`. It is **not included in Git snapshots** and is not a durable production database.
- Production requires a real D1 database ID in `wrangler.jsonc`; the all-zero ID is only a local-development placeholder. The deployment preflight intentionally exits with an error until a real ID is configured.
- Task data persists until explicitly removed by an operator. There is no in-app delete action. History returns the newest 100 records, not all-time totals. Audit records older than 30 days and expired sessions/counters are pruned on successful login.
- D1 rows contain plaintext objectives/responses. Do not enter sensitive information. Provider keys remain platform-managed secrets and are not stored in D1.

## 5. Provider configuration and $0 policy

Set `OPENROUTER_API_KEY` only as a Worker secret (or ignored local `.dev.vars`). Never paste keys into the browser or commit them.

The implementation:

1. Verifies the key with `/api/v1/key`; fails closed unless the account reports `is_free_tier: true`.
2. Fetches the current model catalog; accepts only `:free` IDs with zero input/output pricing and no nonzero reported pricing field.
3. Rejects a selected model that is no longer verified free.
4. Sends explicit zero prompt/completion `provider.max_price` limits and disables provider-side fallbacks.
5. Attempts at most two catalog-verified free models; never substitutes a paid model.
6. Saves provider-reported token usage and a **zero-price estimate**, not fabricated account billing analytics.

Use a dedicated free-tier account with zero balance, no auto-top-up and no paid upgrade. Provider-side policy/availability changes are outside this app's control. Free access, capacity, retention policies, privacy, model quality and account eligibility must be checked with the provider. The free-tier-account gate deliberately blocks some otherwise valid paid-account keys.

“Test connection & load free models” makes key-verification and catalog requests, **not an inference request or proof that every listed model is available to the account**. Actual model entitlement is checked by the run request; failures pause the task. Catalogs may differ from account-level availability.

OpenRouter's live endpoints have **not been verified from this sandbox**. Integration tests explicitly mock them. Gemini, Groq, Hugging Face and arbitrary OpenAI-compatible URLs are **not implemented**: no account-level zero-cost entitlement could be verified. No generic URL input is accepted, avoiding an SSRF surface.

## 6. Security boundaries

- Single-owner password via server secret; digest comparison with fixed-size loop; no public signup or default production password.
- Server-side authorization on all task/provider/history/audit routes; logout deletes the session.
- Exact same-origin validation on POST; no permissive CORS; only JSON bodies accepted.
- D1-backed throttling: 5 login attempts/15 minutes/IP, 20 task creations/hour, 20 executions/hour, 20 model checks/hour. These are not a full DDoS defense or infrastructure billing cap.
- Prepared SQL bindings, bounded inputs, safe public configuration errors, no credential logging.
- Security headers: CSP, no sniffing, no referrer, restricted camera/microphone/location, no-store APIs, production anti-framing.
- Preview HTML is parsed into a conservative tag/attribute allowlist; URLs, scripts, active embeds, refresh tags, forms and event handlers are removed. A sandboxed iframe without any permission tokens and a restrictive preview CSP provide additional isolation. Only static HTML/CSS is shown. **Generated JavaScript does not execute in the preview.**
- Source paths and bundle sizes are validated. App code is never executed by the Worker. Structural validation is **not** build correctness, malware review or a security audit of exported code.
- No purchases, destructive tools, publishing, unsolicited messages or third-party account actions are available.
- Exported source requires human review before deployment. All third-party dependencies retain their own licenses.

## 7. Testing evidence

Commands run successfully on 2026-10-24 (format checking with `npm run check` also passed). The deployment preflight was separately verified to reject the placeholder database ID with an actionable error:

| Check                                                       | Result / scope                                                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                             | TypeScript and production Vite build passed                                                                                                                     |
| `npm test`                                                  | **20 passed**: real local workerd + D1; explicit outbound provider fixtures                                                                                     |
| `npm run test:browser`                                      | **4 passed**: mobile-sized Chromium auth/persistence/settings/history; adversarial static-preview isolation; actual fixture ZIP download and archive round trip |
| `npm run db:local`                                          | Both real local D1 migrations applied                                                                                                                           |
| `wrangler deploy --dry-run --outdir .wrangler/deploy-check` | Worker/assets packaging passed; **not a deployment**                                                                                                            |
| `npm audit`                                                 | **0 vulnerabilities** reported after test-tool updates and pinned sharp/undici overrides                                                                        |
| `curl /api/health` and `/`                                  | Actual local server: connected database and HTTP 200 frontend                                                                                                   |
| `wrangler whoami`                                           | Not authenticated: production deployment blocked                                                                                                                |
| Live provider test                                          | Blocked: no key and outbound network policy                                                                                                                     |
| Real iPhone Safari / public production URL                  | Not tested / not deployed                                                                                                                                       |

Phase 2 adds production-configuration/template checks and immediate stop on a provider-reported nonzero cost. See `PHASE2_REPORT.md` and `DEPLOYMENT.md` for current preservation and deployment results.

API tests cover secure cookie and hashed session, CSRF, authorization, logout, rate limiting, body/type validation, free-model filtering, rejection of paid accounts and models, bounded fallback, quota errors, task persistence, source revisions, validation failure, interrupted-run recovery and audit events.

To reproduce browser tests: first start the built application on port 8787 with an **isolated local test database**, a unique `ADMIN_PASSWORD` in ignored `.dev.vars` and no provider key. Supply that same password securely through the `OMNI_TEST_PASSWORD` environment variable; there is no hardcoded fallback. Then run `npm run test:browser`. Override `OMNI_TEST_PASSWORD` and `OMNI_TEST_URL` if needed. Tests create real labeled tasks and consume real local login/task quotas. Do not run this against an owner's production database. On Linux, the test configuration extracts bundled Chromium libraries into the temporary directory; it does not disable browser web security. On macOS/Windows, install Playwright's Chromium with `npx playwright install chromium`. The mobile viewport is 393×852 with touch enabled: **Chromium emulation is not Mobile Safari certification**.

## 8. Feature classification

| Feature                                                      | Classification    | Evidence / remaining boundary                                                                                     |
| ------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Frontend + backend + local database                          | WORKING           | Build, local health and browser tests                                                                             |
| Owner authentication + authorization                         | WORKING           | Real runtime/API/browser tests; production HTTPS still needs deployment                                           |
| Task persistence, execution history, audit, manual retries   | WORKING           | Actual D1 tests and blocked task in browser                                                                       |
| One-shot assistant pipeline                                  | PARTIALLY WORKING | Fixed plan and bounded runner tested with fixtures; not a conversational multi-turn agent; live inference blocked |
| Provider catalog, model selection, fallback, usage           | PARTIALLY WORKING | Server implementation/fixture tests; live connection BLOCKED                                                      |
| Website generation/revisions                                 | PARTIALLY WORKING | Validated generated-source fixture and stored revision pass; real generation BLOCKED                              |
| Static website preview + ZIP/source export                   | WORKING           | Adversarial browser isolation and archive tests; scripts deliberately disabled                                    |
| React/TypeScript app source bundles                          | PARTIALLY WORKING | Path validation/export; generation BLOCKED; build/execution NOT IMPLEMENTED                                       |
| Money research                                               | PARTIALLY WORKING | Prompt template only; live drafts BLOCKED; web research and fact verification NOT IMPLEMENTED                     |
| Strong After 60                                              | PARTIALLY WORKING | Draft/script/storyboard prompt only; live drafts BLOCKED                                                          |
| Lead search/organization/CSV/outreach module                 | NOT IMPLEMENTED   | Explicit UI limitation; no invented prospects                                                                     |
| Workflow conditions, scheduling, pause/resume, notifications | NOT IMPLEMENTED   | Manual task runs only; UI explicitly states limitation                                                            |
| Motion video, narration, captions, music, duration checks    | NOT IMPLEMENTED   | No rendering or media integrations; never labeled finished video                                                  |
| Buffer and GitHub publishing integrations                    | NOT IMPLEMENTED   | No authorization or publishing actions                                                                            |
| Gemini/Groq/Hugging Face/custom endpoints                    | NOT IMPLEMENTED   | No silent paid inference                                                                                          |
| Public production deployment + remote D1                     | BLOCKED           | Cloudflare authorization and external network access required                                                     |

## 9. Free hosting investigation / actual costs

Official Cloudflare documentation was inspected through its public GitHub source because direct Cloudflare endpoints are not reachable here:

- [Workers pricing](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/platform/pricing.mdx): Free plan is the default, 100,000 requests/day and 10 ms CPU/invocation. Network wait is distinct from CPU time. Real deployed CPU suitability is **not verified**, especially for large source JSON; shorten outputs if the Free plan rejects a run.
- [D1 pricing table](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/workers/d1-pricing.mdx): Free allowance of 5 million rows read/day, 100,000 rows written/day and 5 GB total account storage. Individual database limits also apply.
- [D1 limit behavior](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/d1/faq-pricing.mdx): Free-tier quota exhaustion causes errors instead of continued paid usage; paid-plan overages have different billing behavior.
- [Setup prerequisites](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/workers/prereqs.mdx): Cloudflare account and Node tooling.

Account signup/no-card acceptance was **not completed or independently verified** here. Use only the Free plan; stop if an account flow requires payment. No paid plan, custom domain, top-up or purchase was authorized. No platform charge was incurred by this implementation; no inference was purchased; no production resources were provisioned. Arena service charges, if any, are outside this application's cost accounting. Free service policies and quotas may change. This is not unlimited free execution.

## 10. Production recovery instructions

Use a Cloudflare-authorized execution environment with outbound access to Cloudflare and the provider. Do not send credentials in chat. On an iPhone, use Cloudflare's mobile dashboard for account setup and keep terminal commands in an authorized remote development environment.

```sh
cd omni
npm ci
npx wrangler login
npx wrangler d1 create omni
```

Copy the actual database ID printed by the last command into the `d1_databases[0].database_id` field in `wrangler.jsonc`. Keep binding `DB`. Do not deploy with the placeholder ID.

```sh
npm run db:remote
npx wrangler secret put ADMIN_PASSWORD
# Enter a NEW strong production password, never a local test password.
npx wrangler secret put OPENROUTER_API_KEY
# Optional: omitting it leaves tasks visibly blocked.
npm run deploy
```

Do **not** set `LOCAL_PREVIEW` remotely. CLI secrets are prompted interactively, not command-line arguments or source files. If deployment must be done inside Arena, Cloudflare authorization alone is insufficient until its outbound network policy also permits the required APIs. There is no connected Cloudflare tool in this session.

Wrangler will print an actual workers.dev URL **only after successful deployment**. Open that exact URL in Safari, sign in, check `/api/health`, create a task, reload to confirm persistence, then test the provider with its configured key. Verify another browser cannot access `/api/tasks` without a session. Run a real small free-model task and inspect saved output/usage. Verify production anti-framing headers and check Cloudflare CPU/D1 quotas. Do not claim deployment until these checks pass. No deployment URL is pre-invented in this repository.

## 11. Remaining implementation order

1. Authorize production account/network access; verify no-card Free eligibility; configure real D1 and a new owner password; deploy and verify HTTPS.
2. Configure a zero-credit free-tier OpenRouter key; verify current endpoint contracts, account entitlement, a real response, fallback, throttling and recorded usage. Any failed verification remains BLOCKED.
3. Perform real iPhone 14 Pro / Mobile Safari tests (keyboard, cookie policy, rotation, previews, file downloads), accessibility review and deployed CPU profiling.
4. Add conversational threads/streaming, more capable but bounded planning and explicitly permissioned research tools; retain fail-closed budgets.
5. Add authorized public-business search with provenance, deduplication, lead persistence and CSV export. Add real workflow state machines and scheduled execution only after measuring hosting limits.
6. Add verified medical-source research and content review. Integrate motion-video/narration/captions only if a real authorized free service exists; validate duration and quality before publishing.
7. Add reviewed GitHub/Buffer authorization and explicit publication confirmations. Preserve the original repository licensing boundaries.

Do not enable incomplete modules by removing their limitation labels. First provide the missing service, tests and authorization.
