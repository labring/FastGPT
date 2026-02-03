/**
 * SKILL.md Builder
 *
 * This module provides utilities for building and manipulating SKILL.md files
 * following the Agent Skills specification.
 */

export type BuildSkillMdParams = {
  name: string;
  description: string;
  markdown: string;
};

/**
 * Build a complete SKILL.md content with frontmatter and body
 */
export function buildSkillMd(params: BuildSkillMdParams): string {
  const frontmatter = generateFrontmatter(params.name, params.description);
  return `${frontmatter}\n\n${params.markdown}`;
}

/**
 * Generate YAML frontmatter for SKILL.md
 */
export function generateFrontmatter(name: string, description: string): string {
  const escapedName = escapeYaml(name);
  const escapedDescription = escapeYaml(description);

  return `---\nname: ${escapedName}\ndescription: ${escapedDescription}\n---`;
}

/**
 * Parse frontmatter from SKILL.md content
 */
export function parseFrontmatter(content: string): {
  name: string;
  description: string;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }

  const frontmatterText = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Parse name
  const nameMatch = frontmatterText.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? unescapeYaml(nameMatch[1].trim()) : '';

  // Parse description
  const descMatch = frontmatterText.match(/^description:\s*(.+)$/m);
  const description = descMatch ? unescapeYaml(descMatch[1].trim()) : '';

  return { name, description, body };
}

/**
 * Escape a string for use in YAML
 */
export function escapeYaml(value: string): string {
  if (value === '') {
    return '""';
  }

  // Check if value needs quoting
  const needsQuoting =
    /[:#{}\[\],&*?|<>!=~`@]/.test(value) ||
    /^[-?]/.test(value) ||
    value.includes('\n') ||
    value.includes('"') ||
    /^true$|^false$|^null$|^~$/i.test(value);

  if (!needsQuoting) {
    return value;
  }

  // Handle multi-line strings
  if (value.includes('\n')) {
    // Use literal block scalar for multi-line strings
    const lines = value.split('\n');
    return '|\n' + lines.map((line) => '  ' + line).join('\n');
  }

  // Escape double quotes
  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Unescape a YAML string value
 */
export function unescapeYaml(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'");
  }
  return value;
}

/**
 * Validate skill name according to Agent Skills spec
 */
export function validateSkillName(name: string): boolean {
  // Must be 1-64 characters
  if (name.length === 0 || name.length > 64) {
    return false;
  }

  // Must only contain lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9-]+$/.test(name)) {
    return false;
  }

  // Must not start or end with hyphen
  if (name.startsWith('-') || name.endsWith('-')) {
    return false;
  }

  // Must not contain consecutive hyphens
  if (name.includes('--')) {
    return false;
  }

  return true;
}

/**
 * Sanitize a skill name for use as a file/directory name
 */
export function sanitizeSkillNameForFile(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * Extract skill name from SKILL.md content
 */
export function extractSkillNameFromSkillMd(content: string): string {
  try {
    const { name } = parseFrontmatter(content);
    return name;
  } catch {
    // Fallback: try to extract from first header
    const headerMatch = content.match(/^#\s+(.+)$/m);
    return headerMatch ? sanitizeSkillNameForFile(headerMatch[1]) : 'unnamed-skill';
  }
}

/**
 * Extract description from SKILL.md content
 */
export function extractDescriptionFromSkillMd(content: string): string {
  try {
    const { description } = parseFrontmatter(content);
    return description;
  } catch {
    return '';
  }
}
