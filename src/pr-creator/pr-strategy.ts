/**
 * PR Strategy — plans which pull requests to create from analysis output.
 *
 * Strategy:
 * 1. Security fixes -> separate PRs (highest priority)
 * 2. Grouped dependency updates -> one PR per group
 * 3. Individual dependency updates -> one PR per package
 * 4. Migration PRs -> one PR per migration phase
 *
 * Requirements: 12.1, 12.2, 12.3, 12.5
 */

import type {
  OutputSchema,
  UpdateItem,
  RecommendedChange,
  PRType,
} from '../schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PRPolicy {
  enabled: boolean;
  maxOpenPRs: number;
  groupUpdates: boolean;
  separateSecurityPRs: boolean;
  createMigrationPRs: boolean;
  labels: string[];
  reviewers: string[];
  draft: boolean;
  branchPrefix: string;
}

export type PRItemKind =
  | { kind: 'update'; update: UpdateItem }
  | { kind: 'migration'; recommendation: RecommendedChange; phaseNumber: number }
  | { kind: 'security'; update: UpdateItem };

export interface PRPlan {
  type: PRType;
  /** Unique branch name (Property 26) */
  branchName: string;
  /** Items included in this PR */
  items: PRItemKind[];
  /** Priority: higher = create first */
  priority: number;
}

export interface PRStrategyInput {
  output: OutputSchema;
  policy: PRPolicy;
}

// ---------------------------------------------------------------------------
// planPRs
// ---------------------------------------------------------------------------

/**
 * Plan which PRs to create from the analysis output.
 *
 * Property 25: Security PRs separated when policy requires.
 * Property 26: Branch name uniqueness.
 * Property 27: Max open PRs respected.
 */
export function planPRs(input: PRStrategyInput): PRPlan[] {
  const { output, policy } = input;
  const plans: PRPlan[] = [];
  const usedBranches = new Set<string>();

  // ---- 1. Security update PRs ----
  if (output.updatePlan && policy.separateSecurityPRs) {
    const securityUpdates = output.updatePlan.updates.filter(
      (u) => u.urgency === 'critical' || u.urgency === 'urgent',
    );

    for (const update of securityUpdates) {
      const branch = uniqueBranch(
        `${policy.branchPrefix}fix/${sanitize(update.packageName)}`,
        usedBranches,
      );
      plans.push({
        type: 'security-update',
        branchName: branch,
        items: [{ kind: 'security', update }],
        priority: update.urgency === 'critical' ? 100 : 90,
      });
    }
  }

  // ---- 2. Grouped dependency updates ----
  if (output.updatePlan && policy.groupUpdates) {
    const groups = output.updatePlan.groups;
    for (const group of groups) {
      // Skip items already handled as security PRs
      const nonSecurityItems = policy.separateSecurityPRs
        ? group.items.filter(
            (i) => i.urgency !== 'critical' && i.urgency !== 'urgent',
          )
        : group.items;

      if (nonSecurityItems.length === 0) continue;

      const branch = uniqueBranch(
        `${policy.branchPrefix}chore/${sanitize(group.groupKey)}`,
        usedBranches,
      );
      plans.push({
        type: 'grouped-update',
        branchName: branch,
        items: nonSecurityItems.map((u) => ({ kind: 'update' as const, update: u })),
        priority: 50,
      });
    }
  }

  // ---- 3. Individual dependency updates (not in groups) ----
  if (output.updatePlan) {
    const groupedPackages = new Set(
      output.updatePlan.groups.flatMap((g) => g.items.map((i) => i.packageName)),
    );

    const securityPackages = new Set(
      policy.separateSecurityPRs
        ? output.updatePlan.updates
            .filter((u) => u.urgency === 'critical' || u.urgency === 'urgent')
            .map((u) => u.packageName)
        : [],
    );

    const individualUpdates = output.updatePlan.updates.filter(
      (u) => !groupedPackages.has(u.packageName) && !securityPackages.has(u.packageName),
    );

    for (const update of individualUpdates) {
      const branch = uniqueBranch(
        `${policy.branchPrefix}chore/${sanitize(update.packageName)}`,
        usedBranches,
      );
      plans.push({
        type: 'dependency-update',
        branchName: branch,
        items: [{ kind: 'update', update }],
        priority: 30,
      });
    }
  }

  // ---- 4. Migration PRs ----
  if (policy.createMigrationPRs && output.migrationPlan.phases.length > 0) {
    for (const phase of output.migrationPlan.phases) {
      const branch = uniqueBranch(
        `${policy.branchPrefix}refactor/migration-phase-${phase.phase}`,
        usedBranches,
      );

      const items: PRItemKind[] = phase.steps.map((step) => ({
        kind: 'migration' as const,
        recommendation: output.recommendedChanges[step.recommendationIndex]!,
        phaseNumber: phase.phase,
      }));

      plans.push({
        type: 'migration',
        branchName: branch,
        items,
        priority: 10,
      });
    }
  }

  // Sort by priority descending (security first)
  plans.sort((a, b) => b.priority - a.priority);

  // Enforce maxOpenPRs (Property 27)
  return plans.slice(0, policy.maxOpenPRs);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a package name for use in a branch name.
 */
function sanitize(name: string): string {
  return name
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .toLowerCase();
}

/**
 * Ensure branch name uniqueness (Property 26).
 */
function uniqueBranch(base: string, usedBranches: Set<string>): string {
  let branch = base;
  let counter = 2;
  while (usedBranches.has(branch)) {
    branch = `${base}-${counter}`;
    counter++;
  }
  usedBranches.add(branch);
  return branch;
}
