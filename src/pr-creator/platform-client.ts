/**
 * Platform Client — injectable interface for git hosting platform APIs.
 *
 * Supports GitHub, GitLab, and Bitbucket.
 *
 * Requirements: 12.1, 12.5
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PlatformType = 'github' | 'gitlab' | 'bitbucket';

export interface PullRequestInput {
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  labels: string[];
  reviewers: string[];
  draft: boolean;
}

export interface PullRequestResult {
  id: number;
  url: string;
  number: number;
  status: 'created' | 'updated' | 'failed';
  errorMessage?: string;
}

export interface FileChange {
  path: string;
  content: string;
  /** Operation type */
  operation: 'create' | 'update' | 'delete';
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

/**
 * Client interface for git hosting platform APIs.
 * Injectable for testability.
 */
export interface PlatformClient {
  /** Which platform this client connects to */
  platform: PlatformType;

  /** Create a new pull request */
  createPullRequest(input: PullRequestInput): Promise<PullRequestResult>;

  /** Update an existing pull request */
  updatePullRequest(
    prNumber: number,
    input: Partial<PullRequestInput>,
  ): Promise<PullRequestResult>;

  /** Check if a PR already exists for the given branch */
  findExistingPR(headBranch: string): Promise<PullRequestResult | null>;

  /** Get the default branch name */
  getDefaultBranch(): Promise<string>;
}
