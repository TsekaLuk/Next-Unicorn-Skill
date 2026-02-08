<p align="center">
  <h1 align="center">Next-Unicorn</h1>
  <p align="center">
    Stop Vibe Coding debt. Audit your codebase, replace reinvented wheels with<br/>
    unicorn-grade libraries, and ship a migration plan + "delete-code" checklist.
  </p>
</p>

<p align="center">
  <a href="https://github.com/TsekaLuk/Next-Unicorn-Skill/actions/workflows/ci.yml"><img src="https://github.com/TsekaLuk/Next-Unicorn-Skill/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@nebutra/next-unicorn-skill"><img src="https://img.shields.io/npm/v/@nebutra/next-unicorn-skill.svg?color=blue" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue.svg" alt="TypeScript" /></a>
  <a href="./tests/"><img src="https://img.shields.io/badge/tests-191%20passed-brightgreen.svg" alt="Tests" /></a>
  <a href="./tests/"><img src="https://img.shields.io/badge/properties-29%20verified-purple.svg" alt="Property Tests" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#comparison">Comparison</a> &bull;
  <a href="#api">API</a> &bull;
  <a href="#examples">Examples</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## Why Next-Unicorn?

Every codebase accumulates hand-rolled implementations that should be mature libraries. Custom date formatters, DIY loggers, bespoke state machines, ad-hoc i18n — **Vibe Coding debt**.

Snyk, Dependabot, and Renovate manage your *existing* dependencies. They can't find code you wrote that *should become* a dependency.

**Next-Unicorn does both** — and verifies every recommendation against real documentation via [Context7 MCP](https://context7.com).

## Quick Start

```bash
# npm
npm install @nebutra/next-unicorn-skill

# pnpm
pnpm add @nebutra/next-unicorn-skill

# bun
bun add @nebutra/next-unicorn-skill
```

```typescript
import { analyze } from '@nebutra/next-unicorn-skill';

const result = await analyze({
  input: {
    projectMetadata: {
      repoPath: './my-project',
      languages: ['typescript'],
      packageManagers: ['pnpm'],
      currentLibraries: { react: '18.2.0', next: '14.1.0' },
    },
    optimizationGoals: ['reduce custom code', 'improve maintainability'],
    constraints: {
      licenseAllowlist: ['MIT', 'Apache-2.0', 'ISC'],
    },
    priorityFocusAreas: ['i18n', 'observability', 'auth-security'],
  },
  context7Client: myContext7Client,
  // Optional Phase 2 clients:
  vulnClient: myOsvClient,          // vulnerability scanning
  registryClient: myRegistryClient,  // auto-update
  platformClient: myGitHubClient,    // PR creation
  gitOps: myGitOperations,           // PR creation
});

if (result.success) {
  console.log(result.prettyJson);
}
```

Or use as an **MCP SKILL** — provide [`SKILL.md`](./SKILL.md) to your AI agent (Claude Code, Kiro, etc.).

## Features

### Core Analysis

| Feature | Description |
|---------|-------------|
| **Pattern-based scanning** | Detects hand-rolled code across 68 Vibe Coding Domains (ISO 25010-aligned) |
| **Context7 verification** | Every recommendation verified against real, version-correct documentation |
| **7-dimension impact scoring** | Scalability, performance, security, maintainability, feature richness, UX, UI aesthetics |
| **Phased migration plans** | Low / medium / high risk phases with adapter strategies |
| **Deletion checklists** | Every file and line range to remove, with estimated lines saved |
| **UX completeness audit** | A11y, error/empty/loading states, form validation, design system alignment |
| **Monorepo support** | Detects npm, pip, cargo, go workspaces independently |

### Dependency Management (v2.0)

| Feature | Description |
|---------|-------------|
| **Vulnerability scanning** | Scans current AND recommended deps via OSV — prevents "upgrade into a vuln" |
| **Auto-update deps** | Impact-scored version upgrades with Context7-powered breaking change detection |
| **PR auto-creation** | GitHub/GitLab PRs with conventional commit titles, impact tables, reviewer checklists |
| **Migration PRs** | PRs with adapter code scaffolding for hand-rolled code replacement |

## How It Works

```
Input ─> Validator ─> Scanner ─> Context7 Verifier ─> Impact Scorer
  ─> Conflict Detection ─> Vuln Scanner ─> License Filter
  ─> Migration Planner ─> UX Auditor ─> Auto-Updater
  ─> Serializer ─> PR Creator ─> Output
```

Each stage is a pure function with structured I/O. All external dependencies (Context7, OSV, npm registry, GitHub API) are **injected via interfaces** for testability.

### Before / After

<table>
<tr><th>Before (hand-rolled)</th><th>After (recommended)</th></tr>
<tr>
<td>

```tsx
// Custom i18n across 47 files
const translations = {
  en: { greeting: 'Hello' },
  es: { greeting: 'Hola' },
};
function t(key, locale) {
  return translations[locale]?.[key] ?? key;
}
// No plurals, no interpolation, no RTL
```

</td>
<td>

```tsx
// next-intl — Context7 verified, MIT
// Impact: 9.2/10 composite
// Migration risk: low | Effort: 8h
import { useTranslations } from 'next-intl';

export default function Page() {
  const t = useTranslations('common');
  return <h1>{t('greeting')}</h1>;
}
```

</td>
</tr>
<tr>
<td>

```typescript
// Custom logger with console.log
function logRequest(req) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    method: req.method,
    url: req.url,
  }));
}
// No levels, no redaction, no rotation
```

</td>
<td>

```typescript
// pino — Context7 verified, MIT
// Impact: 9.0/10 composite
// Migration risk: low | Effort: 4h
import pino from 'pino';
const logger = pino({
  level: 'info',
  redact: ['req.headers.authorization'],
});
```

</td>
</tr>
</table>

## Comparison

| Feature | Next-Unicorn | Snyk | Dependabot | Renovate |
|---------|:---:|:---:|:---:|:---:|
| Finds hand-rolled code to replace | **Yes** | | | |
| Recommends new libraries | **Yes** | | | |
| 7-dimension impact scoring | **Yes** | | | |
| Context7 doc verification | **Yes** | | | |
| Phased migration plans | **Yes** | | | |
| UX completeness audit | **Yes** | | | |
| Deletion checklists | **Yes** | | | |
| Vulnerability scanning | **Yes** | Yes | Yes | |
| Scans *recommended* libs for vulns | **Yes** | | | |
| Auto-update existing deps | **Yes** | | Yes | Yes |
| Impact-scored updates | **Yes** | | | |
| PR auto-creation | **Yes** | Yes | Yes | Yes |
| Migration PRs with adapter code | **Yes** | | | |
| License compliance | **Yes** | Yes | | |
| Monorepo support | **Yes** | Yes | Yes | Yes |

## API

### `analyze(options): Promise<AnalyzeResult>`

| Option | Type | Required | Description |
|--------|------|:--------:|-------------|
| `input` | `InputSchema` | Yes | Project metadata, goals, constraints, focus areas |
| `context7Client` | `Context7Client` | Yes | Context7 MCP client for doc verification |
| `vulnClient` | `VulnerabilityClient` | No | OSV client for vulnerability scanning |
| `registryClient` | `RegistryClient` | No | Package registry client for auto-update |
| `platformClient` | `PlatformClient` | No | GitHub/GitLab client for PR creation |
| `gitOps` | `GitOperations` | No | Git CLI operations for PR creation |

### Output Structure

```jsonc
{
  "recommendedChanges": [...],     // Recommendations with impact scores
  "filesToDelete": [...],          // Files to remove after migration
  "linesSavedEstimate": 1250,      // Total lines saved
  "uxAudit": [...],                // UX completeness (8 categories)
  "migrationPlan": {               // Phased plan
    "phases": [...],               // low → medium → high risk
    "deletionChecklist": [...]     // Detailed items with reasons
  },
  "vulnerabilityReport": {...},    // (optional) Vuln findings + SARIF
  "updatePlan": {...},             // (optional) Scored dep updates
  "pullRequests": {...}            // (optional) Created PR results
}
```

## Vibe Coding Domains

68 domains across 11 categories, aligned with ISO/IEC 25010:

| Category | Count | Examples |
|----------|:-----:|---------|
| UX / Design | 14 | `ux-completeness`, `a11y-accessibility`, `forms-ux`, `design-system` |
| SEO / i18n | 5 | `seo`, `i18n`, `content-marketing` |
| Growth / Data | 7 | `analytics-tracking`, `ab-testing-experimentation` |
| Frontend Arch | 8 | `state-management`, `data-fetching-caching`, `agent-architecture` |
| Backend / Platform | 8 | `database-orm-migrations`, `jobs-queue-scheduler`, `feature-flags-config` |
| Security | 5 | `auth-security`, `permissions-rbac-ux`, `fraud-abuse-prevention` |
| Observability | 4 | `logging-tracing-metrics`, `error-monitoring` |
| Delivery / DevEx | 6 | `testing-strategy`, `ci-cd-release`, `dependency-management` |
| Performance | 3 | `performance-web-vitals`, `cost-optimization` |
| AI Engineering | 3 | `ai-model-serving`, `rag-vector-search` |
| Business | 3 | `payments-billing`, `marketplace-platform` |

> Extensible via `customDomains` in the input schema.

## Testing

```bash
pnpm test          # 191 tests (vitest + fast-check)
pnpm typecheck     # TypeScript strict mode
pnpm build         # Compile to dist/
```

**29 property-based tests** verify correctness invariants:

- Schema round-trip guarantees (Properties 1–3)
- Detection completeness (Property 4)
- Context7 verification correctness (Property 5)
- Scoring range and composite correctness (Properties 6–7)
- Migration phase ordering and adapter mandates (Properties 8–10)
- UX audit completeness (Property 11)
- Constraint filtering (Properties 12–13)
- JSON indentation (Property 14)
- Vulnerability scanning (Properties 15–18)
- Update policy and scoring (Properties 19–24)
- PR strategy and formatting (Properties 25–29)

## Examples

| Scenario | Input | Output |
|----------|-------|--------|
| Next.js Frontend | [`examples/frontend-nextjs/input.json`](./examples/frontend-nextjs/input.json) | [`output.json`](./examples/frontend-nextjs/output.json) |
| Node.js Backend | [`examples/backend-node/input.json`](./examples/backend-node/input.json) | [`output.json`](./examples/backend-node/output.json) |

## Templates

| Template | Purpose |
|----------|---------|
| [`summary-table.md`](./templates/summary-table.md) | Comparison table for stakeholders |
| [`migration-plan.md`](./templates/migration-plan.md) | Phased migration plan |
| [`deletion-checklist.md`](./templates/deletion-checklist.md) | Files to delete after migration |
| [`vuln-report.md`](./templates/vuln-report.md) | Vulnerability scan report |
| [`update-plan.md`](./templates/update-plan.md) | Dependency update plan |
| [`prd-template.md`](./templates/prd-template.md) | PRD for stakeholder presentation |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, architecture overview, and contribution guidelines.

## Releasing

Releases are automated via GitHub Actions:

```bash
# Tag a new version
git tag v2.0.0
git push origin v2.0.0
# → CI runs tests → creates GitHub Release → publishes to npm
```

See [CHANGELOG.md](./CHANGELOG.md) for version history.

## License

[MIT](./LICENSE) &copy; [TsekaLuk](https://github.com/TsekaLuk)
