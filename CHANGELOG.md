# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-02-09

### Added

- **Ecosystem-level recommendations** — `LibraryRecommendation` now supports `rationale`, `ecosystem` (companion packages with roles), and `stackContext` fields, enabling AI agents to produce unicorn-grade solution stacks instead of single-library suggestions
- New `EcosystemPackage` type for companion packages (library + version + role)
- Output schema `RecommendedChange.recommendedLibrary` extended with `rationale`, `ecosystem`, and `stackContext` optional fields
- SKILL.md Step 3 rewritten to guide AI agents toward ecosystem-level thinking: "not just 'a library that does this', but the specific combination of tools that the best engineering teams ship with"

### Changed

- `LibraryRecommendation` interface extended (backward-compatible — new fields are optional)
- SKILL.md example now shows full ecosystem recommendation (@lingui/core + @lingui/macro + @lingui/cli + Crowdin TMS)
- Version bumped to 1.0.2

## [1.0.1] - 2026-02-09

### Changed

- **Architecture: Decouple detection from recommendation** — The pattern catalog no longer contains hardcoded library names, versions, licenses, best practices, or alternatives. Library recommendations are now provided dynamically by the caller via the `Recommender` callback, enabling AI agents to leverage their generalization ability and Context7 MCP for real-time, context-aware recommendations.
- **New `Recommender` type** — `analyze()` now requires a `recommender: (detection) => LibraryRecommendation | null` callback. Return `null` to skip false positives.
- **New `scanCodebase()` export** — Standalone scanner for AI agents to inspect detections before providing recommendations.
- **UX Auditor decoupled** — `recommendedLibrary` is no longer hardcoded per category; the auditor reports status (present/partial/missing) with factual rationale, leaving library choice to the AI agent.
- **Impact Scorer decoupled** — Removed 200+ line `DOMAIN_DIMENSION_AFFINITY` mapping and `DOMAIN_BASE_EFFORT` table. Scoring uses confidence-based defaults with optional `dimensionHints` and `baseEffortHours` overrides from the AI agent.
- **Migration Planner decoupled** — Removed `DOMAIN_MIGRATION_PRIORITY` mapping. Sorting within each risk phase uses file co-location + composite score. AI agents can influence ordering via scoring.
- **`Detection` type simplified** — Removed `suggestedLibrary` field. Detections now contain only what was detected (file, line range, pattern, confidence, domain).
- **`VerificationItem` type added** — `verifyAllRecommendations()` now accepts `Array<VerificationItem | null>` instead of `Detection[]`, decoupling verification from scanner output.
- **`AnalyzeResult` includes `scanResult`** — Success results now include raw `ScanResult` for AI agent further analysis.
- Pattern catalog reduced from 880 to 370 lines (detection-only, no recommendation data)
- SKILL.md rewritten to 150 lines following Anthropic SKILL spec principles (concise, high freedom for recommendations)
- Test count increased from 191 to 198

### Removed

- All hardcoded library recommendations from `PatternDefinition` (`suggestedLibrary`, `suggestedVersion`, `license`, `bestPractice`, `alternatives`)
- All hardcoded UX audit library recommendations and rationale strings
- `DOMAIN_DIMENSION_AFFINITY` (68-domain × 7-dimension static mapping)
- `DOMAIN_BASE_EFFORT` (25-domain effort estimate table)
- `DOMAIN_MIGRATION_PRIORITY` (domain tier ordering)

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
