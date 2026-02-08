# Contributing to Next-Unicorn

Thank you for your interest in contributing to Next-Unicorn! This document provides guidelines and information for contributors.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/TsekaLuk/Next-Unicorn-Skill.git
cd next-unicorn

# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Build
pnpm build
```

## Architecture

Next-Unicorn follows a **linear pipeline architecture** with injectable dependencies for testability:

```
Input → Validator → Scanner → Context7 Verifier → Impact Scorer →
  Migration Planner → UX Auditor → Vuln Scanner → Auto-Updater →
  Serializer → PR Creator → Output
```

Each pipeline stage is a pure-ish function with structured input/output.

## Code Standards

- **TypeScript strict mode** — all code must pass `tsc --noEmit`
- **Zod schemas** — all data models use Zod for runtime validation
- **Injectable clients** — all external dependencies use interfaces for mocking
- **Property-based tests** — correctness properties verified with fast-check (min 100 runs)
- **Unit tests** — specific examples and edge cases with vitest

## Adding a New Feature

1. **Design first** — update `.kiro/specs/next-unicorn/design.md` with the feature design
2. **Requirements** — add acceptance criteria to `requirements.md`
3. **Tasks** — add implementation tasks to `tasks.md`
4. **Schema** — extend `input.schema.ts` and/or `output.schema.ts`
5. **Implement** — create the module in `src/`
6. **Test** — write property-based tests AND unit tests
7. **Wire** — integrate into the orchestrator in `src/index.ts`
8. **Document** — update `SKILL.md`, `README.md`, and `CHANGELOG.md`

## Adding a New Pattern

To add a new hand-rolled code pattern to detect:

1. Add a `PatternDefinition` entry to `src/analyzer/pattern-catalog.ts`
2. Specify the domain, file patterns (globs), code patterns (regex), and suggested library
3. Add a unit test in `tests/scanner.test.ts` with a code sample

## Adding a New Vibe Coding Domain

1. Add the domain to the `VibeCodingDomain` enum in `src/schemas/input.schema.ts`
2. Add dimension affinity mapping in `src/scorer/impact-scorer.ts`
3. Add patterns for the domain in `src/analyzer/pattern-catalog.ts`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass: `pnpm test`
4. Ensure type check passes: `pnpm typecheck`
5. Update `CHANGELOG.md` with your changes
6. Submit a PR with a clear description

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
