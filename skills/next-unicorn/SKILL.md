---
name: next-unicorn
description: Audit codebase to identify reinvented wheels, suggest unicorn-grade library replacements, scan vulnerabilities, and auto-create migration plans. Use when analyzing technical debt, reviewing hand-rolled code, planning library migrations, or auditing project structure.
metadata:
  author: Nebutra
  version: "2.1.0"
  argument-hint: <project-path>
---

# Next Unicorn - Codebase Auditor

Analyze and recommend third-party library replacements for hand-rolled code.

## Quick Start

```bash
# Analyze current directory
cd your-project && npx next-unicorn

# Or use the CLI directly
npx @nebutra/next-unicorn-skill analyze ./src
```

## Features

- **Hand-rolled Detection**: Identify reinvented wheels (HTTP, date parsing, etc.)
- **Library Recommendations**: Suggest battle-tested alternatives with Context7 verification
- **Vulnerability Scanning**: Detect known CVEs in dependencies
- **Migration Planning**: Generate structured migration plans with code examples

## Architecture

```
Scanner (deterministic) → AI Agent (generative) → Pipeline (deterministic)
1. Regex: detect hand-rolled code  1. Recommend library replacements  Score, plan, audit,
2. FS: detect code org issues     2. Identify capability gaps        filter, serialize
   (god-dirs, circular deps,     3. Recommend org patterns + tooling
    naming, barrel bloat)         using knowledge + Context7
```

## Gate Protocol

Present structured choices at gates. NEVER skip or proceed without user response.

**Format** — table of findings/options + lettered choices + your recommendation with 1-sentence rationale.

See [references/code-organization-workflow.md](references/code-organization-workflow.md) for full Gate examples.
