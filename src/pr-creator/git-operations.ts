/**
 * Git Operations — injectable interface for git CLI operations.
 *
 * Real implementation shells out to git CLI.
 * Designed for testability via interface injection.
 *
 * Requirements: 12.2
 */

import type { FileChange } from './platform-client.js';

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

/**
 * Interface for git operations.
 */
export interface GitOperations {
  /** Create a new branch from the current HEAD */
  createBranch(branchName: string): Promise<void>;

  /** Checkout an existing branch */
  checkout(branchName: string): Promise<void>;

  /** Stage and commit file changes */
  commitChanges(
    changes: FileChange[],
    message: string,
  ): Promise<{ sha: string }>;

  /** Push a branch to the remote */
  push(branchName: string): Promise<void>;

  /** Check if a branch exists locally or remotely */
  branchExists(branchName: string): Promise<boolean>;

  /** Get the current branch name */
  getCurrentBranch(): Promise<string>;
}
