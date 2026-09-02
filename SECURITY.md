# Security Policy

## Scope

This policy covers the `dsh-token-usage` plugin, including its Host code, Web client, committed build artifacts, local settings, browser history storage, private loopback RPC, and the data boundaries used by on-demand analysis.

The plugin is currently documented for the DeepSeek Harness Web profile and the `0.1.0-rc.6` dependency line. Issues in DeepSeek Harness itself, provider APIs, provider infrastructure, or a deployment environment should also be reported to the relevant upstream project or provider.

## Supported versions

Support is evaluated against the current default branch. Older commits or package versions must not be assumed fixed; a security advisory will identify affected and fixed versions when that information is available. Backports are not guaranteed.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/LeemanCheung/dsh-token-usage/security/advisories/new>

Do not include credentials, access tokens, prompts, model responses, session contents, private URLs, or other sensitive data in a public issue. If private reporting is unavailable, contact the repository maintainer through GitHub to request a private channel; do not publish exploit details first.

Please include, where safe:

- the affected plugin version or commit;
- the affected DSH version and Web profile;
- operating system and runtime details;
- a concise impact description;
- minimal reproduction steps;
- logs or screenshots after removing secrets and private session data.

There is no guaranteed response time, remediation timeline, or backport commitment.

## Data-boundary notes

The plugin is local-first. Its persistent projection stores usage statistics rather than conversation content. On-demand aggregate analysis receives a bounded aggregate DTO. Trajectory analysis receives allowlisted metadata and Token buckets rather than prompts, responses, titles, paths, tool arguments, or raw provider/model identifiers.

Private plugin RPC handlers require loopback authority and validate bounded inputs before reading sessions or invoking a model adapter. Browser history is local to the current browser profile and is capped as documented in the README. Public price calculations are planning estimates, not provider billing records.

These controls are implementation boundaries, not a promise that every deployment or dependency is risk-free. Report any observed violation privately, including:

- content or credential disclosure outside the documented allowlist;
- bypasses of loopback RPC authority or input bounds;
- unsafe Markdown, CSV, or browser rendering behavior;
- corrupted accounting that defeats the documented conservation gates;
- supply-chain or generated-bundle integrity problems.

Provider availability, model quality, and ordinary public-price drift are not security vulnerabilities, but they may still be reported as normal bugs.

## Disclosure

Please allow reasonable time to investigate and prepare a fix or advisory before public disclosure. Coordinated disclosure is requested, but no fixed disclosure schedule is guaranteed.
