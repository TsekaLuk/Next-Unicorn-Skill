import type { ScanResult, Detection } from '../analyzer/scanner.js';
import type { InputSchema } from '../schemas/input.schema.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface UxAuditResult {
  items: UxAuditItem[];
}

export interface UxAuditItem {
  category: UxCategory;
  status: 'present' | 'partial' | 'missing';
  filePaths: string[];
  /** Library recommendation — left undefined by the auditor; filled by AI agent */
  recommendedLibrary?: string;
  rationale: string;
}

// ---------------------------------------------------------------------------
// The 8 UX categories
// ---------------------------------------------------------------------------

export type UxCategory =
  | 'accessibility'
  | 'error-states'
  | 'empty-states'
  | 'loading-states'
  | 'form-validation'
  | 'performance-feel'
  | 'copy-consistency'
  | 'design-system-alignment';

const ALL_UX_CATEGORIES: UxCategory[] = [
  'accessibility',
  'error-states',
  'empty-states',
  'loading-states',
  'form-validation',
  'performance-feel',
  'copy-consistency',
  'design-system-alignment',
];

// ---------------------------------------------------------------------------
// Category detection configuration
// ---------------------------------------------------------------------------

/**
 * Each category defines WHAT to detect, not WHAT to recommend.
 * Library recommendations are the AI agent's responsibility.
 *
 * Detection signals:
 * - detectionPatternIds: scanner pattern IDs that indicate this category
 * - detectionDomains: scanner domains that relate to this category
 * - patternKeywords: regex keywords to search in pattern category strings
 * - libraryIndicators: library names in currentLibraries that indicate coverage
 */
interface CategoryConfig {
  category: UxCategory;
  /** Pattern IDs from scanner detections that indicate this category */
  detectionPatternIds: string[];
  /** Domains from scanner detections that relate to this category */
  detectionDomains: string[];
  /** Keywords to search for in detection patternCategory strings */
  patternKeywords: RegExp[];
  /** Library names in currentLibraries that indicate coverage */
  libraryIndicators: string[];
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    category: 'accessibility',
    detectionPatternIds: [],
    detectionDomains: ['ux-completeness'],
    patternKeywords: [/a11y/i, /accessibility/i, /aria/i, /screen.?reader/i, /wcag/i],
    libraryIndicators: [
      'react-aria',
      '@radix-ui/react-accessible-icon',
      'axe-core',
      '@axe-core/react',
      'eslint-plugin-jsx-a11y',
      'react-focus-lock',
      '@reach/visually-hidden',
    ],
  },
  {
    category: 'error-states',
    detectionPatternIds: ['observability-manual-error-tracking'],
    detectionDomains: ['observability'],
    patternKeywords: [/error.?boundar/i, /error.?state/i, /error.?handling/i, /catch/i, /fallback/i],
    libraryIndicators: [
      'react-error-boundary',
      '@sentry/react',
      'sentry',
      'react-query',
      '@tanstack/react-query',
    ],
  },
  {
    category: 'empty-states',
    detectionPatternIds: [],
    detectionDomains: ['ux-completeness'],
    patternKeywords: [/empty.?state/i, /no.?data/i, /no.?results/i, /placeholder/i, /zero.?state/i],
    libraryIndicators: ['react-empty-state', '@illustrations/undraw'],
  },
  {
    category: 'loading-states',
    detectionPatternIds: ['ux-manual-loading-states'],
    detectionDomains: ['ux-completeness'],
    patternKeywords: [/loading/i, /spinner/i, /skeleton/i, /suspense/i, /pending/i],
    libraryIndicators: [
      'react-loading-skeleton',
      'react-spinners',
      'react-content-loader',
      '@tanstack/react-query',
      'swr',
    ],
  },
  {
    category: 'form-validation',
    detectionPatternIds: ['ux-manual-form-validation'],
    detectionDomains: ['ux-completeness'],
    patternKeywords: [/form.?valid/i, /validation/i, /form.?error/i, /setError/i, /useForm/i],
    libraryIndicators: [
      'react-hook-form',
      'formik',
      'yup',
      'zod',
      '@hookform/resolvers',
      'vest',
    ],
  },
  {
    category: 'performance-feel',
    detectionPatternIds: [],
    detectionDomains: ['ux-completeness'],
    patternKeywords: [
      /virtuali[sz]/i,
      /lazy/i,
      /code.?split/i,
      /optimistic/i,
      /debounce/i,
      /throttle/i,
      /intersection.?observer/i,
      /prefetch/i,
    ],
    libraryIndicators: [
      'react-virtual',
      '@tanstack/react-virtual',
      'react-window',
      'react-virtualized',
      'react-intersection-observer',
      'framer-motion',
    ],
  },
  {
    category: 'copy-consistency',
    detectionPatternIds: ['i18n-manual-pluralization', 'i18n-manual-locale-detection'],
    detectionDomains: ['i18n'],
    patternKeywords: [/i18n/i, /l10n/i, /locale/i, /translat/i, /intl/i, /plurali[sz]/i],
    libraryIndicators: [
      'i18next',
      'react-i18next',
      'react-intl',
      'next-intl',
      'formatjs',
      '@formatjs/intl',
    ],
  },
  {
    category: 'design-system-alignment',
    detectionPatternIds: [],
    detectionDomains: ['ux-completeness'],
    patternKeywords: [
      /design.?system/i,
      /component.?library/i,
      /theme/i,
      /styled/i,
      /tailwind/i,
      /chakra/i,
      /radix/i,
      /shadcn/i,
    ],
    libraryIndicators: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tooltip',
      '@chakra-ui/react',
      '@mui/material',
      'antd',
      'tailwindcss',
      'styled-components',
      '@emotion/react',
      'class-variance-authority',
    ],
  },
];

// ---------------------------------------------------------------------------
// Core audit logic
// ---------------------------------------------------------------------------

/**
 * Determine the status of a UX category based on scanner detections and
 * the project's current libraries.
 */
function evaluateCategory(
  config: CategoryConfig,
  detections: Detection[],
  currentLibraries: Record<string, string>,
): { status: 'present' | 'partial' | 'missing'; filePaths: string[] } {
  const filePaths: string[] = [];
  let hasDetections = false;
  let hasLibrary = false;

  // Check if any scanner detections match this category
  for (const detection of detections) {
    const matchesPatternId = config.detectionPatternIds.includes(detection.patternCategory);
    const matchesDomain = config.detectionDomains.includes(detection.domain);
    const matchesKeyword = config.patternKeywords.some(
      (kw) => kw.test(detection.patternCategory) || kw.test(detection.domain),
    );

    if (matchesPatternId || matchesDomain || matchesKeyword) {
      hasDetections = true;
      if (!filePaths.includes(detection.filePath)) {
        filePaths.push(detection.filePath);
      }
    }
  }

  // Check if any current libraries indicate coverage for this category
  const libraryNames = Object.keys(currentLibraries);
  for (const indicator of config.libraryIndicators) {
    if (libraryNames.some((lib) => lib === indicator || lib.includes(indicator))) {
      hasLibrary = true;
      break;
    }
  }

  // Determine status:
  // - present: library installed AND no hand-rolled detections, OR library installed
  // - partial: hand-rolled detections found (library may or may not be installed)
  // - missing: no library and no detections
  if (hasLibrary && !hasDetections) {
    return { status: 'present', filePaths };
  } else if (hasDetections) {
    // Hand-rolled patterns detected — partial coverage (library may help replace them)
    return { status: 'partial', filePaths };
  } else if (hasLibrary) {
    return { status: 'present', filePaths };
  } else {
    return { status: 'missing', filePaths };
  }
}

/**
 * Generate a factual rationale based on the detection status.
 * Does NOT recommend specific libraries — that's the AI agent's job.
 */
function generateRationale(
  category: string,
  status: 'present' | 'partial' | 'missing',
  filePaths: string[],
): string {
  const categoryLabel = category.replace(/-/g, ' ');

  if (status === 'present') {
    return `${categoryLabel} patterns detected with library integration.`;
  }
  if (status === 'partial') {
    const fileList = filePaths.length > 0
      ? ` in ${filePaths.length} file(s)`
      : '';
    return `Hand-rolled ${categoryLabel} patterns found${fileList}. Consider replacing with a dedicated library.`;
  }
  return `No ${categoryLabel} patterns detected. Manual review recommended.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit UX completeness across 8 categories by examining scanner detections
 * and the project's current library dependencies.
 *
 * Always returns exactly 8 items — one for each UX category.
 * The auditor determines STATUS (present/partial/missing) deterministically.
 * Library recommendations (recommendedLibrary) are NOT filled by the auditor —
 * they are the AI agent's responsibility to fill based on project context.
 *
 * @param scanResult - The result from the codebase scanner
 * @param projectMetadata - Project metadata including current libraries
 * @returns UxAuditResult with exactly 8 audit items
 */
export function auditUxCompleteness(
  scanResult: ScanResult,
  projectMetadata: InputSchema['projectMetadata'],
): UxAuditResult {
  const currentLibraries = projectMetadata.currentLibraries;
  const items: UxAuditItem[] = [];

  for (const config of CATEGORY_CONFIGS) {
    const { status, filePaths } = evaluateCategory(config, scanResult.detections, currentLibraries);

    items.push({
      category: config.category,
      status,
      filePaths,
      rationale: generateRationale(config.category, status, filePaths),
      // recommendedLibrary is intentionally left undefined — AI agent fills it
    });
  }

  // Ensure all 8 categories are present (defensive — should always be true)
  const coveredCategories = new Set(items.map((i) => i.category));
  for (const category of ALL_UX_CATEGORIES) {
    if (!coveredCategories.has(category)) {
      items.push({
        category,
        status: 'missing',
        filePaths: [],
        rationale: `No ${category.replace(/-/g, ' ')} patterns detected. Manual review recommended.`,
      });
    }
  }

  return { items };
}
