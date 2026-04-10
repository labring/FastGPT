// src/skills/base.ts
// Skill 基类和类型

import type { LLMProvider } from '../ports/llm';
import type { Logger } from '../ports/logger';
import { getLogger } from '../utils/logger';

/**
 * Skill 输入
 */
export interface SkillInput {
  context?: RequestContext;
  [key: string]: unknown;
}

/**
 * Skill 输出
 */
export interface SkillOutput {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * 简化的 RequestContext（部分字段）
 */
export interface RequestContext {
  datasetIds: string[];
  emit?: (step: string, detail?: string) => void;
  [key: string]: unknown;
}

/**
 * Skill 错误
 */
export class SkillError extends Error {
  constructor(
    message: string,
    public skillName: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SkillError';
  }
}

/**
 * Skill 基类
 */
export abstract class BaseSkill {
  abstract name: string;
  abstract description: string;

  protected llm?: LLMProvider;

  protected get logger(): Logger | undefined {
    return getLogger();
  }

  initialize(llm: LLMProvider): void {
    this.llm = llm;
  }

  abstract execute(input: SkillInput): Promise<SkillOutput>;

  /**
   * 流式执行（可选实现，用于 TTFT 统计）
   * 默认实现：调用同步 execute 并 yield 结果
   */
  async *executeStream(_input: SkillInput): AsyncGenerator<SkillOutput> {
    const result = await this.execute(_input);
    yield result;
  }

  protected fail(error: string): SkillOutput {
    return { success: false, error };
  }

  protected success(data?: unknown): SkillOutput {
    return { success: true, data };
  }
}
