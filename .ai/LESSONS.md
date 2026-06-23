# LESSONS.md — Project Lessons Learned

> Document recurring mistakes and rules learned so future AI agents avoid repeating them.

---

## Lesson 1: Use Provider-Neutral Names for Abstraction Layers

- **Date**: 2026-06-22
- **Category**: Naming / Architecture

**Problem**: The AI chat service module was named `claude.ts`, implying a dependency on Anthropic's Claude. The project actually uses DeepSeek V4 Flash as primary AI provider. This caused confusion and made the codebase misleading.

**Rule**: Name service modules by their responsibility, not their vendor.

- Prefer `aiService.ts` over `deepseek.ts` or `claude.ts`.
- Prefer `deepgramService.ts` over `elevenLabsService.ts` when the provider changes but the function is the same.
- Prefer `voiceRecorder.ts` over `assemblyAIRecorder.ts` — the interface should be provider-agnostic.

**Example**:

```typescript
// BAD: Vendor-specific name
import { streamChat } from "./deepseek.js";

// GOOD: Responsibility-based name
import { streamChat } from "./aiService.js";
```

---

## Lesson 2: Always Resume AudioContext After Creation

- **Date**: 2026-06-22
- **Category**: Voice / Browser APIs

**Problem**: Browsers create `AudioContext` in a suspended state. Calling `getByteFrequencyData()` on a suspended context returns zeros, breaking silence detection and waveform visualization.

**Rule**: Always `await audioCtx.resume()` after `new AudioContext()`.

**Example**:

```typescript
// CORRECT
const audioCtx = new AudioContext();
if (audioCtx.state === "suspended") {
  await audioCtx.resume();
}
```

---

## Lesson 3: Never Revoke Cached Blob URLs

- **Date**: 2026-06-22
- **Category**: Voice / Performance

**Problem**: Calling `URL.revokeObjectURL()` on cached audio blob URLs poisons the cache. Subsequent reads silently fail because the blob URL is no longer valid.

**Rule**: Let the browser's garbage collector handle blob URL cleanup. Only revoke URLs that won't be reused.

---

## Lesson 4: Centralize AI Prompts — Never Hardcode

- **Date**: 2026-06-22
- **Category**: AI / Architecture

**Problem**: System prompts were embedded inside route handlers and chat logic, making it impossible to maintain a consistent personality. Each change required searching for hardcoded strings.

**Rule**: All AI prompts must live in `fastify/src/ai/prompts/`. Use `buildFullSystemPrompt()` as the single entry point. Buddy's personality is defined in exactly one file: `buddySystemPrompt.ts`.

---

## Lesson 5: Avoid pnpm-workspace.yaml in Standalone Packages

- **Date**: 2026-06-22
- **Category**: Build / Tooling

**Problem**: `pnpm-workspace.yaml` files made pnpm treat standalone packages as monorepo roots, requiring a `packages` field. This caused CI failures with "packages field missing or empty."

**Rule**: Remove `pnpm-workspace.yaml` from standalone packages. Use `.pnpmrc` for per-project pnpm configuration instead. Add `pnpm-workspace.yaml` to `.gitignore` to prevent accidental re-creation.

---

## Lesson 6: Lockfile Must Match Package.json Overrides

- **Date**: 2026-06-22
- **Category**: Build / CI

**Problem**: The `pnpm.overrides` field in `package.json` must match what's encoded in `pnpm-lock.yaml`. When they diverge, `pnpm install --frozen-lockfile` fails with "overrides configuration doesn't match."

**Rule**: Either remove the `pnpm.overrides` field or regenerate the lockfile after any change to it. In CI, `--frozen-lockfile` enforces strict matching.

---

## Lesson 7: Update All Imports When Renaming Files

- **Date**: 2026-06-22
- **Category**: Refactoring

**Problem**: Renaming a source file without updating all import statements breaks the build.

**Rule**: Use `git grep` to find every reference before renaming. Update imports in source code, documentation (`BUDDY.md`, `AGENTS.md`, skill files), and test files. Run `pnpm typecheck` after the rename.

---

## Lesson 8: Never Open Duplicate Development Servers

- **Date**: 2026-06-22
- **Category**: Development Workflow

**Problem**: Every time an AI agent restarts localhost, it opens new PowerShell windows. Old servers stay running on the same ports, causing conflicts. After multiple iterations, dozens of orphaned node processes accumulate.

**Rule**: Run `.\scripts\restart-dev.ps1` from the project root. This kills old processes on ports 3000/5173 before starting fresh servers in a single window. Never `Start-Process` a new terminal without closing the previous one.

**Correct**:

```powershell
.\scripts\restart-dev.ps1
```

**Incorrect**:

````powershell
Start-Process powershell -ArgumentList "pnpm dev"  # creates duplicate window
Get-Process -Name node | Stop-Process               # kills unrelated processes

---

## Lesson 10: Internal AI Cost Analytics Are Not User-Facing

- **Date**: 2026-06-23
- **Category**: Security / UX

**Problem**: The AI usage dashboard exposed DeepSeek token costs and provider pricing to normal users. This is business/internal data, not customer information.

**Rule**: Internal cost/profit analytics must never appear in normal user-facing UI. Create separate admin endpoints (
ole === 'admin') for financial data. Users should only see feature usage counts.


---

## Lesson 11: Never Attach Global Feature State to Arbitrary Chat Messages

- **Date**: 2026-06-23
- **Category**: State Management / Architecture

**Problem**: The frontend's history loading code called `api.budgets()`, fetched ALL user budgets, and unconditionally attached the most recent budget to the last assistant message in chat. This caused budget cards to appear under messages about voice/tone/settings. The bug survived multiple fixes because only surface-level rendering guards were applied without tracing the data source.

**Rule**: Chat attachments (budgets, transactions, etc.) must be **message-scoped** and created only from **explicit backend events** (SSE `type: 'budget'`, etc.). Never attach global feature state (latest budget, latest transaction) to arbitrary chat messages. If data isn't tied to a specific message ID through a dedicated event, it does not belong on that message.

**Correct** — SSE event handler, attaches only to the message that generated it:
```typescript
if (data.type === 'budget') {
  setMessages((prev) => prev.map((m) =>
    m.id === assistantMsg.id ? { ...m, budgets: [budget] } : m
  ));
}
````

**Incorrect** — History loader, attaches latest global budget to last message:

```typescript
const latestBudget = await api.budgets();
lastAssistantMsg.budgets = [latestBudget];
```

---

## Lesson 12: Run ESLint, Prettier, and TypeScript Check Before Completing Backend Work

- **Date**: 2026-06-23
- **Category**: Quality Assurance

**Problem**: ESLint CI failed on empty catch {} blocks and unused variable assignments. These are caught by CI but waste time with re-push cycles.

**Rule**: Before reporting any backend task as complete, run:

1.  px eslint . � 0 errors
2.  px prettier --check . � all files formatted
3.  pnpm typecheck � 0 errors

For frontend:
px prettier --check . and pnpm typecheck (eslint optional).

Empty catch blocks must either handle the error with logging or have an inline comment explaining why they are intentionally ignored.

---

## Lesson 13: Run ESLint, Prettier, and TypeScript Check Before Completing Frontend Work

- **Date**: 2026-06-23
- **Category**: Quality Assurance

**Problem**: Frontend ESLint CI failed due to circular function dependencies in voice components, unused imports, and empty catch blocks.

**Rule**: Before reporting any frontend task as complete, run:

1.  px eslint . � 0 errors, 0 warnings
2.  px prettier --check . � all files formatted
3.  pnpm typecheck � 0 errors
4.  pnpm build � build succeeds

For voice components with circular dependencies between startListening/speak/ hink/onTranscribe: use useRef function refs (startListeningRef, speakRef, hinkRef) with useEffect to update them, breaking the cycle while keeping React hook rules satisfied.

---

## Lesson 14: Set Realistic Bundle Size Budgets for the Product

- **Date**: 2026-06-23
- **Category**: Performance

**Problem**: CI failed with a 100KB bundle budget that was unrealistic for a full AI assistant application with chat, voice, documents, memory, tools, and settings. After implementing route-based lazy loading, the initial chunk was still 255KB � well above the arbitrary 100KB limit but reasonable for the app shell.

## **Rule**: Set bundle budgets based on measured app size after optimization, not arbitrary targets. A full AI assistant app: initial shell = 300KB, lazy chunks = 250KB is realistic. Optimize first (lazy loading, tree shaking), then set the limit.

## Lesson 15: Debug CI Validation Scripts That Wrap/Generate Temporary Configs

- **Date**: 2026-06-23
- **Category**: CI / Debugging
  **Problem**: CI validation scripts (like `validate-nginx-config.sh`) wrap source config files in temporary wrapper blocks for syntax checking. When `nginx -t` reports an error at a line number inside the _generated_ temp config, the line number maps to the wrapper + source file, not just the source file directly. Without debug output, it's impossible to know whether the error came from the source config or the wrapper script itself.
  **Rule**: Add debug output to CI validation scripts that print:

1. The path of the generated temp config
2. A grep of relevant directives in the generated config (to prove they came from source vs. wrapper)
3. The directory listing of the temp dir
   This proves what `nginx -t` is actually validating and makes failures immediately traceable to the correct file and line.
   **Correct** (debug before validation):

```bash
echo "--- DEBUG: temp config = $TMPDIR/nginx.conf"
grep -n 'http2' "$TMPDIR/nginx.conf" || echo "  (none)"
ls -la "$TMPDIR/"
if nginx -t -c "$TMPDIR/nginx.conf" -p "$TMPDIR" 2>&1; then
  echo "nginx config is valid."
```

---

## Lesson 16: Rewrite Absolute Include Paths in CI Validation Wrappers

- **Date**: 2026-06-23
- **Category**: CI / Nginx
  **Problem**: The nginx validation script wraps the source server block in an `http {}` block for `nginx -t` validation. The source config uses absolute production paths like `include /etc/nginx/conf.d/security-headers.inc;` which exist inside Docker but not on the CI runner's filesystem. Even though the validation script copies the include file to the temp dir, nginx still looks for it at the production path and fails with "No such file or directory."
  **Rule**: After writing the temp config, use `sed` to rewrite production include paths to temp dir paths. The source config keeps production paths unchanged — only the generated temp copy is modified.
  **Correct**:

```bash
cp "$NGINX_SECURITY" "$TMPDIR/security-headers.inc"
cat "$NGINX_CONF" >> "$TMPDIR/nginx.conf"
echo "}" >> "$TMPDIR/nginx.conf"
sed -i "s|include /etc/nginx/conf.d/security-headers\.inc;|include $TMPDIR/security-headers.inc;|g" "$TMPDIR/nginx.conf"
```

---

## Lesson 17: Generate Dummy Certificates for SSL Config Validation in CI

- **Date**: 2026-06-23
- **Category**: CI / Nginx / SSL
  **Problem**: After fixing include paths, nginx `-t` failed because the config references SSL certificate files (`ssl_certificate`, `ssl_certificate_key`, `ssl_trusted_certificate`) at production paths like `/etc/nginx/ssl/fullchain.pem` that exist in Docker but not on the CI runner. Nginx's syntax check requires the certificate files to exist even though it only validates syntax.
  **Rule**: For CI validation of SSL-enabled nginx configs, generate temporary self-signed dummy certs and rewrite the paths in the generated temp config only. Never modify the production source file.
  **Correct**:

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$TMPDIR/privkey.pem" \
  -out "$TMPDIR/fullchain.pem" \
  -days 1 -subj "/CN=localhost" 2>/dev/null
sed -i "s|/etc/nginx/ssl/fullchain\.pem|$TMPDIR/fullchain.pem|g" "$TMPDIR/nginx.conf"
sed -i "s|/etc/nginx/ssl/privkey\.pem|$TMPDIR/privkey.pem|g" "$TMPDIR/nginx.conf"
```

---

## Lesson 18: Set Adequate worker_connections in Nginx Validation Wrappers

- **Date**: 2026-06-23
- **Category**: CI / Nginx
  **Problem**: Nginx config validation failed with `1 worker_connections are not enough for 2 listening sockets`. The validation wrapper used `events { worker_connections 1; }` which is insufficient when the server block listens on multiple ports (80 + 443). Nginx requires at least 1 connection per listening socket.
  **Rule**: Set `worker_connections` to at least 1024 in validation wrapper configs. The production nginx binary uses its own `nginx.conf` with adequate defaults — this only affects the CI validation wrapper.
  **Correct**:

```nginx
events { worker_connections 1024; }
```

---

## Lesson 19: Rewrite Privileged Ports for Nginx Validation in CI

- **Date**: 2026-06-23
- **Category**: CI / Nginx
  **Problem**: `nginx -t` failed with `bind() to 0.0.0.0:80 failed (13: Permission denied)`. The CI runner cannot bind privileged ports 80/443. Production Docker containers use `CAP_NET_BIND_SERVICE`.
  **Rule**: Rewrite listen ports from 80→8080 and 443→8443 in the generated temp config only. Production config keeps privileged ports unchanged.
  **Correct**:

```bash
sed -i "s|listen 80;|listen 8080;|g" "$TMPDIR/nginx.conf"
sed -i "s|listen 443 |listen 8443 |g" "$TMPDIR/nginx.conf"
```

---

## Lesson 20: Separate Local and Cloud Start Scripts for Render Deployments

- **Date**: 2026-06-23
- **Category**: Deployment / Render
  **Problem**: Using `--env-file=.env` in the `start` script works for local testing but fails on Render where env vars are set via the dashboard (no `.env` file exists on Render's filesystem). Node would fail with "ENOENT: no such file or directory, open '.env'".
  **Rule**: Use `node dist/server.js` for the `start` script (cloud deployment). Add a separate `start:local` script with `node --env-file=.env dist/server.js` for local production-like testing. Render sets `PORT`, `DATABASE_URL`, and all secrets via env vars.
  **Correct**:
  ```json
  "start": "node dist/server.js",
  "start:local": "node --env-file=.env dist/server.js"
  ```

---

## Lesson 21: Never Auto-Push to a Production-Deployed Repo

- **Date**: 2026-06-23
- **Category**: Deployment / Workflow
  **Problem**: Buddy is deployed to production on Render. GitHub main triggers auto-deploy. Pushing unfinished code breaks production immediately — users see 500 errors, broken features, or stalled deployments.
  **Rule**: Never commit or push without explicit user approval. The workflow is: modify code locally → developer tests on localhost → provide final report → wait for approval → then commit/push.
  **Every final report must include**:
  1. Files changed
  2. Local testing instructions
  3. Whether database changes are required
  4. Whether Render redeploy is required

---

## Lesson 22: Do Not Modify Production Database Without Request

- **Date**: 2026-06-23
- **Category**: Deployment / Database
  **Problem**: The Neon production database contains real user data. Schema changes pushed directly to production can break features, cause data loss, or interrupt running services.
  **Rule**: Database changes must be explicitly requested by the user. Always test schema changes locally with `pnpm db:push` against a local PostgreSQL. Only apply to production after approval.
