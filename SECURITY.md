# Security Policy

## Supported Versions

| Version | Supported |
|---------|:---------:|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in Next-Unicorn, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **[security@nebutra.com](mailto:security@nebutra.com)** or use [GitHub Security Advisories](https://github.com/Nebutra/Next-Unicorn-Skill/security/advisories/new) to report the vulnerability privately.

### What to include

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgement**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix & disclosure**: coordinated with reporter, typically within 30 days

## Security Measures

Next-Unicorn takes security seriously:

- **Dependency scanning**: All current AND recommended dependencies are scanned via the [OSV database](https://osv.dev/) to prevent "upgrade into a vulnerability" scenarios
- **No secrets in code**: All external clients (Context7, OSV, npm registry, GitHub API) are injected via interfaces — no credentials are hardcoded
- **License compliance**: License allowlist filtering prevents introducing packages with incompatible licenses
- **Minimal dependencies**: Only 2 runtime dependencies (`zod`, `semver`) to minimize attack surface
- **npm provenance**: Packages are published with [Sigstore provenance](https://docs.npmjs.com/generating-provenance-statements) for supply chain verification
- **Strict TypeScript**: Full strict mode with no `any` escapes

## Scope

This policy covers the `@nebutra/next-unicorn-skill` npm package and the [Nebutra/Next-Unicorn-Skill](https://github.com/Nebutra/Next-Unicorn-Skill) GitHub repository.

Vulnerabilities in upstream dependencies should be reported to the respective maintainers.
