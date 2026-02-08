import type { RecommendedChange, AdapterStrategy } from '../schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface MigrationPlan {
  phases: MigrationPhase[];
  deletionChecklist: DeletionItem[];
}

export interface MigrationPhase {
  phase: number;
  name: string;
  steps: MigrationStep[];
}

export interface MigrationStep {
  recommendationIndex: number;
  description: string;
  adapterStrategy?: AdapterStrategy;
}

export interface DeletionItem {
  filePath: string;
  lineRange?: { start: number; end: number };
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_PHASE_MAP: Record<string, { order: number; name: string }> = {
  low: { order: 1, name: 'Low-Risk Quick Wins' },
  medium: { order: 2, name: 'Medium-Risk Improvements' },
  high: { order: 3, name: 'High-Risk Transformations' },
};

// ---------------------------------------------------------------------------
// buildMigrationPlan — main entry point
// ---------------------------------------------------------------------------

/**
 * Build a phased migration plan from a list of recommendations.
 *
 * Phasing logic:
 * - Phase 1: low-risk items
 * - Phase 2: medium-risk items
 * - Phase 3: high-risk items (with adapter strategies)
 *
 * Within each phase, items are ordered by composite score descending
 * (highest impact first).
 *
 * Only phases that have items are included (empty phases are skipped).
 *
 * High-risk items MUST have an AdapterStrategy generated — if the input
 * recommendation doesn't already have one, a default is generated.
 *
 * The deletion checklist includes EVERY filePath from recommendations.
 *
 * Empty recommendations → empty plan with zero phases.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 9.4
 */
export function buildMigrationPlan(
  recommendations: RecommendedChange[],
): MigrationPlan {
  if (recommendations.length === 0) {
    return { phases: [], deletionChecklist: [] };
  }

  // --- Step 1: Group recommendations by risk level ---
  const groups: Record<string, Array<{ index: number; rec: RecommendedChange }>> = {
    low: [],
    medium: [],
    high: [],
  };

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i]!;
    const risk = rec.migrationRisk;
    groups[risk]!.push({ index: i, rec });
  }

  // --- Step 2: Sort each group by composite score descending ---
  for (const risk of ['low', 'medium', 'high'] as const) {
    groups[risk]!.sort((a, b) => b.rec.impactScores.composite - a.rec.impactScores.composite);
  }

  // --- Step 3: Build phases (only non-empty groups) ---
  const phases: MigrationPhase[] = [];
  let phaseNumber = 1;

  for (const risk of ['low', 'medium', 'high'] as const) {
    const items = groups[risk]!;
    if (items.length === 0) continue;

    const phaseMeta = RISK_PHASE_MAP[risk]!;
    const steps: MigrationStep[] = items.map((item) => {
      const step = buildMigrationStep(item.index, item.rec, risk);
      return step;
    });

    phases.push({
      phase: phaseNumber,
      name: phaseMeta.name,
      steps,
    });

    phaseNumber++;
  }

  // --- Step 4: Build deletion checklist ---
  const deletionChecklist = buildDeletionChecklist(recommendations);

  return { phases, deletionChecklist };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a single migration step from a recommendation.
 *
 * For high-risk items, ensures an AdapterStrategy is present.
 * If the recommendation already has one, it is used; otherwise a default
 * is generated from the recommendation's metadata.
 */
function buildMigrationStep(
  index: number,
  rec: RecommendedChange,
  risk: string,
): MigrationStep {
  const description = buildStepDescription(rec, risk);

  const step: MigrationStep = {
    recommendationIndex: index,
    description,
  };

  if (risk === 'high') {
    step.adapterStrategy = rec.adapterStrategy ?? generateDefaultAdapterStrategy(rec);
  }

  return step;
}

/**
 * Build a human-readable description for a migration step.
 */
function buildStepDescription(rec: RecommendedChange, risk: string): string {
  const pattern = rec.currentImplementation.patternCategory;
  const library = rec.recommendedLibrary.name;
  const filePath = rec.currentImplementation.filePath;

  if (risk === 'high') {
    return `Replace ${pattern} in ${filePath} with ${library} using adapter strategy`;
  }
  if (risk === 'medium') {
    return `Replace ${pattern} in ${filePath} with ${library}`;
  }
  return `Replace ${pattern} in ${filePath} with ${library} (quick win)`;
}

/**
 * Generate a default AdapterStrategy for a high-risk recommendation
 * that doesn't already have one.
 *
 * Requirements: 4.2, 9.4
 */
function generateDefaultAdapterStrategy(rec: RecommendedChange): AdapterStrategy {
  const pattern = rec.currentImplementation.patternCategory;
  const library = rec.recommendedLibrary.name;
  const filePath = rec.currentImplementation.filePath;

  return {
    wrapperInterface: `I${pattern}Adapter`,
    legacyCode: filePath,
    targetLibrary: library,
    description: `Adapter wrapping legacy ${pattern} implementation to transition to ${library}`,
  };
}

/**
 * Build the deletion checklist from all recommendations.
 *
 * Every filePath from a recommendation's currentImplementation appears
 * in the checklist.
 *
 * Requirements: 4.3
 */
function buildDeletionChecklist(recommendations: RecommendedChange[]): DeletionItem[] {
  return recommendations.map((rec) => ({
    filePath: rec.currentImplementation.filePath,
    lineRange: rec.currentImplementation.lineRange,
    reason: `Replaced ${rec.currentImplementation.patternCategory} with ${rec.recommendedLibrary.name}`,
  }));
}
