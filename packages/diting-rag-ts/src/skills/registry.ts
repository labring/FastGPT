// src/skills/registry.ts
// Skill 注册表

import type { BaseSkill, SkillInput, SkillOutput } from './base';
import { getLogger } from '../utils/logger';

/**
 * Skill 注册表
 */
export class SkillRegistry {
  private static skills = new Map<string, BaseSkill>();

  /**
   * 注册 Skill
   */
  static register(skill: BaseSkill): void {
    if (this.skills.has(skill.name)) {
      getLogger()?.warn(`Skill ${skill.name} already registered, overwriting`);
    }
    this.skills.set(skill.name, skill);
  }

  /**
   * 获取 Skill
   */
  static get(name: string): BaseSkill | undefined {
    return this.skills.get(name);
  }

  /**
   * 获取所有 Skill 名称
   */
  static list(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * 检查 Skill 是否存在
   */
  static has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * 执行 Skill
   */
  static async execute(name: string, input: SkillInput): Promise<SkillOutput> {
    const skill = this.skills.get(name);
    if (!skill) {
      return { success: false, error: `Skill ${name} not found` };
    }
    return skill.execute(input);
  }

  /**
   * 清空注册表（用于测试）
   */
  static clear(): void {
    this.skills.clear();
  }
}
