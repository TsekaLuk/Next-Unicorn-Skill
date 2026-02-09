import type { VibeCodingDomain } from '../schemas/input.schema.js';

/**
 * Defines a pattern that identifies hand-rolled code which could be
 * replaced by a battle-tested third-party library.
 *
 * NOTE: This interface intentionally contains NO library recommendation data.
 * Library recommendations are the AI agent's responsibility — the agent uses
 * its own knowledge + Context7 MCP to determine the best library for each
 * detection at runtime, considering the project's framework, existing deps,
 * and architectural context.
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
  /** Base confidence score for this pattern (0–1) */
  confidenceBase: number;
}

/**
 * Returns the full pattern catalog covering Vibe Coding domains.
 * Each covered domain has 2–3 patterns for hand-rolled code detection.
 *
 * The catalog defines WHAT to detect, not WHAT to recommend.
 * Library recommendations are generated dynamically by the AI agent.
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
      confidenceBase: 0.8,
    },

    // -----------------------------------------------------------------------
    // growth-hacking — A/B Testing, Analytics, Feature Flags
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
      confidenceBase: 0.7,
    },

    // -----------------------------------------------------------------------
    // agent-architecture — MCP Integration, Tool Orchestration, Context
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
      confidenceBase: 0.65,
    },

    // -----------------------------------------------------------------------
    // observability — Logging, Tracing, Metrics, Error Tracking
    // -----------------------------------------------------------------------
    {
      id: 'observability-manual-logging',
      domain: 'observability',
      description: 'Hand-rolled logging with console.log/console.error in production code',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /console\s*\.\s*(?:log|error|warn|info)\s*\(/,
      ],
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
      confidenceBase: 0.7,
    },

    // -----------------------------------------------------------------------
    // auth-security — Authentication, Authorization, Rate Limiting
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
      confidenceBase: 0.65,
    },

    // -----------------------------------------------------------------------
    // ux-completeness — Forms, Loading States
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
      confidenceBase: 0.55,
    },

    // -----------------------------------------------------------------------
    // state-management — Manual state chains, Redux boilerplate
    // -----------------------------------------------------------------------
    {
      id: 'state-manual-usestate-chain',
      domain: 'state-management',
      description: 'Multiple related useState hooks that should be a single store',
      filePatterns: ['**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /useState\s*\(.*\);\s*\n\s*const\s*\[.*\]\s*=\s*useState\s*\(.*\);\s*\n\s*const\s*\[.*\]\s*=\s*useState/,
        /const\s*\[\w+,\s*set\w+\]\s*=\s*useState[\s\S]{0,100}const\s*\[\w+,\s*set\w+\]\s*=\s*useState[\s\S]{0,100}const\s*\[\w+,\s*set\w+\]\s*=\s*useState/,
      ],
      confidenceBase: 0.6,
    },
    {
      id: 'state-manual-context-provider',
      domain: 'state-management',
      description: 'Hand-rolled React Context for global state management',
      filePatterns: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
      codePatterns: [
        /createContext\s*<[\s\S]*>\s*\(/,
        /useReducer\s*\(\s*\w+Reducer/,
        /Provider\s+value\s*=\s*\{[\s\S]*dispatch/,
      ],
      confidenceBase: 0.55,
    },
    {
      id: 'state-manual-redux-boilerplate',
      domain: 'state-management',
      description: 'Redux boilerplate without Redux Toolkit (manual action creators, reducers)',
      filePatterns: ['**/*.ts', '**/*.js'],
      codePatterns: [
        /type\s*:\s*['"`][A-Z_]+['"`]\s*,\s*payload/,
        /switch\s*\(\s*action\s*\.\s*type\s*\)/,
        /const\s+\w+\s*=\s*\(\s*state\s*=\s*initialState\s*,\s*action\s*\)/,
      ],
      confidenceBase: 0.75,
    },

    // -----------------------------------------------------------------------
    // data-fetching-caching — Manual fetch + useEffect patterns
    // -----------------------------------------------------------------------
    {
      id: 'data-fetch-useeffect',
      domain: 'data-fetching-caching',
      description: 'Manual data fetching with fetch/axios inside useEffect',
      filePatterns: ['**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,200}fetch\s*\(/,
        /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,200}axios\s*\.\s*get/,
        /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,100}setLoading\s*\(\s*true\s*\)/,
      ],
      confidenceBase: 0.7,
    },
    {
      id: 'data-fetch-manual-cache',
      domain: 'data-fetching-caching',
      description: 'Hand-rolled client-side data cache with Map or object',
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      codePatterns: [
        /new\s+Map\s*<.*,.*>\s*\(\s*\)[\s\S]{0,200}\.set\s*\([\s\S]{0,100}\.get\s*\(/,
        /cache\s*\[\s*\w+\s*\]\s*=[\s\S]{0,100}cache\s*\[\s*\w+\s*\]/,
        /const\s+cache\s*=\s*(?:new\s+Map|{})/,
      ],
      confidenceBase: 0.6,
    },
    {
      id: 'data-fetch-manual-retry',
      domain: 'data-fetching-caching',
      description: 'Hand-rolled fetch retry logic with loops or recursion',
      filePatterns: ['**/*.ts', '**/*.js'],
      codePatterns: [
        /retry\s*[<>=]\s*\d+[\s\S]{0,200}fetch\s*\(/i,
        /for\s*\(\s*let\s+\w+\s*=\s*0[\s\S]{0,200}fetch\s*\(/,
        /attempts?\s*[+\-]=\s*1[\s\S]{0,100}(?:fetch|axios)/i,
      ],
      confidenceBase: 0.7,
    },

    // -----------------------------------------------------------------------
    // forms-ux — Manual form state and validation
    // -----------------------------------------------------------------------
    {
      id: 'forms-manual-state-tracking',
      domain: 'forms-ux',
      description: 'Multiple useState hooks for individual form fields',
      filePatterns: ['**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /const\s*\[\s*\w+,\s*set\w+\s*\]\s*=\s*useState\s*\(\s*['"`]{2}\s*\)[\s\S]{0,200}onChange/,
        /e\s*\.\s*target\s*\.\s*value[\s\S]{0,50}set\w+\s*\(\s*e\s*\.\s*target\s*\.\s*value\s*\)/,
      ],
      confidenceBase: 0.65,
    },
    {
      id: 'forms-manual-submit-handler',
      domain: 'forms-ux',
      description: 'Hand-rolled form submission with manual preventDefault and state collection',
      filePatterns: ['**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /handleSubmit[\s\S]{0,100}preventDefault\s*\(\s*\)[\s\S]{0,200}fetch\s*\(/,
        /onSubmit[\s\S]{0,100}e\s*\.\s*preventDefault[\s\S]{0,200}(?:setLoading|setError)/,
      ],
      confidenceBase: 0.6,
    },

    // -----------------------------------------------------------------------
    // error-handling-resilience — Error boundaries, Result types
    // -----------------------------------------------------------------------
    {
      id: 'error-manual-error-boundary',
      domain: 'error-handling-resilience',
      description: 'Hand-rolled error boundary class component',
      filePatterns: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
      codePatterns: [
        /componentDidCatch\s*\(/,
        /getDerivedStateFromError\s*\(/,
        /class\s+\w*ErrorBoundary\s+extends\s+(?:React\.)?Component/,
      ],
      confidenceBase: 0.8,
    },
    {
      id: 'error-manual-result-type',
      domain: 'error-handling-resilience',
      description: 'Hand-rolled Result/Either type for error handling',
      filePatterns: ['**/*.ts', '**/*.js'],
      codePatterns: [
        /type\s+Result\s*<[\s\S]*>\s*=\s*\{?\s*(?:success|ok|data|error)/i,
        /interface\s+(?:Result|Either)\s*<[\s\S]*>\s*\{/i,
        /\{\s*ok\s*:\s*true[\s\S]{0,50}data\s*:[\s\S]{0,100}\{\s*ok\s*:\s*false[\s\S]{0,50}error\s*:/,
      ],
      confidenceBase: 0.65,
    },

    // -----------------------------------------------------------------------
    // a11y-accessibility — Missing ARIA, keyboard navigation
    // -----------------------------------------------------------------------
    {
      id: 'a11y-manual-click-handler-div',
      domain: 'a11y-accessibility',
      description: 'Clickable div/span without keyboard accessibility',
      filePatterns: ['**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /<div\s[^>]*onClick\s*=\s*\{/,
        /<span\s[^>]*onClick\s*=\s*\{/,
      ],
      confidenceBase: 0.6,
    },
    {
      id: 'a11y-manual-focus-management',
      domain: 'a11y-accessibility',
      description: 'Hand-rolled focus management and keyboard trap',
      filePatterns: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
      codePatterns: [
        /\.focus\s*\(\s*\)[\s\S]{0,200}(?:tabIndex|keyCode|keyDown)/i,
        /addEventListener\s*\(\s*['"`]keydown['"`][\s\S]{0,200}(?:Tab|Escape|27|9)\b/,
        /document\s*\.\s*activeElement/,
      ],
      confidenceBase: 0.55,
    },

    // -----------------------------------------------------------------------
    // file-upload-media — Manual FileReader, drag-and-drop
    // -----------------------------------------------------------------------
    {
      id: 'upload-manual-filereader',
      domain: 'file-upload-media',
      description: 'Hand-rolled file reading with FileReader API',
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      codePatterns: [
        /new\s+FileReader\s*\(\s*\)/,
        /readAsDataURL\s*\(/,
        /readAsArrayBuffer\s*\(/,
      ],
      confidenceBase: 0.6,
    },
    {
      id: 'upload-manual-drag-drop',
      domain: 'file-upload-media',
      description: 'Hand-rolled drag-and-drop file upload handling',
      filePatterns: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
      codePatterns: [
        /addEventListener\s*\(\s*['"`](?:dragover|dragenter|drop)['"`]/,
        /onDrop\s*=\s*\{[\s\S]{0,200}dataTransfer\s*\.\s*files/,
        /e\s*\.\s*dataTransfer\s*\.\s*files/,
      ],
      confidenceBase: 0.65,
    },

    // -----------------------------------------------------------------------
    // database-orm-migrations — Raw SQL, manual migrations
    // -----------------------------------------------------------------------
    {
      id: 'db-manual-raw-sql',
      domain: 'database-orm-migrations',
      description: 'Hand-rolled raw SQL queries with string interpolation',
      filePatterns: ['**/*.ts', '**/*.js'],
      codePatterns: [
        /`SELECT\s[\s\S]*FROM\s[\s\S]*\$\{/i,
        /`INSERT\s+INTO\s[\s\S]*\$\{/i,
        /`UPDATE\s[\s\S]*SET\s[\s\S]*\$\{/i,
        /query\s*\(\s*['"`](?:SELECT|INSERT|UPDATE|DELETE)\b/i,
      ],
      confidenceBase: 0.7,
    },
    {
      id: 'db-manual-migration-script',
      domain: 'database-orm-migrations',
      description: 'Hand-rolled database migration with CREATE TABLE / ALTER TABLE',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.sql'],
      codePatterns: [
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+/i,
        /ALTER\s+TABLE\s+\w+\s+(?:ADD|DROP|MODIFY)/i,
        /\.exec\s*\(\s*['"`](?:CREATE|ALTER|DROP)\s/i,
      ],
      confidenceBase: 0.65,
    },

    // -----------------------------------------------------------------------
    // logging-tracing-metrics — Structured logging, OpenTelemetry
    // -----------------------------------------------------------------------
    {
      id: 'metrics-manual-timing',
      domain: 'logging-tracing-metrics',
      description: 'Hand-rolled performance timing with Date.now() or performance.now()',
      filePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
      codePatterns: [
        /const\s+\w*[Ss]tart\w*\s*=\s*(?:Date|performance)\s*\.\s*now\s*\(\s*\)/,
        /(?:Date|performance)\s*\.\s*now\s*\(\s*\)\s*-\s*\w*[Ss]tart/,
        /console\s*\.\s*time\s*\(/,
      ],
      confidenceBase: 0.55,
    },
    {
      id: 'metrics-manual-structured-log',
      domain: 'logging-tracing-metrics',
      description: 'Hand-rolled structured logging with JSON.stringify',
      filePatterns: ['**/*.ts', '**/*.js'],
      codePatterns: [
        /console\s*\.\s*(?:log|info)\s*\(\s*JSON\s*\.\s*stringify\s*\(/,
        /console\s*\.\s*(?:log|info)\s*\(\s*\{[\s\S]{0,200}(?:timestamp|level|message)/i,
      ],
      confidenceBase: 0.7,
    },

    // -----------------------------------------------------------------------
    // testing-strategy — Manual test utilities
    // -----------------------------------------------------------------------
    {
      id: 'test-manual-assertions',
      domain: 'testing-strategy',
      description: 'Hand-rolled test assertions without a test framework',
      filePatterns: ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'],
      codePatterns: [
        /if\s*\([\s\S]{0,50}!==[\s\S]{0,50}\)\s*throw\s+new\s+Error/,
        /assert\s*\.\s*(?:equal|strictEqual|deepEqual)\s*\(/,
        /console\s*\.\s*assert\s*\(/,
      ],
      confidenceBase: 0.7,
    },
    {
      id: 'test-manual-mocks',
      domain: 'testing-strategy',
      description: 'Hand-rolled mock/stub implementations',
      filePatterns: ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'],
      codePatterns: [
        /const\s+mock\w+\s*=\s*\(\s*\)\s*=>\s*(?:Promise\s*\.\s*resolve|{)/i,
        /jest\s*\.\s*fn\s*\(\s*\)/,
        /sinon\s*\.\s*stub\s*\(/,
      ],
      confidenceBase: 0.5,
    },
  ];
}

/**
 * Returns patterns filtered to a specific Vibe Coding domain.
 */
export function getPatternsForDomain(domain: string): PatternDefinition[] {
  return getPatternCatalog().filter((p) => p.domain === domain);
}
