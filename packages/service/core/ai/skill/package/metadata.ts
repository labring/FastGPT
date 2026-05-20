import type { SkillPackageType } from '@fastgpt/global/core/ai/skill/type';
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/ai/skill/constants';

/**
 * 校验 JSON 形式的 skill package 元数据结构。
 *
 * 这里处理的是对象级 package metadata，不负责 zip/tar 解压，也不解析 SKILL.md。
 * 归到 package 模块后，导入、导出和测试可以把“包内容”和“包元数据”放在同一边界内理解。
 */
export function validateSkillPackage(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid package format' };
  }

  const { skill } = data;

  if (!skill || typeof skill !== 'object') {
    return { valid: false, error: 'Missing skill metadata' };
  }

  if (!skill.name || typeof skill.name !== 'string' || skill.name.trim().length === 0) {
    return { valid: false, error: 'Skill name is required' };
  }

  if (skill.name.length > 50) {
    return { valid: false, error: 'Skill name must be less than 50 characters' };
  }

  if (skill.description && skill.description.length > 500) {
    return { valid: false, error: 'Description must be less than 500 characters' };
  }

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

  return { valid: true };
}

/**
 * 从 JSON 字符串或对象解析出 SkillPackageType。
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
 * 将 package metadata 中的 skill name 清理成历史兼容的文件名形式。
 */
export function sanitizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

/**
 * 创建 JSON package metadata 默认模板。
 */
export function createSkillTemplate(name: string): SkillPackageType {
  return {
    skill: {
      name: name || 'New Skill',
      description: 'Enter a description for your skill',
      category: [AgentSkillCategoryEnum.other]
    }
  };
}
