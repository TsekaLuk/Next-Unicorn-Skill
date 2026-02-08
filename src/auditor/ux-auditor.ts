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
 * Each category has:
 * - patterns: regex patterns to look for in detection patternCategory or domain
 * - libraryIndicators: library names in currentLibraries that indicate coverage
 * - detectionDomains: domains from the scanner that relate to this category
 * - detectionPatternIds: specific pattern IDs from the scanner that relate
 * - recommendedLibrary: the library to recommend when missing/partial
 * - missingRationale: rationale when the category is missing
 * - partialRationale: rationale when the category is partial
 * - presentRationale: rationale when the category is present
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
  /** The library to recommend when missing or partial */
  recommendedLibrary: string;
  /** Rationale when the category is missing */
  missingRationale: string;
  /** Rationale when the category is partial */
  partialRationale: string;
  /** Rationale when the category is present */
  presentRationale: string;
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
    recommendedLibrary: 'react-aria',
    missingRationale:
      'No accessibility patterns detected. Add react-aria for accessible primitives with ARIA attributes, focus management, and keyboard navigation built-in.',
    partialRationale:
      'Some accessibility patterns found but coverage is incomplete. react-aria provides comprehensive accessible component primitives.',
    presentRationale:
      'Accessibility patterns detected across frontend files with proper ARIA attributes and focus management.',
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
    recommendedLibrary: 'react-error-boundary',
    missingRationale:
      'No error boundary or error state patterns detected. react-error-boundary provides declarative error boundaries with fallback UI, retry, and reset capabilities.',
    partialRationale:
      'Some error handling found but missing structured error boundaries. react-error-boundary adds declarative fallback UI and recovery patterns.',
    presentRationale:
      'Error state handling detected with error boundaries and fallback UI patterns.',
  },
  {
    category: 'empty-states',
    detectionPatternIds: [],
    detectionDomains: ['ux-completeness'],
    patternKeywords: [/empty.?state/i, /no.?data/i, /no.?results/i, /placeholder/i, /zero.?state/i],
    libraryIndicators: ['react-empty-state', '@illustrations/undraw'],
    recommendedLibrary: 'react-empty-state',
    missingRationale:
      'No empty state patterns detected. Add dedicated empty state components with illustrations and call-to-action buttons for better user guidance.',
    partialRationale:
      'Some empty state handling found but not consistently applied. Consider a dedicated empty state component library for consistent UX.',
    presentRationale:
      'Empty state patterns detected with appropriate placeholder content and user guidance.',
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
    recommendedLibrary: 'react-loading-skeleton',
    missingRationale:
      'No loading state patterns detected. react-loading-skeleton provides animated placeholder UI that reduces perceived load time and prevents layout shift.',
    partialRationale:
      'Hand-rolled loading states found. react-loading-skeleton provides consistent, animated skeleton screens with automatic sizing.',
    presentRationale:
      'Loading state patterns detected with skeleton screens or spinner components.',
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
    recommendedLibrary: 'react-hook-form',
    missingRationale:
      'No form validation patterns detected. react-hook-form provides performant form validation with minimal re-renders, schema integration, and accessible error messages.',
    partialRationale:
      'Hand-rolled form validation found. react-hook-form reduces boilerplate and provides consistent validation UX with schema-based validation support.',
    presentRationale:
      'Form validation patterns detected with structured validation library integration.',
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
    recommendedLibrary: '@tanstack/react-virtual',
    missingRationale:
      'No performance optimization patterns detected. @tanstack/react-virtual provides efficient list virtualization, reducing DOM nodes and improving scroll performance for large datasets.',
    partialRationale:
      'Some performance patterns found but missing virtualization or optimistic updates. @tanstack/react-virtual improves rendering performance for large lists.',
    presentRationale:
      'Performance optimization patterns detected including virtualization and lazy loading.',
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
    recommendedLibrary: 'react-i18next',
    missingRationale:
      'No internationalization or copy management patterns detected. react-i18next provides structured copy management with pluralization, interpolation, and locale-aware formatting for consistent UI text.',
    partialRationale:
      'Hand-rolled i18n patterns found. react-i18next provides centralized copy management ensuring consistency across the application.',
    presentRationale:
      'Copy consistency patterns detected with internationalization library integration.',
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
    recommendedLibrary: '@radix-ui/themes',
    missingRationale:
      'No design system or component library patterns detected. @radix-ui/themes provides accessible, composable UI primitives that enforce design consistency across the application.',
    partialRationale:
      'Some design system patterns found but coverage is incomplete. @radix-ui/themes provides a comprehensive set of accessible, themed components.',
    presentRationale:
      'Design system alignment detected with component library and theming patterns.',
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit UX completeness across 8 categories by examining scanner detections
 * and the project's current library dependencies.
 *
 * Always returns exactly 8 items — one for each UX category.
 * Items with status "partial" or "missing" include a recommendedLibrary and rationale.
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

    const item: UxAuditItem = {
      category: config.category,
      status,
      filePaths,
      rationale:
        status === 'missing'
          ? config.missingRationale
          : status === 'partial'
            ? config.partialRationale
            : config.presentRationale,
    };

    // Add recommendedLibrary for partial or missing statuses (required by spec)
    if (status === 'partial' || status === 'missing') {
      item.recommendedLibrary = config.recommendedLibrary;
    }

    items.push(item);
  }

  // Ensure all 8 categories are present (defensive — should always be true)
  const coveredCategories = new Set(items.map((i) => i.category));
  for (const category of ALL_UX_CATEGORIES) {
    if (!coveredCategories.has(category)) {
      items.push({
        category,
        status: 'missing',
        filePaths: [],
        recommendedLibrary: 'unknown',
        rationale: `No patterns detected for ${category}. Manual review recommended.`,
      });
    }
  }

  return { items };
}
