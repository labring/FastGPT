import type { SkillPackageType } from '@fastgpt/global/core/agentSkills/type';
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/agentSkills/constants';

/**
 * Parse YAML frontmatter from markdown content
 * Returns { frontmatter: object, content: string }
 */
export function parseSkillMarkdown(markdown: string): {
  frontmatter: Record<string, any>;
  content: string;
  error?: string;
} {
  // Check for YAML frontmatter delimited by ---
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: markdown,
      error: 'SKILL.md must contain YAML frontmatter (delimited by ---)'
    };
  }

  const yamlContent = match[1];
  const bodyContent = match[2];

  try {
    const frontmatter = parseYamlFrontmatter(yamlContent);
    return {
      frontmatter,
      content: bodyContent
    };
  } catch (error: any) {
    return {
      frontmatter: {},
      content: markdown,
      error: `Failed to parse frontmatter: ${error.message}`
    };
  }
}

/**
 * Simple YAML parser for frontmatter
 * Handles simple key: value and nested objects
 */
function parseYamlFrontmatter(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');
  let currentObj = result;
  const stack: { key: string; obj: Record<string, any> }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for object nesting (metadata:)
    if (trimmed.endsWith(':')) {
      const key = trimmed.slice(0, -1).trim();
      currentObj[key] = {};
      stack.push({ key, obj: currentObj });
      currentObj = currentObj[key] as Record<string, any>;
      continue;
    }

    // Parse key: value
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    // Handle different value types
    if (value.startsWith('"') || value.startsWith("'")) {
      // String literal
      currentObj[key] = value.slice(1, -1);
    } else if (value === 'true') {
      currentObj[key] = true;
    } else if (value === 'false') {
      currentObj[key] = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      currentObj[key] = Number(value);
    } else if (value === 'null') {
      currentObj[key] = null;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      // Array
      const arrayContent = value.slice(1, -1).trim();
      currentObj[key] = arrayContent
        ? arrayContent.split(',').map((item) => item.trim().replace(/["']/g, ''))
        : [];
    } else {
      // // Plain string
      currentObj[key] = value;
    }
  }

  return result;
}

/**
 * Extract skill metadata from SKILL.md frontmatter
 * Returns FastGPT skill object format
 */
export function extractSkillFromMarkdown(markdown: string): { skill: any; error?: string } {
  const { frontmatter, content, error } = parseSkillMarkdown(markdown);

  if (error) {
    return { skill: null, error };
  }

  // Validate required fields
  if (!frontmatter.name) {
    return { skill: null, error: 'Frontmatter field "name" is required' };
  }

  if (!frontmatter.description) {
    return { skill: null, error: 'Frontmatter field "description" is required' };
  }

  // Ensure name is always treated as a string (YAML parser may convert numeric names to number)
  const skillName = String(frontmatter.name);

  // Validate name format (lowercase, numbers, hyphens only; no consecutive hyphens; no leading/trailing hyphens)
  const nameRegex = /^[a-z0-9]([a-z0-9]|-(?!-))*[a-z0-9]$|^[a-z0-9]$/;
  if (!nameRegex.test(skillName)) {
    return {
      skill: null,
      error:
        'Name must contain only lowercase letters, numbers, and hyphens; cannot start/end with hyphen; no consecutive hyphens'
    };
  }

  // Validate name length (max 64 per spec, but FastGPT uses 50)
  if (skillName.length > 50) {
    return { skill: null, error: 'Name must be less than 50 characters' };
  }

  // Truncate description if too long (max 500 characters)
  const description = frontmatter.description.slice(0, 500);

  // Build FastGPT skill object
  const skill: any = {
    name: skillName,
    description,
    category: [AgentSkillCategoryEnum.other], // default
    config: {}
  };

  // Map frontmatter fields to FastGPT format
  if (frontmatter.license) {
    skill.config.license = frontmatter.license;
  }

  if (frontmatter.compatibility) {
    skill.config.compatibility = frontmatter.compatibility;
  }

  if (frontmatter['allowed-tools']) {
    skill.config['allowed-tools'] = frontmatter['allowed-tools'];
  }

  // Map metadata fields to config
  if (frontmatter.metadata && typeof frontmatter.metadata === 'object') {
    const metadata = frontmatter.metadata as Record<string, any>;

    // category from metadata
    if (metadata.category) {
      if (Array.isArray(metadata.category)) {
        skill.category = metadata.category;
      } else if (typeof metadata.category === 'string') {
        skill.category = metadata.category.split(',').map((c) => c.trim());
      }

      // Validate categories
      const validCategories = Object.values(AgentSkillCategoryEnum);
      const invalidCategories = skill.category.filter(
        (c: string) => !validCategories.includes(c as AgentSkillCategoryEnum)
      );

      if (invalidCategories.length > 0) {
        skill.category = ['other']; // fallback to default
      }
    }

    // Copy other metadata to config
    for (const [key, value] of Object.entries(metadata)) {
      if (key !== 'category') {
        skill.config[key] = value;
      }
    }
  }

  return { skill };
}

/**
 * Validate skill package structure
 */
export function validateSkillPackage(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid package format' };
  }

  const { skill } = data;

  // Check required fields
  if (!skill || typeof skill !== 'object') {
    return { valid: false, error: 'Missing skill metadata' };
  }

  if (!skill.name || typeof skill.name !== 'string' || skill.name.trim().length === 0) {
    return { valid: false, error: 'Skill name is required' };
  }

  if (skill.name.length > 50) {
    return { valid: false, error: 'Skill name must be less than 50 characters' };
  }

  // Validate description length
  if (skill.description && skill.description.length > 500) {
    return { valid: false, error: 'Description must be less than 500 characters' };
  }

  // Validate category
  if (skill.category) {
    if (!Array.isArray(skill.category)) {
      return { valid: false, error: 'Category must be an array' };
    }

    const validCategories = Object.values(AgentSkillCategoryEnum);
    const invalidCategories = skill.category.filter(
      (c: string) => !validCategories.includes(c as AgentSkillCategoryEnum)
    );

    if (invalidCategories.length > 0) {
      return { valid: false, error: `Invalid categories: ${invalidCategories.join(', ')}` };
    }
  }

  // Validate config
  if (skill.config && typeof skill.config !== 'object') {
    return { valid: false, error: 'Config must be an object' };
  }

  return { valid: true };
}

/**
 * Parse skill package from JSON string or object
 */
export function parseSkillPackage(data: string | object): {
  success: boolean;
  package?: SkillPackageType;
  error?: string;
} {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;

    const validation = validateSkillPackage(parsed);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    return {
      success: true,
      package: parsed as SkillPackageType
    };
  } catch (error) {
    return { success: false, error: 'Failed to parse skill package: ' + (error as Error).message };
  }
}

/**
 * Sanitize skill name for file system
 */
export function sanitizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '_') // Allow Chinese characters
    .replace(/_+/g, '_')
    .substring(0, 50);
}

/**
 * Create default skill package template
 */
export function createSkillTemplate(name: string): SkillPackageType {
  return {
    skill: {
      name: name || 'New Skill',
      description: 'Enter a description for your skill',
      category: [AgentSkillCategoryEnum.other],
      config: {}
    }
  };
}
