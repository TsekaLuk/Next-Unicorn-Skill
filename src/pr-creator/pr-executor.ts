/**
 * PR Executor — executes PR plans by creating branches, committing changes,
 * and creating/updating pull requests via the platform client.
 *
 * Requirements: 12.5, 12.9
 */

import type { PRResult, PRSummary } from '../schemas/output.schema.js';
import type { PRPlan } from './pr-strategy.js';
import type { PlatformClient } from './platform-client.js';
import type { GitOperations } from './git-operations.js';
// PR title/description generation inlined — AI agent writes better descriptions
export function buildPRTitle(plan: PRPlan): string {
  const count = plan.items.length;
  switch (plan.type) {
    case 'security-update': return `fix(deps): patch ${count} security vulnerabilit${count === 1 ? 'y' : 'ies'}`;
    case 'dependency-update': return `chore(deps): update ${count} dependenc${count === 1 ? 'y' : 'ies'}`;
    case 'migration': return `refactor: migrate ${count} hand-rolled implementation${count === 1 ? '' : 's'}`;
    case 'grouped-update': return `chore(deps): update ${plan.items[0]?.kind === 'update' ? plan.items[0].update.packageName : 'dependencies'} group`;
    default: return `chore(deps): update ${count} item${count === 1 ? '' : 's'}`;
  }
}

export function buildPRDescription(plan: PRPlan): string {
  const lines = [`## ${buildPRTitle(plan)}`, '', `This PR contains ${plan.items.length} change(s).`, ''];
  for (const item of plan.items) {
    if (item.kind === 'update') {
      lines.push(`- Update \`${item.update.packageName}\` ${item.update.currentVersion} → ${item.update.targetVersion}`);
    } else if (item.kind === 'security') {
      lines.push(`- Fix \`${item.update.packageName}\` (security)`);
    } else if (item.kind === 'migration') {
      lines.push(`- Migrate \`${item.recommendation.currentImplementation.patternCategory}\` in \`${item.recommendation.currentImplementation.filePath}\``);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PRExecutionResult {
  created: PRResult[];
  summary: PRSummary;
}

export interface PRExecutionOptions {
  plans: PRPlan[];
  platformClient: PlatformClient;
  gitOps: GitOperations;
  labels: string[];
  reviewers: string[];
  draft: boolean;
}

// ---------------------------------------------------------------------------
// executePRPlans
// ---------------------------------------------------------------------------

/**
 * Execute all PR plans — create branches, commits, and pull requests.
 *
 * Each plan is processed independently — a failure for one PR does not
 * affect others (Requirement 12.9).
 */
export async function executePRPlans(
  options: PRExecutionOptions,
): Promise<PRExecutionResult> {
  const { plans, platformClient, gitOps, labels, reviewers, draft } = options;
  const results: PRResult[] = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Get default branch for PR base
  let baseBranch: string;
  try {
    baseBranch = await platformClient.getDefaultBranch();
  } catch {
    baseBranch = 'main';
  }

  for (const plan of plans) {
    try {
      // Check for existing PR (Property 29: deduplication)
      const existingPR = await platformClient.findExistingPR(plan.branchName);

      if (existingPR) {
        // Update existing PR
        const title = buildPRTitle(plan);
        const body = buildPRDescription(plan);

        const updateResult = await platformClient.updatePullRequest(
          existingPR.number,
          { title, body },
        );

        results.push({
          branchName: plan.branchName,
          title,
          type: plan.type,
          status: 'updated',
          url: updateResult.url,
          prNumber: updateResult.number,
          itemCount: plan.items.length,
        });
        updated++;
        continue;
      }

      // Create new branch and PR
      const branchExists = await gitOps.branchExists(plan.branchName);
      if (!branchExists) {
        await gitOps.createBranch(plan.branchName);
      }
      await gitOps.checkout(plan.branchName);

      // Commit a placeholder change (actual code transforms are done separately)
      const title = buildPRTitle(plan);
      await gitOps.commitChanges([], title);
      await gitOps.push(plan.branchName);

      // Create PR
      const body = buildPRDescription(plan);
      const prResult = await platformClient.createPullRequest({
        title,
        body,
        baseBranch,
        headBranch: plan.branchName,
        labels,
        reviewers,
        draft,
      });

      results.push({
        branchName: plan.branchName,
        title,
        type: plan.type,
        status: 'created',
        url: prResult.url,
        prNumber: prResult.number,
        itemCount: plan.items.length,
      });
      created++;
    } catch (err) {
      const title = buildPRTitle(plan);
      results.push({
        branchName: plan.branchName,
        title,
        type: plan.type,
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        itemCount: plan.items.length,
      });
      failed++;
    }
  }

  return {
    created: results,
    summary: {
      totalPlanned: plans.length,
      created,
      updated,
      skipped,
      failed,
    },
  };
}
