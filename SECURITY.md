# Security Policy

PGAutoPilot is a PostgreSQL MCP server, and we take the security of the
server, the dashboard, and everyone who depends on them seriously. This
document describes how to report vulnerabilities and what security
guarantees the project makes.

## Reporting a Vulnerability

**Do not open a public issue for security problems.**

Please report privately using GitHub's private vulnerability reporting:

**https://github.com/cyberreinxy/pgautopilot/security/advisories/new**

When reporting, please include:

- Package and affected version(s) - `pgautopilot` server and/or dashboard
- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept, if it's safe to share
- Any suggested mitigation, if you have one

### Response Timeline

| Stage | Target |
| --- | --- |
| Acknowledgment | Within 72 hours |
| Triage and initial assessment | Within 7 days |
| Fix and release | Severity-dependent; critical issues are patched as fast as the release pipeline allows |

We'll keep you updated as we work through triage, and we're happy to credit
reporters in the release notes unless you'd prefer to stay anonymous.

## Supported Versions

| Version | Supported |
| --- | --- |
| latest (2.1.x) | Yes |
| older | No |

Only the latest release line receives security patches. We recommend
staying current with releases, especially given the weekly dependency
update cadence described below.

## Built-in Security Model

PGAutoPilot is designed defensively, on the assumption that it will be
pointed at real production databases:

- **`--readonly` mode** - enforced on every write path, including
  `db_raw_query`
- **Write tiers** - `BLOCKED_TABLES` (absolute deny) and `HIGH_RISK_TABLES`
  (warn-but-allow), so destructive access is explicit and configurable
  rather than all-or-nothing
- **Sensitive data handling** - known sensitive columns are redacted on
  read and stripped on write
- **`db_raw_query` guards** - single-statement only, no access to auth
  catalogs, no dangerous functions, a mandatory terminal `LIMIT`, and
  execution inside a read-only transaction with a statement timeout
- **Parameterized SQL** - user input is never interpolated directly into
  SQL
- **Signed releases** - GPG-signed checksums; verify release artifacts
  against `PUBLIC_KEY.asc`

## Zero-Day Posture

Unknown vulnerabilities can't be prevented outright, but the project is
set up to catch and patch them quickly:

- CI runs `npm audit` / `pnpm audit` on production dependencies and
  **blocks releases** that introduce high-severity issues
  (`server: npm run security`, `web: pnpm security`)
- Dependabot opens dependency-update PRs weekly, so upstream fixes land
  automatically rather than waiting on manual review
- The release runbook (build → verify → sign → publish) is documented
  internally so a patch can ship as soon as it's ready, without process
  friction slowing it down

## Scope

This policy covers the `pgautopilot` MCP server and its bundled dashboard.
Vulnerabilities in third-party dependencies should generally be reported
upstream as well, but we'd still like to hear about them here so we can
track exposure and ship an update.