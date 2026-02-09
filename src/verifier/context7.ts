// No longer depends on Detection — recommendations come from the AI agent

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * Result of verifying a single library recommendation against Context7 MCP.
 */
export interface VerificationResult {
  status: 'verified' | 'unverified' | 'unavailable';
  libraryId?: string;
  documentationUrl?: string;
  version?: string;
  note?: string;
}

/**
 * Client interface for Context7 MCP integration.
 * Designed for easy mocking in tests — the real implementation calls
 * Context7 MCP tools (`resolve-library-id` and `get-library-docs`).
 */
export interface Context7Client {
  resolveLibraryId(libraryName: string): Promise<string | null>;
  getLibraryDocs(
    libraryId: string,
    useCase: string,
  ): Promise<{ url: string; version: string } | null>;
}

// ---------------------------------------------------------------------------
// Single recommendation verification (with retry-once logic)
// ---------------------------------------------------------------------------

/**
 * Verify a single library recommendation against Context7 MCP.
 *
 * Flow:
 * 1. Call `resolveLibraryId` to get the canonical library ID.
 *    - If it returns `null` → status "unverified" (library not found).
 *    - If it throws → retry once. If still failing → status "unavailable".
 * 2. Call `getLibraryDocs` with the library ID and use case.
 *    - If it returns docs → status "verified" with URL and version.
 *    - If it returns `null` → status "unverified" (use case not confirmed).
 *    - If it throws → retry once. If still failing → status "unavailable".
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 9.5
 */
export async function verifyRecommendation(
  client: Context7Client,
  libraryName: string,
  useCase: string,
): Promise<VerificationResult> {
  // Step 1: Resolve library ID (with retry-once on failure)
  let libraryId: string | null;
  try {
    libraryId = await client.resolveLibraryId(libraryName);
  } catch {
    // Retry once
    try {
      libraryId = await client.resolveLibraryId(libraryName);
    } catch {
      return {
        status: 'unavailable',
        note: `Context7 service error resolving library "${libraryName}" after retry`,
      };
    }
  }

  // Library not found in Context7
  if (libraryId === null) {
    return {
      status: 'unverified',
      note: `Library "${libraryName}" not found in Context7`,
    };
  }

  // Step 2: Get library docs (with retry-once on failure)
  let docs: { url: string; version: string } | null;
  try {
    docs = await client.getLibraryDocs(libraryId, useCase);
  } catch {
    // Retry once
    try {
      docs = await client.getLibraryDocs(libraryId, useCase);
    } catch {
      return {
        status: 'unavailable',
        libraryId,
        note: `Context7 service error fetching docs for "${libraryName}" after retry`,
      };
    }
  }

  // Use case not confirmed by documentation
  if (docs === null) {
    return {
      status: 'unverified',
      libraryId,
      note: `Documentation for "${libraryName}" does not confirm use case "${useCase}"`,
    };
  }

  // Fully verified
  return {
    status: 'verified',
    libraryId,
    documentationUrl: docs.url,
    version: docs.version,
  };
}

// ---------------------------------------------------------------------------
// Batch verification for all detections
// ---------------------------------------------------------------------------

/**
 * Item describing a library recommendation to verify.
 * The libraryName and useCase come from the AI agent's recommendation,
 * NOT from hardcoded catalog data.
 */
export interface VerificationItem {
  libraryName: string;
  useCase: string;
}

/**
 * Verify all library recommendations provided by the AI agent (or caller).
 *
 * Each item in the array corresponds to a detection by index. Items that are
 * `null` are skipped (detection had no recommendation from the agent).
 *
 * Processes each item independently — a failure for one library does
 * not affect others. Returns a Map keyed by detection index.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 9.5
 */
export async function verifyAllRecommendations(
  client: Context7Client,
  items: Array<VerificationItem | null>,
): Promise<Map<number, VerificationResult>> {
  const results = new Map<number, VerificationResult>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const result = await verifyRecommendation(
      client,
      item.libraryName,
      item.useCase,
    );
    results.set(i, result);
  }

  return results;
}
