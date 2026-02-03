import type { SkillPackageType } from '@fastgpt/global/core/agentSkill/type';
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/agentSkill/constants';

/**
 * Validate skill package structure
 */
export function validateSkillPackage(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid package format' };
  }

  const { skill, markdown } = data;

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

  if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
    return { valid: false, error: 'Skill markdown (SKILL.md content) is required' };
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
      category: ['other'],
      config: {}
    },
    markdown: `# ${name || 'New Skill'}\n\n## Description\n\nDescribe what this skill does and how to use it.\n\n## Parameters\n\nList the parameters this skill accepts.\n\n## Examples\n\nProvide examples of how to use this skill.\n`
  };
}
