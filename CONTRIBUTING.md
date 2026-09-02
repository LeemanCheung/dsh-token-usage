# Contributing

Thanks for helping improve `dsh-token-usage`.

This repository is distributed as a GitHub source plugin for DeepSeek Harness. It is marked private in `package.json` and is not published to npm. The committed `lib` bundles are part of the GitHub installation path.

## Project constraints

Preserve these properties:

- local-first storage and processing;
- explicit opt-in for AI analysis;
- private loopback RPC with bounded input validation;
- the four usage buckets: uncached input, output, cache reads, and cache writes;
- conservation gates that disable conclusions when attribution is incomplete;
- evidence-first reports that distinguish observations, hypotheses, and unavailable evidence;
- no conversation content, credentials, or private session data in commits, issues, or pull requests.

AI analysis must remain user-triggered. Do not add background profiling or silently switch the selected provider/model route. Public fee data must remain clearly labeled as an estimate rather than billing truth.

## Development environment

The plugin targets the DSH Web profile and the `0.1.0-rc.6` dependency line. CI currently uses Node.js `22.19.0`, pnpm `11.7.0`, and the pinned DSH revision declared in `.github/workflows/ci.yml`.

Keep the plugin checkout beside a compatible DeepSeek Harness checkout. Use the revision from `.github/workflows/ci.yml`, then install and build its workspace before linking packages into this repository:

```powershell
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm --dir ../deepseek-harness install --frozen-lockfile --ignore-scripts
pnpm --dir ../deepseek-harness run build:lib
node scripts/link-dsh-workspace.mjs ../deepseek-harness node_modules
```

For a local Web installation from the parent directory:

```powershell
dsh plugin --profile web add ./dsh-token-usage
```

## Checks before opening a pull request

Run the checks relevant to the change:

```powershell
npm run typecheck
npm test
npm run build
git diff --check
```

The current suite covers projection, aggregation, budgets, exports, analysis and RPC validation, report safety, browser history, throughput, and components.

For source or build changes, `npm run build` must leave the committed `lib` artifacts synchronized with the source. Do not edit generated bundles manually. CI also verifies repeated-build hashes, the package allowlist, and generated-artifact drift.

Documentation-only changes may omit runtime checks, but explain the omission in the pull request.

## Making changes

Keep changes focused and add or update tests for behavior changes. Update the relevant tests and documentation when changing:

- Token bucket accounting;
- provider/model or date aggregation;
- budget coverage and reliability gates;
- RPC input validation or authority;
- AI evidence payloads;
- trajectory metadata allowlists;
- browser-local history;
- public fee-rate calculations;
- generated bundle configuration.

When changing `src/pricing.ts`, review each affected public source, update the pricing baseline date and README text, and complete the documented Web-profile verification before release.

## Pull requests

Describe:

- the user-visible or maintenance impact;
- the affected DSH integration surface;
- tests and build checks performed;
- remaining manual or Web-profile verification;
- compatibility or migration considerations.

Do not include secrets, credentials, real prompts, model responses, private session contents, or unredacted logs.

A pull request is not evidence of release, deployment, SLA availability, legal compliance, or production adoption.
