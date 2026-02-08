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

export type MigrationPhase = z.infer<typeof MigrationPhase>;

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
  }),
});

export type OutputSchema = z.infer<typeof OutputSchema>;
