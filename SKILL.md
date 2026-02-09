---
name: analyze-and-recommend-third-party-optimizations
description: >-
  Scan a codebase to identify hand-rolled implementations that should be replaced
  by third-party libraries, identify missing capabilities, and detect code
  organization issues (directory structure, naming, circular deps, barrel bloat).
  Produce structured migration plans with Context7-verified recommendations.
  Use when analyzing technical debt, auditing dependency health, reviewing
  hand-rolled code, planning library migrations, assessing capability gaps,
  or auditing project structure and module organization.
---

# Analyze and Recommend Third-Party Optimizations

## Architecture

```
Scanner (deterministic)          →  AI Agent (generative)           →  Pipeline (deterministic)
1. Regex: detect hand-rolled code   1. Recommend library replacements    Score, plan, audit,
2. FS: detect code org issues       2. Identify capability gaps          filter, serialize
   (god-dirs, circular deps,        3. Recommend org patterns + tooling
    naming, barrel bloat)            using knowledge + Context7
```

**Design constraints**:
- No hardcoded library recommendations — evaluate project context dynamically
- Two analysis modes: **replacement** (hand-rolled code found) and **gap** (capability missing entirely)
- **Human-in-the-loop**: 4 gates at irreversible, preference-driven, or costly decision points
- **Language**: all output (gates, tables, recommendations, rationale) MUST match the user's input language. If user writes in Chinese, respond in Chinese. If English, respond in English. Never mix.

## Gate Protocol

Present structured choices at gates. NEVER skip or proceed without user response.

**Format** — table of findings/options + lettered choices + your recommendation with 1-sentence rationale. For high-impact gates, add a SWOT table. See `references/code-organization-workflow.md` for full Gate examples.

**Rules**:
- If user says "do it all automatically", ask "confirm skip ALL gates?" first
- After user decides, execute automatically and report results with rollback instructions

## Standard Operating Procedure

### Step 1: Validate Input

Parse and validate `InputSchema` JSON via Zod. Read `src/schemas/input.schema.ts` for the full schema.

### Step 2: Scan Codebase

Run `scanCodebase(input)`. The scanner:

1. Detect workspace roots for monorepo support
2. Match code against 30+ domain patterns (i18n, auth, state-management, code-organization, etc.)
3. Run structural analysis: design system layers (monorepo), code organization (all projects)
4. Return `ScanResult` with:
   - `detections` — hand-rolled code patterns found
   - `structuralFindings` — architectural + code organization issues
   - `codeOrganizationStats` — project-wide metrics (file counts, naming conventions, circular dep count)
   - `workspaces` — monorepo workspace info

Detections and findings contain no recommendations — only facts.

### GATE 1: Triage Detections

**Why**: Each accepted detection costs a Context7 verification call. False positives waste quota.

Present scan results as a triage table with columns: #, Domain, Pattern, File, Confidence, Action. Offer options: (A) accept all, (B) skip specific numbers, (C) high-confidence only. See `references/code-organization-workflow.md#gate-1-triage-example` for format.

Wait for user response. Proceed with accepted detections only.

### Step 2.5: Gap Analysis (AI Agent)

Analyze what the project is **missing entirely**:

1. **Installed dependencies** — low-level tools that should be upgraded to platform-level solutions
2. **Monorepo structure** — missing architectural layers (e.g., shared token package, shared config preset)
3. **Cross-cutting concerns** — absent capabilities: structured logging, error monitoring, rate limiting, transactional email, type-safe API layer
4. **Architecture patterns** — opportunities for multi-package solutions (e.g., design-tokens → tailwind-config → ui)

Analyze at three levels: **single library gap**, **ecosystem gap**, **architecture gap**.

Provide each gap as a `GapRecommendation`. Read `src/index.ts` for the interface.

**Design system gaps** — two paths:
- **No existing frontend**: Read `references/design-system-sources.md` for curated repos and sparse-checkout workflow.
- **Existing frontend**: Read `references/design-system-extraction.md` for extraction workflow, then `references/design-system-sources.md` for implementation.

### Step 2.7: Code Organization Analysis

#### Phase A — Collect facts (MUST use tools, DO NOT estimate)

You cannot infer file counts, naming conventions, or import cycles from knowledge. You MUST read the filesystem.

**If using the npm library** — `scanResult.structuralFindings` and `scanResult.codeOrganizationStats` already contain all findings. Skip to Phase B.

**If not** — run the shell commands in `references/code-organization-workflow.md#phase-a-shell-commands-for-collecting-facts`.

Record each finding with: **directory/file path, count, type**. These are facts.

#### Phase B — Recommend solutions (use your knowledge + Context7)

For each finding, apply the MUST do / MUST NOT do decision tree in `references/code-organization-workflow.md#phase-b-decision-tree`. Do NOT recommend tools without Context7 verification.

For worked examples showing the full Fact → Read → Recommend flow, see `references/code-organization-workflow.md#phase-b-worked-examples`.

**Skip rules** — skip a finding if:
- Directory is in `tests/`, `__tests__/`, `__mocks__/`, `fixtures/`, `generated/`, `.storybook/`
- File is auto-generated (has `// @generated` or `/* eslint-disable */` at top)
- Directory has <3 files (too few to judge)

### GATE 2: Code Organization Preferences

**Why**: Organization pattern and naming convention are team preferences, not technical correctness.

Present only if structural findings exist. For each preference, present a SWOT comparison with lettered options. See `references/code-organization-workflow.md#gate-2-swot-examples` for format.

Wait for user response on each preference. Proceed to Step 3 with confirmed choices.

### Step 3: Recommend Solutions (AI Agent)

For each accepted detection, recommend a **solution**:

1. **Stack coherence** — consider how libraries fit the project's overall stack
2. **Ecosystem composition** — recommend companion libraries that work together
3. **Rationale** — explain WHY this choice fits this project's framework, runtime, and scale
4. **Anti-patterns** — what NOT to use and why
5. **Alternatives** — different solutions for different architectural contexts
6. **Migration snippet** — read the detected code (file path + line range) and generate before/after examples
7. **Context7 verification** — call `resolve-library-id` + `query-docs` to confirm existence and get latest docs

Read `src/index.ts` for the `LibraryRecommendation` interface. Return `null` to skip a detection.

**Skip a detection if**:
- Code has comments explaining why it is custom
- Detection is in test/mock/fixture files
- Library is already in project dependencies (suggest version update instead)
- Hand-rolled code is simpler than the library (3-line utility vs 50KB dep)

### GATE 3: Accept/Reject Recommendations

**Why**: Each recommendation has real migration cost. User may have business, timeline, or architectural reasons to defer or reject.

Present ALL recommendations (replacements + gaps + code org tooling) as a decision table with columns: #, Domain, Replace what, With what, Risk, Files (affected count), Context7, Decision. Offer options: (A) accept all, (B) accept specific, (C) low-risk only, (D) defer all. See `references/code-organization-workflow.md#gate-3-recommendation-table-example` for format.

Wait for user response. Rejected items are excluded from migration plan, scoring, and PRs.

### Step 4–7: Score, Plan, Audit, Serialize

The pipeline handles these automatically:
- **Scoring**: confidence-based dimension scores (overridable via `dimensionHints`)
- **Migration plan**: auto-grouped by risk (low/medium/high), sorted by file co-location
- **UX audit**: provide via `uxAudit` option. Evaluate 8 categories (accessibility, error/empty/loading states, form validation, performance feel, copy consistency, design system alignment)
- **Constraints**: license allowlist filtering, dependency conflict detection, JSON serialization

### Optional Steps

- **Step 8**: Vulnerability scan via OSV database (`vulnClient`)
- **Step 9**: Auto-update existing dependencies (`registryClient`)
- **Step 10**: PR auto-creation via GitHub/GitLab (`platformClient` + `gitOps`)

### GATE 4: Before Irreversible Actions

**Why**: Creating PRs pushes branches to remote and notifies team members. File migrations modify the codebase. Both are irreversible.

Present only if Step 10 or file migration is about to execute. Show PR table and file migration table with rollback commands. Offer options: (A) execute all, (B) PRs only, (C) migration only, (D) dry run, (E) abort. See `references/code-organization-workflow.md#gate-4-execution-confirmation-example` for format.

Wait for user response. After execution, report results with rollback instructions.

## MCP Integration

Prefer MCP tools when available; fall back to shell commands if not.

- **Context7 MCP** (required) — `resolve-library-id` + `query-docs` for library verification
- **GitHub MCP** (preferred for PRs) — structured PR create/update/query; fallback: `gh` CLI
- **Git MCP / GitKraken MCP** (preferred for scaffold) — structured repo browse/sparse-checkout; fallback: `git` CLI

## Output

Single `OutputSchema` JSON containing:
- `recommendedChanges` — replacement recommendations with scores, verification, adapter strategies
- `gapAnalysis` (optional) — missing capabilities with prioritized recommendations
- `filesToDelete` — file paths to remove after migration
- `linesSavedEstimate` — total lines saved
- `uxAudit` — UX completeness checklist (8 categories)
- `migrationPlan` — phased plan with deletion checklist
- `vulnerabilityReport` (optional)
- `updatePlan` (optional)
- `pullRequests` (optional)

Read `src/schemas/output.schema.ts` for the full schema.
