/**
 * Update Plan Builder — assembles scored update candidates into a structured
 * update plan with groups and summary statistics.
 *
 * Requirements: 11.5, 11.9
 */

import type { UpdateItem, UpdateGroup, UpdatePlan } from '../schemas/output.schema.js';
import type { UpdateCandidate } from './update-policy.js';
import type { UpdateScoringOutput } from './update-scorer.js';
import type { ChangelogAnalysis } from './changelog-verifier.js';
import type { VulnScanResult } from '../security/vulnerability-scanner.js';

// ---------------------------------------------------------------------------
// Urgency ordering
// ---------------------------------------------------------------------------

const URGENCY_ORDER: Record<string, number> = {
  routine: 0,
  recommended: 1,
  urgent: 2,
  critical: 3,
};

type Urgency = 'routine' | 'recommended' | 'urgent' | 'critical';

/**
 * Get the highest urgency from an array of urgencies.
 * Property 23: Group urgency is max of members.
 */
export function maxUrgency(urgencies: Urgency[]): Urgency {
  let max: Urgency = 'routine';
  for (const u of urgencies) {
    if ((URGENCY_ORDER[u] ?? 0) > (URGENCY_ORDER[max] ?? 0)) {
      max = u;
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// buildUpdatePlan
// ---------------------------------------------------------------------------

/**
 * Build a structured update plan from scored candidates.
 */
export function buildUpdatePlan(
  candidates: UpdateCandidate[],
  scores: UpdateScoringOutput[],
  changelogs: ChangelogAnalysis[],
  vulnResult?: VulnScanResult,
): UpdatePlan {
  // Build UpdateItems
  const updates: UpdateItem[] = candidates.map((candidate, index) => {
    const score = scores[index]!;
    const changelog = changelogs[index]!;

    // Count vuln fixes for this package
    const vulnFixCount = vulnResult
      ? vulnResult.findings.filter(
          (f) =>
            f.source === 'current' &&
            f.packageName === candidate.packageName &&
            f.fixAvailable !== null,
        ).length
      : 0;

    return {
      packageName: candidate.packageName,
      ecosystem: candidate.ecosystem,
      currentVersion: candidate.currentVersion,
      targetVersion: candidate.targetVersion,
      updateType: candidate.updateType,
      urgency: score.urgency,
      breakingRisk: score.breakingRisk,
      impactScores: score.impactScores,
      estimatedEffort: score.estimatedEffort,
      hasBreakingChanges: changelog.hasBreakingChanges,
      breakingChangeSummary: changelog.breakingChangeSummary,
      vulnFixCount,
      groupKey: candidate.groupKey,
    };
  });

  // Build groups from items with the same groupKey
  const groupMap = new Map<string, UpdateItem[]>();
  for (const item of updates) {
    if (item.groupKey) {
      const existing = groupMap.get(item.groupKey) ?? [];
      existing.push(item);
      groupMap.set(item.groupKey, existing);
    }
  }

  const groups: UpdateGroup[] = [];
  for (const [groupKey, items] of groupMap) {
    // Only create a group if there are multiple items
    if (items.length > 1) {
      groups.push({
        groupKey,
        items,
        urgency: maxUrgency(items.map((i) => i.urgency)),
      });
    }
  }

  // Summary
  const summary = {
    totalUpdatesAvailable: updates.length,
    critical: updates.filter((u) => u.urgency === 'critical').length,
    urgent: updates.filter((u) => u.urgency === 'urgent').length,
    recommended: updates.filter((u) => u.urgency === 'recommended').length,
    routine: updates.filter((u) => u.urgency === 'routine').length,
    estimatedTotalEffort: updates.reduce((sum, u) => sum + u.estimatedEffort, 0),
  };

  return { updates, groups, summary };
}
