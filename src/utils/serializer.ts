import { OutputSchema } from '../schemas/output.schema.js';

/**
 * Serialize a validated OutputSchema object to a compact JSON string.
 */
export function serializeOutput(output: OutputSchema): string {
  return JSON.stringify(output);
}

/**
 * Deserialize a JSON string into a validated OutputSchema object.
 * Runs the parsed JSON through the Zod schema for validation.
 * Throws a ZodError if the JSON does not conform to the schema.
 */
export function deserializeOutput(json: string): OutputSchema {
  const parsed: unknown = JSON.parse(json);
  return OutputSchema.parse(parsed);
}

/**
 * Pretty-print a validated OutputSchema object as human-readable JSON
 * with consistent 2-space indentation.
 */
export function prettyPrint(output: OutputSchema): string {
  return JSON.stringify(output, null, 2);
}
