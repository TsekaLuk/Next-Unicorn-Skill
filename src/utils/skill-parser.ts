/**
 * SKILL.md parser and serializer.
 *
 * Parses YAML frontmatter (between `---` delimiters) and the markdown body.
 * Uses a hand-rolled YAML parser — no external YAML library required.
 * The frontmatter is simple key-value pairs and a tags array.
 */

export interface SkillDocument {
  frontmatter: {
    name: string;
    description: string;
    version: string;
    author: string;
    tags: string[];
  };
  body: string; // markdown SOP
}

/**
 * Parse a SKILL.md string into a SkillDocument.
 *
 * Expects the content to start with `---`, followed by YAML frontmatter,
 * closed by another `---`, then the markdown body.
 */
export function parseSkillMd(content: string): SkillDocument {
  const lines = content.split('\n');

  // First line must be the opening `---`
  if (lines[0]?.trim() !== '---') {
    throw new Error('SKILL.md must start with --- frontmatter delimiter');
  }

  // Find the closing `---`
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    throw new Error('SKILL.md missing closing --- frontmatter delimiter');
  }

  // Extract frontmatter lines (between the two --- delimiters)
  const frontmatterLines = lines.slice(1, closingIndex);
  const frontmatter = parseFrontmatter(frontmatterLines);

  // Extract body — everything after the closing ---
  // Skip one blank line after --- if present, but preserve the rest
  const bodyLines = lines.slice(closingIndex + 1);

  // The body starts after the closing delimiter.
  // If the first line is empty, it's the conventional blank line separator — skip it.
  let body: string;
  if (bodyLines.length > 0 && bodyLines[0]?.trim() === '') {
    body = bodyLines.slice(1).join('\n');
  } else {
    body = bodyLines.join('\n');
  }

  return { frontmatter, body };
}

/**
 * Serialize a SkillDocument back to a SKILL.md string.
 */
export function serializeSkillMd(doc: SkillDocument): string {
  const fm = doc.frontmatter;
  const frontmatterLines = [
    '---',
    `name: ${yamlEscapeValue(fm.name)}`,
    `description: ${yamlEscapeValue(fm.description)}`,
    `version: ${yamlEscapeValue(fm.version)}`,
    `author: ${yamlEscapeValue(fm.author)}`,
    'tags:',
    ...fm.tags.map((tag) => `  - ${yamlEscapeValue(tag)}`),
    '---',
  ];

  return frontmatterLines.join('\n') + '\n\n' + doc.body;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse simple YAML frontmatter lines into the frontmatter object.
 * Supports:
 *   - `key: value` scalar pairs
 *   - `key:` followed by `  - item` array entries
 */
function parseFrontmatter(lines: string[]): SkillDocument['frontmatter'] {
  const result: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue;

    // Check if this is an array item (starts with whitespace + -)
    const arrayItemMatch = line.match(/^\s+-\s+(.*)$/);
    if (arrayItemMatch && currentKey !== null) {
      const existing = result[currentKey];
      const value = yamlUnescapeValue(arrayItemMatch[1]?.trim() ?? '');
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[currentKey] = [value];
      }
      continue;
    }

    // Check if this is a key-value pair
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1] as string;
      const rawValue = kvMatch[2]?.trim() ?? '';
      currentKey = key;

      if (rawValue === '') {
        // This key introduces an array (value will come from subsequent - lines)
        result[key] = [];
      } else {
        result[key] = yamlUnescapeValue(rawValue);
      }
      continue;
    }
  }

  // Validate required fields
  const name = result['name'];
  const description = result['description'];
  const version = result['version'];
  const author = result['author'];
  const tags = result['tags'];

  if (typeof name !== 'string') throw new Error('Frontmatter missing required field: name');
  if (typeof description !== 'string') throw new Error('Frontmatter missing required field: description');
  if (typeof version !== 'string') throw new Error('Frontmatter missing required field: version');
  if (typeof author !== 'string') throw new Error('Frontmatter missing required field: author');
  if (!Array.isArray(tags)) throw new Error('Frontmatter missing required field: tags');

  return { name, description, version, author, tags };
}

/**
 * Escape a YAML scalar value. If the value contains characters that could
 * be misinterpreted (colons, quotes, leading/trailing whitespace, etc.),
 * wrap it in double quotes with internal quotes escaped.
 */
function yamlEscapeValue(value: string): string {
  // If the value needs quoting (contains special chars or leading/trailing whitespace)
  if (
    value === '' ||
    value !== value.trim() ||
    value.includes(':') ||
    value.includes('#') ||
    value.includes('"') ||
    value.includes("'") ||
    value.includes('\n') ||
    value.includes('\\') ||
    value.startsWith('[') ||
    value.startsWith('{') ||
    value.startsWith('- ')
  ) {
    // Double-quote the value, escaping internal backslashes and double quotes
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
    return `"${escaped}"`;
  }
  return value;
}

/**
 * Unescape a YAML scalar value. Removes surrounding quotes and processes
 * escape sequences.
 */
function yamlUnescapeValue(value: string): string {
  // Handle double-quoted strings
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    const inner = value.slice(1, -1);
    return inner
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  // Handle single-quoted strings
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    const inner = value.slice(1, -1);
    return inner.replace(/''/g, "'");
  }

  return value;
}
