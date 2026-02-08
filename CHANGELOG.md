# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-08

### Added

- **Vulnerability Scanning** — scans current AND recommended deps via OSV database
  - Prevents "upgrade into a vulnerability" scenarios (unique to Next-Unicorn)
  - SARIF output for GitHub Code Scanning CI/CD integration
  - Severity filtering, fixable/unfixable classification
- **Auto-Update Existing Dependencies** — impact-scored version upgrades
  - Configurable update policy (patch/minor/major, pinned packages, min-age window)
  - Context7-powered breaking change detection via changelog verification
  - 7-dimension scoring + urgency classification (routine/recommended/urgent/critical)
  - Related package grouping (e.g. all `@babel/*` together)
- **PR Auto-Creation** — creates GitHub/GitLab PRs for updates and migrations
  - Conventional commit titles (`fix(deps):`, `chore(deps):`, `refactor(domain):`)
  - Rich markdown PR descriptions with impact tables, vulnerability details, reviewer checklists
  - Migration PRs with adapter code scaffolding for high-risk items
  - Existing PR deduplication (update instead of duplicate)
- 15 new property-based tests (Properties 15–29), bringing total to 29
- New Zod schemas: `VulnFindingSchema`, `UpdateItemSchema`, `PRResultSchema`, and more
- New templates: `vuln-report.md`, `update-plan.md`

### Changed

- Extended `InputSchema` with optional `updatePolicy` and `prPolicy` fields
- Extended `OutputSchema` with optional `vulnerabilityReport`, `updatePlan`, `pullRequests` sections
- Orchestrator pipeline expanded from 10 to 13 steps
- All new external clients (OSV, Registry, GitHub API) use injectable interfaces — zero new runtime deps
- Version bumped to 2.0.0

## [1.0.0] - 2026-02-05

### Added

- Initial release
- Pattern-based scanning across 68 Vibe Coding Domains (ISO 25010-aligned)
- Context7 MCP verification for every library recommendation
- 7-dimension impact scoring (scalability, performance, security, maintainability, feature richness, UX, UI aesthetics)
- Phased migration plans with adapter strategies for high-risk changes
- Deletion checklists with estimated lines saved
- UX completeness audit (8 categories: A11y, error/empty/loading states, form validation, etc.)
- Monorepo support (npm, pip, cargo, go)
- License compliance filtering
- Dependency conflict detection
- Peer dependency checking with semver validation
- 14 property-based tests with fast-check
- Serializer with JSON round-trip guarantee
- SKILL.md parser with YAML frontmatter round-trip
- Complete examples (frontend-nextjs, backend-node)
- Reusable templates (summary table, migration plan, deletion checklist, PRD)
