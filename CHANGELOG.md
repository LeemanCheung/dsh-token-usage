# Changelog

This changelog records verifiable changes represented in the repository history.

## [Unreleased]

No entries yet.

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
