# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.8] - 2026-02-09

### Added

- **Human-in-the-loop Gate Protocol** — 4 explicit decision gates at irreversible, preference-driven, or costly decision points:
  - Gate 1: Triage detections before Context7 verification (saves quota)
  - Gate 2: Code organization preferences with SWOT analysis (team preferences)
  - Gate 3: Accept/reject/defer recommendations (migration cost decisions)
  - Gate 4: Confirm before PR creation and file migration (irreversible actions)
- New `references/code-organization-workflow.md` — progressive disclosure reference with Gate examples, Phase A/B decision tree, and worked examples

### Changed

- SKILL.md refactored from 400 to 188 lines — verbose Gate/code-org examples extracted to references/ per progressive disclosure spec
- Removed stale `org-mixed-export-style` reference from Phase A (pattern was moved to structural analyzer)
- Gate Protocol compressed from 35 lines to 8 lines (meta-info)
- All instructions converted to imperative voice per skill spec

## [1.0.7] - 2026-02-09

### Added

- **Code Organization Analysis** — new deterministic module that detects structural code organization issues via filesystem traversal. Claude cannot infer these from knowledge alone.
  - `god-directory` — directory with >15 source files (should split by feature/domain)
  - `mixed-naming-convention` — files in same directory using different naming styles
  - `deep-nesting` — directory tree exceeding 5 levels from `src/`
  - `barrel-bloat` — index file with >10 re-exports
  - `catch-all-directory` — `utils/helpers/shared/common/lib` with >10 files
  - `circular-dependency` — import cycles detected via DFS graph traversal
  - `mixed-export-style` — files mixing default export with 3+ named exports
- 3 new scanner patterns in `code-organization` domain:
  - `org-deep-relative-import` — imports traversing 3+ parent directories
  - `org-barrel-reexport-wildcard` — `export * from` in index files
  - `org-catch-all-utils-import` — imports from catch-all utils/helpers directories
- New `code-organization` domain in `VibeCodingDomain` enum (69 total domains)
- New `codeOrganizationStats` field in `ScanResult` (file counts, naming conventions, circular dep count)
- New `analyzeCodeOrganization()` standalone export for programmatic use
- SKILL.md Step 2.7 with Phase A (deterministic) / Phase B (generative) dual-phase design, MUST/MUST NOT decision table, 3 concrete examples, and skip rules
- 29 new tests (176 total) covering all scanner patterns and structural analysis rules

### Changed

- `StructuralFinding.type` extended with 6 new code organization types + optional `metadata` field
- Code organization analysis runs for ALL projects (not just monorepos, unlike design system analysis)
- Architecture diagram in SKILL.md updated to reflect two-track scanner (regex + filesystem)
- Scanner step description expanded to list all `ScanResult` fields explicitly

## [1.0.3] - 2026-02-09

### Added

- **Gap Analysis** — AI agent can now identify capabilities the project is MISSING entirely, not just hand-rolled code to replace. New `GapRecommendation` type with `domain`, `description`, `recommendedLibrary`, and `priority` (critical/recommended/nice-to-have).
- New `gaps` option in `AnalyzeOptions` — AI agent provides gap recommendations alongside scanner-based detections.
- New `gapAnalysis` field in `OutputSchema` — gap recommendations appear in the output alongside `recommendedChanges`.
- New `GapRecommendationSchema` Zod schema with full validation.
- SKILL.md Step 2.5: Gap Analysis guidance for AI agents.
- 3 new gap analysis tests (202 total).

### Changed

- `LibraryRecommendation` enriched with optional `rationale`, `ecosystem`, `antiPatterns`, `alternatives` fields — AI agent can express ecosystem-level solutions (e.g., Lingui + TMS + compile-time extraction).
- `RecommendedChange.recommendedLibrary` output schema widened to match enriched `LibraryRecommendation`.
- SKILL.md Step 3 renamed "Recommend Solutions" — guides AI agent to think at ecosystem level.
- Summary table template updated to render rationale, ecosystem, anti-patterns, and alternatives.
- README updated with gap analysis, ecosystem recommendations features and API docs.

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
