# Unicorn-Grade Product Reference Catalog

Reference landscape of products that top engineering teams ship with. Use this as a quality benchmark — not as a lookup table. When recommending a replacement for hand-rolled code, the recommendation should be at this level of product maturity, DX, and architectural sophistication.

## How to Use This Catalog

- **Do NOT** copy-paste library names from here into recommendations blindly
- **Do** use this as a quality bar: "Is my recommendation at the same tier as these products?"
- **Do** consider the project's specific constraints (framework, runtime, scale, budget) before recommending
- Products listed here represent the current best-in-class; the ecosystem evolves — use Context7 to verify currency

## Database & Data Layer

| Category | Product | Positioning |
|----------|---------|------------|
| SQL (Platform) | Supabase | Postgres platform (Auth/Storage/Edge) — DX + rapid iteration to scale |
| SQL (Serverless) | Neon | Serverless Postgres — cold start/branching/elasticity for modern CI + preview |
| SQL (Serverless) | PlanetScale | Serverless MySQL (Vitess) — branching workflow, mature architecture |
| SQL (Edge) | Turso | Edge SQLite — low-latency reads, edge-first |
| Distributed SQL | CockroachDB | Distributed consistent SQL — global deployment |
| ORM | Prisma | Type-safe ORM — DX + type system fusion, mature ecosystem |
| ORM | Drizzle | Type-safe SQL, zero runtime overhead — schema-driven migrations |
| Cache/KV | Upstash | Serverless Redis/Kafka — edge scenarios, per-request billing |
| Cache/KV | Cloudflare KV/D1 | Edge-native KV/SQLite |

## Search & Vector

| Category | Product | Positioning |
|----------|---------|------------|
| Search | Meilisearch | Lightweight, fast, great DX |
| Search | Typesense | Speed + control, product search |
| Search | Algolia | Search-as-a-service, mature |
| Vector DB | Pinecone | RAG-focused, engineering maturity |
| Vector DB | Weaviate | Extensible, strong ecosystem |
| Vector DB | Qdrant | Performance, engineering quality |

## Auth & Security

| Category | Product | Positioning |
|----------|---------|------------|
| Auth | Clerk | Frontend-first auth, component-based, excellent DX |
| Auth | Auth0 | Enterprise identity platform |
| Auth | WorkOS | B2B auth (SSO/SCIM), enterprise features |
| Auth | Stytch | B2C/B2B universal auth platform |
| Auth/Authz | Ory | Composable auth/authz components |
| Security | Arcjet | Rate limiting + bot detection + attack protection (unified) |
| Security | Snyk | Dependency security scanning |
| JWT | jose | Universal JWT (Node/Deno/Bun/Edge/browser), zero deps, Web Crypto |

## Payments & Billing

| Category | Product | Positioning |
|----------|---------|------------|
| Payments | Stripe | API + product polish, top-tier |
| MoR | Paddle | Merchant of Record — tax/compliance for SaaS |
| Global | Adyen | Enterprise global payment network |
| Billing | Chargebee | Subscription billing system |
| Digital | LemonSqueezy | Digital products with built-in tax/licensing |

## Observability & Monitoring

| Category | Product | Positioning |
|----------|---------|------------|
| Standard | OpenTelemetry | CNCF observability standard — vendor-neutral, composable |
| APM | Datadog | Full-stack monitoring, one-stop |
| Error | Sentry | Error/perf/replay monitoring — product-grade team UX |
| Logging | Pino | Fastest Node.js JSON logger |
| Logging | Grafana Loki | Log system, Grafana ecosystem |
| Dashboards | Grafana | Visualization platform, ecosystem standard |
| Status | OpenStatus | User-facing status page — transparency-first |
| Status | Better Stack | Status + incidents, modern integrations |

## Analytics & Growth

| Category | Product | Positioning |
|----------|---------|------------|
| Product Analytics | PostHog | Analytics/flags/replay/surveys — open source, growth loop |
| Product Analytics | Amplitude | Mature growth analytics |
| Product Analytics | Mixpanel | Event model, product-grade |
| Feature Flags | OpenFeature | CNCF standard — vendor-neutral flag evaluation |
| Short Links | Dub | Short links/attribution/growth — design-forward |

## Communication

| Category | Product | Positioning |
|----------|---------|------------|
| Email | Resend | Developer email API — modern DX |
| Email | Postmark | Transactional email — deliverability |
| Push | OneSignal | Multi-platform push |
| SMS | Twilio | Communication API ecosystem |

## Frontend & Design System

| Category | Product | Positioning |
|----------|---------|------------|
| Components | shadcn/ui | Composable component templates — control + aesthetics |
| Primitives | Radix UI | Unstyled accessible components — design system backbone |
| A11y | react-aria | Adobe's accessible behavior hooks — WCAG 2.1 |
| Animation | Framer Motion | React animation — expressive, high quality |
| Animation Assets | Lottie | Animation format/player — engineering standard |
| State | Zustand | Minimal state (1KB) — no providers, no boilerplate |
| Data Fetching | TanStack Query | Declarative caching/dedup/refetch — replaces useEffect+fetch |
| Forms | react-hook-form | Ref-based forms — minimal re-renders, zod integration |
| i18n | Lingui | Compile-time extraction, ICU MessageFormat, near-zero runtime |
| i18n (Next.js) | next-intl | Server components, internationalized routing, middleware |

## Deployment & Infrastructure

| Category | Product | Positioning |
|----------|---------|------------|
| Frontend | Vercel | Preview/edge/framework integration — deployment standard |
| PaaS | Railway | Developer-friendly PaaS — DX benchmark |
| Global | Fly.io | "Closer to users" distributed deployment |
| Edge | Cloudflare Workers/Pages | Edge runtime + platform — architecture pioneer |
| Serverless | AWS Lambda | Serverless standard — largest ecosystem |

## Content & CMS

| Category | Product | Positioning |
|----------|---------|------------|
| Headless CMS | Sanity | Programmable content — modeling + editing excellence |
| Headless CMS | Payload | Code-driven CMS — engineering-grade, composable |
| Headless CMS | Contentful | Enterprise content platform |
| Content Build | Velite | Type-safe content schemas, build-time, Zod — Contentlayer successor |
| Docs | Mintlify | Modern docs — product-grade aesthetics |

## Workflow & Automation

| Category | Product | Positioning |
|----------|---------|------------|
| Event-driven | Inngest | Reliable async tasks — modern event/workflow abstraction |
| Workflow | Temporal | Workflow engine — reliability, engineering hardcore |
| Automation | n8n | Self-hosted automation — extensible, controllable |
| Queue | BullMQ | Redis-based job queue for Node.js |

## AI Engineering

| Category | Product | Positioning |
|----------|---------|------------|
| SDK | Vercel AI SDK | Unified API across providers — streaming, tools, structured output |
| Chains | LangChain | RAG/agents/memory — complex orchestration |
| Protocol | MCP SDK | Standard AI tool integration protocol |
| Observability | Langfuse | LLM observability — cost/latency/eval tracking |
| Eval | Promptfoo | LLM evaluation framework |
| Inference | Replicate | Model hosting — cost + integration DX |
| Compute | Modal | Python/AI compute PaaS |

## API & Backend

| Category | Product | Positioning |
|----------|---------|------------|
| Type-safe API | tRPC | End-to-end TypeScript type safety — eliminates API schemas |
| API Gateway | GraphQL (Apollo) | Large-system API abstraction |
| API Docs | Mintlify | Modern documentation (listed above) |
| Backend | Hono | Ultra-fast, multi-runtime web framework |
| Backend | Fastify | Node.js performance-focused framework |

## Developer Tools

| Category | Product | Positioning |
|----------|---------|------------|
| IDE | Cursor | AI IDE — deep toolchain integration |
| Design | Figma | Collaborative design standard |
| Sites | Framer | High-aesthetics site builder |
| Terminal | Warp | Modern terminal — UI + collaboration |
| Dep Updates | Renovate | Automated dependency updates |
| Project Mgmt | Linear | Modern project management — speed + engineering aesthetics |
