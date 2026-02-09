import { z } from 'zod';

export const VerificationStatus = z.enum(['verified', 'unverified', 'unavailable']);

export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const ImpactScores = z.object({
  scalability: z.number().int().min(1).max(10),
  performance: z.number().int().min(1).max(10),
  security: z.number().int().min(1).max(10),
  maintainability: z.number().int().min(1).max(10),
  feature_richness: z.number().int().min(1).max(10),
  ux: z.number().int().min(1).max(10),
  ui_aesthetics: z.number().int().min(1).max(10),
  composite: z.number().min(1).max(10),
});

export type ImpactScores = z.infer<typeof ImpactScores>;

export const MigrationRisk = z.enum(['low', 'medium', 'high']);

export type MigrationRisk = z.infer<typeof MigrationRisk>;

export const AdapterStrategy = z.object({
  wrapperInterface: z.string(),
  legacyCode: z.string(),
  targetLibrary: z.string(),
  description: z.string(),
});

export type AdapterStrategy = z.infer<typeof AdapterStrategy>;

export const RecommendedChange = z.object({
  currentImplementation: z.object({
    filePath: z.string(),
    lineRange: z.object({ start: z.number().int(), end: z.number().int() }),
    patternCategory: z.string(),
    confidenceScore: z.number().min(0).max(1),
  }),
  recommendedLibrary: z.object({
    name: z.string(),
    version: z.string(),
    license: z.string(),
    documentationUrl: z.string().optional(),
    /** WHY this library — AI agent's reasoning */
    rationale: z.string().optional(),
    /** Companion libraries that form a cohesive solution */
    ecosystem: z.array(z.object({
      library: z.string(),
      version: z.string(),
      role: z.string(),
    })).optional(),
    /** What NOT to use, and why */
    antiPatterns: z.array(z.string()).optional(),
    /** Alternative solutions for different architectural contexts */
    alternatives: z.array(z.object({
      library: z.string(),
      when: z.string(),
    })).optional(),
  }),
  domain: z.string(),
  impactScores: ImpactScores,
  migrationRisk: MigrationRisk,
  estimatedEffort: z.number().positive(), // developer-hours
  adapterStrategy: AdapterStrategy.optional(),
  verificationStatus: VerificationStatus,
  verificationNote: z.string().optional(),
});

export type RecommendedChange = z.infer<typeof RecommendedChange>;

export const UxAuditItem = z.object({
  category: z.enum([
    'accessibility',
    'error-states',
    'empty-states',
    'loading-states',
    'form-validation',
    'performance-feel',
    'copy-consistency',
    'design-system-alignment',
  ]),
  status: z.enum(['present', 'partial', 'missing']),
  filePaths: z.array(z.string()),
  recommendedLibrary: z.string().optional(),
  rationale: z.string(),
});

export type UxAuditItem = z.infer<typeof UxAuditItem>;

export const MigrationPhase = z.object({
  phase: z.number().int().positive(),
  name: z.string(),
  steps: z.array(
    z.object({
      recommendationIndex: z.number().int(),
      description: z.string(),
      adapterStrategy: AdapterStrategy.optional(),
    })
  ),
});

export const WarningSeverity = z.enum(['conflict', 'missing', 'compatible']);

export type WarningSeverity = z.infer<typeof WarningSeverity>;

export const PeerDependencyWarning = z.object({
  recommendedLibrary: z.string(),
  peerDependency: z.string(),
  requiredRange: z.string(),
  installedVersion: z.string().nullable(),
  severity: WarningSeverity,
});

export type PeerDependencyWarning = z.infer<typeof PeerDependencyWarning>;


export type MigrationPhase = z.infer<typeof MigrationPhase>;

// ---------------------------------------------------------------------------
// Phase 2: Vulnerability Scanning schemas
// ---------------------------------------------------------------------------

export const VulnSeverity = z.enum(['critical', 'high', 'medium', 'low', 'unknown']);
export type VulnSeverity = z.infer<typeof VulnSeverity>;

export const VulnFindingSchema = z.object({
  source: z.enum(['current', 'recommended']),
  packageName: z.string(),
  installedVersion: z.string(),
  ecosystem: z.string(),
  vulnerabilityId: z.string(),
  aliases: z.array(z.string()).default([]),
  severity: VulnSeverity,
  cvssScore: z.number().nullable(),
  summary: z.string(),
  fixAvailable: z.string().nullable(),
  recommendationIndex: z.number().int().optional(),
});

export type VulnFinding = z.infer<typeof VulnFindingSchema>;

export const VulnSummarySchema = z.object({
  totalDepsScanned: z.number().int().nonnegative(),
  currentDepsScanned: z.number().int().nonnegative(),
  recommendedDepsScanned: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  fixable: z.number().int().nonnegative(),
  unfixable: z.number().int().nonnegative(),
});

export type VulnSummary = z.infer<typeof VulnSummarySchema>;

export const VulnReportSchema = z.object({
  findings: z.array(VulnFindingSchema),
  summary: VulnSummarySchema,
  serviceUnavailable: z.boolean(),
});

export type VulnReport = z.infer<typeof VulnReportSchema>;

// ---------------------------------------------------------------------------
// Phase 2: Auto-Update schemas
// ---------------------------------------------------------------------------

export const UpdateType = z.enum(['patch', 'minor', 'major']);
export type UpdateType = z.infer<typeof UpdateType>;

export const UpdateUrgency = z.enum(['routine', 'recommended', 'urgent', 'critical']);
export type UpdateUrgency = z.infer<typeof UpdateUrgency>;

export const BreakingRisk = z.enum(['none', 'low', 'medium', 'high']);
export type BreakingRisk = z.infer<typeof BreakingRisk>;

export const UpdateItemSchema = z.object({
  packageName: z.string(),
  ecosystem: z.string(),
  currentVersion: z.string(),
  targetVersion: z.string(),
  updateType: UpdateType,
  urgency: UpdateUrgency,
  breakingRisk: BreakingRisk,
  impactScores: ImpactScores,
  estimatedEffort: z.number().positive(),
  hasBreakingChanges: z.boolean(),
  breakingChangeSummary: z.string().optional(),
  vulnFixCount: z.number().int().nonnegative(),
  groupKey: z.string().optional(),
});

export type UpdateItem = z.infer<typeof UpdateItemSchema>;

export const UpdateGroupSchema = z.object({
  groupKey: z.string(),
  items: z.array(UpdateItemSchema),
  urgency: UpdateUrgency,
});

export type UpdateGroup = z.infer<typeof UpdateGroupSchema>;

export const UpdatePlanSchema = z.object({
  updates: z.array(UpdateItemSchema),
  groups: z.array(UpdateGroupSchema),
  summary: z.object({
    totalUpdatesAvailable: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    urgent: z.number().int().nonnegative(),
    recommended: z.number().int().nonnegative(),
    routine: z.number().int().nonnegative(),
    estimatedTotalEffort: z.number().nonnegative(),
  }),
});

export type UpdatePlan = z.infer<typeof UpdatePlanSchema>;

// ---------------------------------------------------------------------------
// Phase 2: PR Auto-Creation schemas
// ---------------------------------------------------------------------------

export const PRTypeSchema = z.enum([
  'security-update',
  'dependency-update',
  'migration',
  'grouped-update',
]);
export type PRType = z.infer<typeof PRTypeSchema>;

export const PRStatusSchema = z.enum(['created', 'updated', 'skipped', 'failed']);
export type PRStatus = z.infer<typeof PRStatusSchema>;

export const PRResultSchema = z.object({
  branchName: z.string(),
  title: z.string(),
  type: PRTypeSchema,
  status: PRStatusSchema,
  url: z.string().optional(),
  prNumber: z.number().int().optional(),
  errorMessage: z.string().optional(),
  itemCount: z.number().int().positive(),
});

export type PRResult = z.infer<typeof PRResultSchema>;

export const PRSummarySchema = z.object({
  totalPlanned: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type PRSummary = z.infer<typeof PRSummarySchema>;

// ---------------------------------------------------------------------------
// OutputSchema — extended with Phase 2 optional sections
// ---------------------------------------------------------------------------

export const OutputSchema = z.object({
  recommendedChanges: z.array(RecommendedChange),
  filesToDelete: z.array(z.string()),
  linesSavedEstimate: z.number().int().nonnegative(),
  uxAudit: z.array(UxAuditItem),
  migrationPlan: z.object({
    phases: z.array(MigrationPhase),
    deletionChecklist: z.array(
      z.object({
        filePath: z.string(),
        lineRange: z.object({ start: z.number().int(), end: z.number().int() }).optional(),
        reason: z.string(),
      })
    ),
    peerDependencyWarnings: z.array(PeerDependencyWarning),
  }),
  // Phase 2 optional sections
  vulnerabilityReport: VulnReportSchema.optional(),
  updatePlan: UpdatePlanSchema.optional(),
  pullRequests: z
    .object({
      created: z.array(PRResultSchema),
      summary: PRSummarySchema,
    })
    .optional(),
});

export type OutputSchema = z.infer<typeof OutputSchema>;
