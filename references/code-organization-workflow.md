# Code Organization Workflow Reference

Detailed examples and decision guidance for Step 2.7 and Gates 1–4. Read this file when processing code organization findings or presenting Gate choices.

## Table of Contents

- [Phase A: Shell commands](#phase-a-shell-commands-for-collecting-facts)
- [Phase B: Decision tree](#phase-b-decision-tree)
- [Phase B: Worked examples](#phase-b-worked-examples)
- [Gate 1: Triage example](#gate-1-triage-example)
- [Gate 2: SWOT examples](#gate-2-swot-examples)
- [Gate 3: Recommendation table](#gate-3-recommendation-table-example)
- [Gate 4: Execution confirmation](#gate-4-execution-confirmation-example)

---

## Phase A: Shell commands for collecting facts

Run these when NOT using the npm library. Each command collects one type of fact.

```bash
# 1. God directories: find directories with >15 source files
find src -type d -exec sh -c 'count=$(find "$1" -maxdepth 1 -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) | wc -l); [ "$count" -gt 15 ] && echo "$1: $count files"' _ {} \;

# 2. Mixed naming: list filenames per directory
ls -1 src/components/

# 3. Deep nesting: find directories >5 levels deep from src/
find src -mindepth 6 -type d

# 4. Barrel bloat: count re-exports in index files
grep -c "export.*from" src/**/index.ts

# 5. Catch-all directories: count files in utils/helpers/shared
find src/utils src/helpers src/shared src/common src/lib -maxdepth 1 -type f 2>/dev/null | wc -l

# 6. Circular dependencies
npx madge --circular --extensions ts,tsx src/

# 7. Deep relative imports
grep -rn "from ['\"]\.\.\/\.\.\/\.\.\/" src/ --include="*.ts" --include="*.tsx"
```

---

## Phase B: Decision tree

For each finding, apply the MUST do / MUST NOT do rules:

| Finding type | You MUST do | You MUST NOT do |
|---|---|---|
| `god-directory` | Read the files in that dir, group by domain, recommend split. Reference: Next.js App Router colocation, Linear feature-packages. | Guess file count. Say "probably too many files." |
| `mixed-naming-convention` | Check project framework, pick ONE convention. Next.js pages=kebab, React components=PascalCase, utils=camelCase. | Recommend "both are fine." Must pick one. |
| `deep-nesting` | Recommend `@/` path aliases. Read `tsconfig.json` to check if paths already exist. Generate the config change. | Say "consider flattening" without generating the actual config. |
| `barrel-bloat` | Recommend direct imports or namespace imports. Context7 verify `knip` for dead export detection. | Ignore it. Barrel bloat causes tree-shaking failures. |
| `catch-all-directory` | Read the actual files, group by domain (date, string, validation, etc.), recommend specific directory structure. | Say "split by concern" without reading what's actually in the files. |
| `circular-dependency` | Read the files in the cycle, understand WHY they import each other, recommend dependency inversion or extract shared module. Context7 verify `eslint-plugin-import`. | Just say "remove circular deps." Must explain the refactoring. |
| `org-deep-relative-import` | Same as `deep-nesting` — recommend path aliases. | Skip it. |
| `org-barrel-reexport-wildcard` | Recommend named re-exports `export { X } from` instead of `export *`. Explain namespace pollution risk. | Ignore it. |
| `org-catch-all-utils-import` | Same as `catch-all-directory` — recommend domain-specific modules. | Skip it. |

---

## Phase B: Worked examples

### Example 1 — god-directory

```
Fact: src/components/ has 23 source files
```

Read those 23 files. You find: Button, Card, Modal, Table, Form, Input, Select, Checkbox...

Recommend:
```
src/components/
├── ui/          ← primitives (Button, Input, Select, Checkbox)
├── data/        ← data display (Table, Card, DataGrid)
├── overlay/     ← overlays (Modal, Dialog, Drawer, Tooltip)
└── form/        ← form elements (Form, FormField, FormError)
```
Reference: shadcn/ui organizes by interaction type. Radix UI uses similar grouping.

### Example 2 — circular-dependency

```
Fact: src/auth/session.ts → src/db/user.ts → src/auth/session.ts
```

Read both files. You find: `session.ts` imports `getUserById`, `user.ts` imports `getSession` for auth checks.

Recommend: Extract `src/auth/types.ts` with shared interfaces. Both files import from types instead of each other. Context7 verify `eslint-plugin-import/no-cycle`.

### Example 3 — mixed-naming

```
Fact: src/utils/ has kebab-case (5 files) + camelCase (3 files)
```

Check package.json — framework is Next.js — convention is kebab-case for files.

Recommend: Rename the 3 camelCase files. Context7 verify `eslint-plugin-unicorn/filename-case` for CI enforcement.

---

## Gate 1: Triage example

```
GATE 1: Triage — Review scan results before analysis
─────────────────────────────────────────────────────

Found 12 detections and 4 structural findings:

| # | Domain | Pattern | File | Confidence | Action |
|---|--------|---------|------|:----------:|--------|
| 1 | i18n | manual-pluralization | src/utils.ts:12 | 0.70 | Accept |
| 2 | observability | manual-logging | src/service.ts:8 | 0.55 | Skip (test file) |
| 3 | code-organization | god-directory | src/components/ (23 files) | — | Accept |
| 4 | code-organization | circular-dependency | auth→db→auth | — | Accept |

Pre-filtered: 3 detections auto-skipped (test/fixture/generated files)

Options:
  A) Accept all 12 detections → proceed to analysis
  B) Review and mark specific detections to skip (list numbers)
  C) Only analyze high-confidence detections (>=0.7)

Recommendation: A — accept all, I'll skip obvious false positives in Step 3.
```

---

## Gate 2: SWOT examples

### Organization pattern SWOT

```
Finding: src/components/ has 23 files (god-directory)

| Option | Strengths | Weaknesses | Opportunities | Threats |
|--------|-----------|------------|---------------|---------|
| A) Feature-based (Next.js/Linear) | Colocation: each feature self-contained | Harder to share primitives across features | Aligns with App Router conventions | Feature boundaries may blur over time |
| B) Interaction-based (shadcn/Radix) | Clear UI taxonomy (ui/data/overlay/form) | Features scattered across categories | Familiar to component library users | May not scale for domain-heavy apps |
| C) Hybrid: features + shared ui/ | Best of both: features own logic, ui/ owns primitives | Two organizational concepts to learn | Progressive: start with ui/, add features later | Needs team discipline to avoid drift |

Recommendation: C — hybrid approach matches your Next.js stack.
```

### Naming convention comparison

```
Finding: src/utils/ has mixed naming (kebab-case: 5, camelCase: 3)

| Option | Convention | Rename count | CI enforcement |
|--------|-----------|:------------:|---------------|
| A) kebab-case | format-date.ts | 3 files | eslint-plugin-unicorn/filename-case |
| B) camelCase | formatDate.ts | 5 files | eslint-plugin-unicorn/filename-case |
| C) PascalCase | FormatDate.ts | 8 files | eslint-plugin-unicorn/filename-case |

Recommendation: A — kebab-case, aligns with Next.js conventions (fewer renames).
```

---

## Gate 3: Recommendation table example

```
GATE 3: Recommendations — Accept, defer, or reject each
────────────────────────────────────────────────────────

| # | Domain | Replace what | With what | Risk | Files | Context7 | Decision |
|---|--------|-------------|-----------|:----:|:-----:|:--------:|----------|
| 1 | i18n | hand-rolled t() in 47 files | @lingui/core ^4.0 | low | 47 | verified | ? |
| 2 | observability | console.log | pino ^9.0 | low | 12 | verified | ? |
| 3 | state-mgmt | 5x useState chain | zustand ^5.0 | medium | 5 | verified | ? |
| 4 | code-org | 3 circular deps | eslint-plugin-import + refactor | medium | 6 | verified | ? |
| 5 | code-org | utils/ 23 files | split by domain (Gate 2 choice) | low | 23 | — | ? |
| 6 | GAP | no error monitoring | Sentry ^8.0 | low | 3 | verified | ? |

Total files affected: 96

Options:
  A) Accept all → generate full migration plan
  B) Accept specific (list numbers, e.g., "1,2,6")
  C) Accept low-risk only (auto-filter risk=low)
  D) Defer all to next sprint — output report only, no migration plan

Recommendation: B — accept 1,2,4,6 (high-impact, low-risk wins first).
```

---

## Gate 4: Execution confirmation example

```
GATE 4: Execution — Confirm before irreversible actions
───────────────────────────────────────────────────────

PRs to create:

| # | Type | Branch | Title | Files | Reviewers |
|---|------|--------|-------|:-----:|-----------|
| 1 | security-update | next-unicorn/sec-lodash | fix(deps): patch lodash CVE-... | 1 | @team-lead |
| 2 | migration | next-unicorn/migrate-i18n | refactor(i18n): replace t() with @lingui/core | 47 | @frontend |
| 3 | dependency-update | next-unicorn/deps-minor | chore(deps): update 5 minor versions | 1 | — |

File migrations:

| Action | Path | Rollback |
|--------|------|----------|
| mkdir | src/components/ui/ | rmdir src/components/ui/ |
| mv | Button.tsx → ui/Button.tsx | mv back |
| rename | parseJson.ts → parse-json.ts | rename back |
| delete | hand-rolled-logger.ts | git checkout -- [file] |

Options:
  A) Execute all → create PRs + migrate files
  B) PRs only — no file migration
  C) File migration only — no PRs
  D) Dry run — show what WOULD happen, execute nothing
  E) Abort — output report only

Recommendation: D — dry run first, then A after review.

After execution, report:
  - N PRs created (URLs)
  - N files moved, N renamed, N deleted
  - Rollback: git stash pop / git checkout -- [files]
```
