# Changelog

This changelog records verifiable changes represented in the repository history.

## [Unreleased]

No entries yet.

## [0.4.0] - 2026-09-12

### Added

- Added the bilingual local Usage workbench settings page without replacing the original Token usage dashboard or session projection.
- Added no-model session diagnostics, immutable paginated usage receipts, and JSON/Markdown exports with identifier hiding enabled by default.
- Added versioned exact-route price cards, separate USD/CNY estimates, validity intervals, provider-timezone tariffs, context tiers, and explicit unknown/partial/range pricing states. Built-in route templates contain no unverified numeric prices.
- Added a separate bounded, persistent auxiliary analysis ledger for usage and trajectory analysis, including cumulative multi-call accounting, missing usage, cancellation, failures, restart recovery, export and confirmed clearing.
- Added complete-day 7/30/90-day arithmetic change attribution, primary projects and tags, and rolling 30-day Token and USD/CNY money budgets. Budgets never block or reroute tasks.
- Added immutable optimization experiments with paired task labels and explicit human acceptance, cache/tariff scenarios, numeric-only weekly JSON/SVG exports, and default-off same-page summary integration.
- Added Chromium acceptance covering the actual React workbench and Host RPC with disk-backed settings, synthetic DSH events and a synthetic model transport. Coverage includes save/reload, exports, privacy boundaries, conflict protection, keyboard controls and a 390-pixel Chinese interface.

### Fixed

- Matched the pinned DSH event union and observable snapshot APIs, and corrected React StrictMode cancellation and exact optional property handling.
- Prevented cumulative usage updates from double-counting and separate model calls from overwriting one another in the auxiliary ledger.
- Bound form controls to explicit accessible labels and rechecked sharing consent through the Host before publishing numeric summaries.
- Reconciled README descriptions of local storage, price cards, money budgets and auxiliary analysis accounting.

### Validation and boundaries

- Retained the fixed DSH `a66e4702047846cdaa10c66c9d3df3951f5ea70d` toolchain, Host/Client/config type checks, the full regression suite, repeated-build SHA-256 verification, package allowlist, and committed-bundle equality gate.
- Added 47 workbench regression tests; the complete suite contains 184 tests across 26 files. The browser script covers 10 workflow cases.
- Browser acceptance uses synthetic provider events and does not claim verification of a production DSH installation or a real provider invoice. Prices remain estimates; currencies are not added together.
- Marked generated bundles as generated files. Only the emitted client JavaScript is exempt from end-of-line whitespace lint, avoiding blind rewriting of dependency literals; authored source, source maps and build reproducibility checks remain enforced.

## [0.3.1] - 2026-09-02

### Added

- Added a security policy, contribution guide, structured issue forms, and a pull request checklist (`bb233a2`).
- Added fact-based release notes and README navigation for the new maintenance resources.

### Fixed

- Stabilized committed CSS bundles across Windows and Linux by replacing platform-sensitive path hashes with a plugin-scoped namespace (`4943e02`).
- Added exact class-name regression coverage and normalized CSS build input while retaining the repeated-build hash gate.

## [0.3.0] - 2026-08-31

### Added

- Added confirmed-output throughput indicators for the current session and all sessions (`c59f948`).
- Sampled every five seconds with a rolling window of up to ten seconds, while explicitly distinguishing request-completion usage pulses from per-token decoding speed.

## [0.2.0] - 2026-08-28

### Added

- Added date-by-provider/model projections and exact rolling Token budgets (`28f5ffc`).
- Added coverage and conservation gates for model-level trends, budgets, and exports.

### Security

- Hardened private RPC input validation, model-catalog recovery, analysis termination, cancellation, and CSV formula neutralization.

## [0.1.0] - 2026-08-14

### Added

- Added the initial persistent Token usage dashboard for DeepSeek Harness (`0ea9f74`).
- Added Host-side usage projection, Web client surfaces, GitHub-installable bundles, installation metadata, and regression tests.
