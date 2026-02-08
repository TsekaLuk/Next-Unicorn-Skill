import type { VibeCodingDomain } from '../schemas/input.schema.js';

/**
 * Defines a pattern that identifies hand-rolled code which could be
 * replaced by a battle-tested third-party library.
 */
export interface PatternDefinition {
  /** Unique identifier for this pattern (e.g., "i18n-manual-pluralization") */
  id: string;
  /** The Vibe Coding domain this pattern belongs to */
  domain: VibeCodingDomain;
  /** Human-readable description of what this pattern detects */
  description: string;
  /** Glob patterns for files to scan */
  filePatterns: string[];
  /** Regex patterns to match hand-rolled code */
  codePatterns: RegExp[];
  /** The library recommended to replace the hand-rolled code */
  suggestedLibrary: string;
  /** Recommended version of the suggested library */
  suggestedVersion: string;
  /** SPDX license identifier of the suggested library */
  license: string;
  /** Base confidence score for this pattern (0–1) */
  confidenceBase: number;
}

/**
 * Returns the full pattern catalog covering all Vibe Coding domains.
 * Each domain has at least 1–2 patterns.
 */
export function getPatternCatalog(): PatternDefinition[] {
  return [
    // -----------------------------------------------------------------------
    // i18n — Internationalization / L10n / RTL
    // -----------------------------------------------------------------------
    {
      id: 'i18n-manual-pluralization',
      domain: 'i18n',
      description: 'Hand-rolled pluralization logic (if/else or ternary on count)',
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      codePatterns: [
        /count\s*[=!]==?\s*1\s*\?\s*['"`].*['"`]\s*:\s*['"`].*['"`]/,
        /\.length\s*[=!]==?\s*1\s*\?\s*['"`].*['"`]\s*:\s*['"`].*['"`]/,
      ],
      suggestedLibrary: 'i18next',
      suggestedVersion: '^23.0.0',
      license: 'MIT',
      confidenceBase: 0.7,
    },
    {
      id: 'i18n-manual-locale-detection',
      domain: 'i18n',
      description: 'Manual navigator.language or Accept-Language header parsing',
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      codePatterns: [
        /navigator\s*\.\s*language/,
        /accept-language/i,
        /toLocaleDateString\s*\(/,
      ],
      suggestedLibrary: 'react-i18next',
      suggestedVersion: '^14.0.0',
      license: 'MIT',
      confidenceBase: 0.65,
    },

    // -----------------------------------------------------------------------
    // SEO — Search Engine Optimization / GEO
    // -----------------------------------------------------------------------
    {
      id: 'seo-manual-meta-tags',
      domain: 'seo',
      description: 'Hand-rolled <meta> tag injection via DOM manipulation',
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      codePatterns: [
        /document\s*\.\s*createElement\s*\(\s*['"`]meta['"`]\s*\)/,
        /document\s*\.\s*head\s*\.\s*appendChild/,
        /document\s*\.\s*querySelector\s*\(\s*['"`]meta\[/,
      ],
      suggestedLibrary: 'next-seo',
      suggestedVersion: '^6.0.0',
      license: 'MIT',
      confidenceBase: 0.75,
    },
    {
      id: 'seo-manual-sitemap',
      domain: 'seo',
      description: 'Hand-rolled XML sitemap generation',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.xml'],
      codePatterns: [
        /<\?xml\s+version/,
        /<urlset\s+xmlns/,
        /writeFileSync\s*\(.*sitemap/i,
      ],
      suggestedLibrary: 'next-sitemap',
      suggestedVersion: '^4.0.0',
      license: 'MIT',
      confidenceBase: 0.8,
    },

    // -----------------------------------------------------------------------
    // growth-hacking — A/B Testing, Analytics, Feature Flags, Funnel Tracking
    // -----------------------------------------------------------------------
    {
      id: 'growth-manual-ab-test',
      domain: 'growth-hacking',
      description: 'Hand-rolled A/B testing with Math.random() or cookie-based splits',
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      codePatterns: [
        /Math\s*\.\s*random\s*\(\s*\)\s*[<>]=?\s*0?\.\s*5/,
        /variant\s*=\s*['"`][AB]['"`]/i,
        /experiment\s*[=:]\s*.*random/i,
      ],
      suggestedLibrary: 'posthog-js',
      suggestedVersion: '^1.100.0',
      license: 'MIT',
      confidenceBase: 0.7,
    },
    {
      id: 'growth-manual-feature-flags',
      domain: 'growth-hacking',
      description: 'Hand-rolled feature flag checks via environment variables or config objects',
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      codePatterns: [
        /process\s*\.\s*env\s*\.\s*FEATURE_/,
        /featureFlags?\s*\[/,
        /isFeatureEnabled\s*\(/,
      ],
      suggestedLibrary: 'unleash-client',
      suggestedVersion: '^5.0.0',
      license: 'Apache-2.0',
      confidenceBase: 0.6,
    },

    // -----------------------------------------------------------------------
    // ai-model-serving — Inference, Model Registry, Prompt Management
    // -----------------------------------------------------------------------
    {
      id: 'ai-manual-prompt-template',
      domain: 'ai-model-serving',
      description: 'Hand-rolled prompt template string interpolation',
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py'],
      codePatterns: [
        /`[^`]*\$\{.*\}[^`]*`\s*.*(?:prompt|system|user|assistant)/i,
        /f['"].*\{.*\}.*['"].*(?:prompt|model|completion)/i,
        /\.replace\s*\(\s*['"`]\{.*\}['"`]/,
      ],
      suggestedLibrary: 'langchain',
      suggestedVersion: '^0.2.0',
      license: 'MIT',
      confidenceBase: 0.65,
    },
    {
      id: 'ai-manual-inference-http',
      domain: 'ai-model-serving',
      description: 'Hand-rolled HTTP calls to model inference endpoints',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.py'],
      codePatterns: [
        /fetch\s*\(\s*['"`].*(?:openai|anthropic|huggingface|inference)/i,
        /axios\s*\.\s*post\s*\(\s*['"`].*(?:completions|chat|generate)/i,
        /requests\s*\.\s*post\s*\(\s*['"`].*(?:v1\/|api\/)/i,
      ],
      suggestedLibrary: 'ai',
      suggestedVersion: '^3.0.0',
      license: 'Apache-2.0',
      confidenceBase: 0.7,
    },

    // -----------------------------------------------------------------------
    // agent-architecture — MCP Integration, Tool Orchestration, Context, Memory
    // -----------------------------------------------------------------------
    {
      id: 'agent-manual-tool-dispatch',
      domain: 'agent-architecture',
      description: 'Hand-rolled tool dispatch with switch/case or if/else chains',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.py'],
      codePatterns: [
        /switch\s*\(\s*tool(?:Name|_name|Id)\s*\)/i,
        /if\s*\(\s*tool(?:Name|_name)\s*===?\s*['"`]/i,
        /tool_map\s*\[/i,
      ],
      suggestedLibrary: '@modelcontextprotocol/sdk',
      suggestedVersion: '^1.0.0',
      license: 'MIT',
      confidenceBase: 0.7,
    },
    {
      id: 'agent-manual-context-window',
      domain: 'agent-architecture',
      description: 'Hand-rolled context window management (token counting, truncation)',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.py'],
      codePatterns: [
        /token[_s]?\s*(?:count|length|limit)/i,
        /truncat(?:e|ion)\s*.*(?:context|message|prompt)/i,
        /maxTokens?\s*[=:]/i,
      ],
      suggestedLibrary: 'tiktoken',
      suggestedVersion: '^1.0.0',
      license: 'MIT',
      confidenceBase: 0.6,
    },

    // -----------------------------------------------------------------------
    // content-marketing — CMS, MDX Pipelines
    // -----------------------------------------------------------------------
    {
      id: 'content-manual-markdown-parsing',
      domain: 'content-marketing',
      description: 'Hand-rolled markdown parsing with regex or string manipulation',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /\.replace\s*\(\s*\/\s*#/,
        /\.replace\s*\(\s*\/\s*\\\*\\\*/,
        /\.split\s*\(\s*['"`]\\n['"`]\s*\)\s*\.\s*map/,
      ],
      suggestedLibrary: 'contentlayer',
      suggestedVersion: '^0.3.0',
      license: 'MIT',
      confidenceBase: 0.65,
    },
    {
      id: 'content-manual-mdx-processing',
      domain: 'content-marketing',
      description: 'Hand-rolled MDX/markdown file processing pipeline',
      filePatterns: ['**/*.ts', '**/*.js'],
      codePatterns: [
        /readFileSync\s*\(.*\.mdx?\b/i,
        /glob\s*\(.*\.mdx?\b/i,
        /frontmatter|gray-matter/i,
      ],
      suggestedLibrary: 'next-mdx-remote',
      suggestedVersion: '^4.0.0',
      license: 'MIT',
      confidenceBase: 0.6,
    },

    // -----------------------------------------------------------------------
    // cross-border-ecommerce — Payments, Shipping, Tax, Catalogs
    // -----------------------------------------------------------------------
    {
      id: 'ecommerce-manual-payment-integration',
      domain: 'cross-border-ecommerce',
      description: 'Hand-rolled payment gateway HTTP integration',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.py'],
      codePatterns: [
        /fetch\s*\(\s*['"`].*(?:stripe|paypal|checkout).*['"`]/i,
        /payment[_-]?intent/i,
        /charge\s*\.\s*create/i,
      ],
      suggestedLibrary: 'stripe',
      suggestedVersion: '^14.0.0',
      license: 'MIT',
      confidenceBase: 0.75,
    },
    {
      id: 'ecommerce-manual-tax-calculation',
      domain: 'cross-border-ecommerce',
      description: 'Hand-rolled tax/VAT calculation logic',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.py'],
      codePatterns: [
        /tax[_-]?rate\s*[=:]\s*0?\.\d+/i,
        /vat\s*[=:*]/i,
        /calculateTax\s*\(/i,
      ],
      suggestedLibrary: 'taxjar',
      suggestedVersion: '^5.0.0',
      license: 'MIT',
      confidenceBase: 0.65,
    },

    // -----------------------------------------------------------------------
    // observability — Logging, Tracing, Metrics, Error Tracking, CI/CD
    // -----------------------------------------------------------------------
    {
      id: 'observability-manual-logging',
      domain: 'observability',
      description: 'Hand-rolled logging with console.log/console.error in production code',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /console\s*\.\s*(?:log|error|warn|info)\s*\(/,
      ],
      suggestedLibrary: 'pino',
      suggestedVersion: '^9.0.0',
      license: 'MIT',
      confidenceBase: 0.55,
    },
    {
      id: 'observability-manual-error-tracking',
      domain: 'observability',
      description: 'Hand-rolled error tracking with try/catch and HTTP reporting',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /catch\s*\(\s*\w+\s*\)\s*\{[^}]*fetch\s*\(/,
        /window\s*\.\s*onerror/,
        /process\s*\.\s*on\s*\(\s*['"`]uncaughtException['"`]/,
      ],
      suggestedLibrary: 'sentry',
      suggestedVersion: '^8.0.0',
      license: 'MIT',
      confidenceBase: 0.7,
    },

    // -----------------------------------------------------------------------
    // auth-security — Authentication, Authorization/RBAC, Secrets, Rate Limiting
    // -----------------------------------------------------------------------
    {
      id: 'auth-manual-jwt-handling',
      domain: 'auth-security',
      description: 'Hand-rolled JWT token creation/verification',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.py'],
      codePatterns: [
        /atob\s*\(\s*.*split\s*\(\s*['"`]\.['"`]\s*\)/,
        /Buffer\s*\.\s*from\s*\(.*['"`]base64['"`]\s*\)/,
        /jwt\s*\.\s*sign\s*\(/i,
        /createHmac\s*\(/,
      ],
      suggestedLibrary: 'jose',
      suggestedVersion: '^5.0.0',
      license: 'MIT',
      confidenceBase: 0.75,
    },
    {
      id: 'auth-manual-rate-limiting',
      domain: 'auth-security',
      description: 'Hand-rolled rate limiting with in-memory counters or timestamps',
      filePatterns: ['**/*.ts', '**/*.js'],
      codePatterns: [
        /requestCount\s*[+]=\s*1/i,
        /rateLimi(?:t|ter)/i,
        /new\s+Map\s*\(\s*\).*(?:timestamp|count|window)/i,
      ],
      suggestedLibrary: 'rate-limiter-flexible',
      suggestedVersion: '^5.0.0',
      license: 'ISC',
      confidenceBase: 0.65,
    },

    // -----------------------------------------------------------------------
    // ux-completeness — Accessibility, Error/Empty/Loading States, etc.
    // -----------------------------------------------------------------------
    {
      id: 'ux-manual-form-validation',
      domain: 'ux-completeness',
      description: 'Hand-rolled form validation with manual state tracking',
      filePatterns: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
      codePatterns: [
        /setError\s*\(\s*['"`]/,
        /errors\s*\[\s*['"`]\w+['"`]\s*\]/,
        /validate\w*\s*=\s*\(\s*\)\s*=>/,
      ],
      suggestedLibrary: 'react-hook-form',
      suggestedVersion: '^7.50.0',
      license: 'MIT',
      confidenceBase: 0.7,
    },
    {
      id: 'ux-manual-loading-states',
      domain: 'ux-completeness',
      description: 'Hand-rolled loading state management without skeleton/spinner library',
      filePatterns: ['**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /isLoading\s*\?\s*.*(?:Loading|Spinner|\.\.\.)/i,
        /useState\s*<\s*boolean\s*>\s*\(\s*(?:true|false)\s*\).*loading/i,
      ],
      suggestedLibrary: 'react-loading-skeleton',
      suggestedVersion: '^3.4.0',
      license: 'MIT',
      confidenceBase: 0.55,
    },
  ];
}

/**
 * Returns patterns filtered to a specific Vibe Coding domain.
 */
export function getPatternsForDomain(domain: string): PatternDefinition[] {
  return getPatternCatalog().filter((p) => p.domain === domain);
}
