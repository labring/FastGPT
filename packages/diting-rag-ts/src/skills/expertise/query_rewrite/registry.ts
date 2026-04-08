// src/skills/expertise/query_rewrite/registry.ts
// StrategyRegistry - 策略池注册表

import { readFileSync } from 'fs';
import type { RewriteStrategySpec } from './types';
import { DEFAULT_STRATEGIES } from './types';
import { getLogger } from '../../../utils/logger';

/**
 * StrategyRegistry - 策略池注册表
 *
 * 用法:
 *   const registry = new StrategyRegistry()              // 空注册表
 *   const registry = StrategyRegistry.default()          // 加载默认策略
 *   const registry = StrategyRegistry.fromDirectory(dir) // 从目录加载 YAML
 *   registry.register(spec)                               // 编程式注册
 */
export class StrategyRegistry {
  private strategies: Map<string, RewriteStrategySpec> = new Map();

  // ---------- CRUD ----------

  register(spec: RewriteStrategySpec): void {
    this.strategies.set(spec.name, spec);
  }

  unregister(name: string): void {
    this.strategies.delete(name);
  }

  get(name: string): RewriteStrategySpec | undefined {
    return this.strategies.get(name);
  }

  listNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  listEnabled(): string[] {
    return Array.from(this.strategies.values())
      .filter((s) => s.enabled)
      .map((s) => s.name);
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }

  get size(): number {
    return this.strategies.size;
  }

  [Symbol.iterator](): Iterator<[string, RewriteStrategySpec]> {
    return this.strategies[Symbol.iterator]();
  }

  // ---------- 批量加载 ----------

  /**
   * 从目录加载所有 .yaml/.yml 策略文件
   */
  loadDirectory(directory: string): number {
    let count = 0;
    try {
      const { globSync } = require('glob');
      const files = globSync('*.y*ml', { cwd: directory, absolute: true });

      for (const filepath of files) {
        try {
          const spec = this.loadYaml(filepath);
          if (spec) count++;
        } catch (e) {
          getLogger()?.warn(`Failed to load strategy from ${filepath}:`, {
            message: e instanceof Error ? e.message : String(e)
          });
        }
      }
    } catch (e) {
      getLogger()?.warn(`Failed to load directory ${directory}:`, {
        message: e instanceof Error ? e.message : String(e)
      });
    }
    return count;
  }

  /**
   * 加载单个 YAML 文件
   */
  loadYaml(filepath: string): RewriteStrategySpec | null {
    try {
      const content = readFileSync(filepath, 'utf-8');
      // 简单 YAML 解析（只支持基本格式）
      const spec = this.parseYaml(content);
      if (spec && spec.name) {
        this.register(spec);
        return spec;
      }
    } catch (e) {
      getLogger()?.warn(`Failed to load YAML from ${filepath}:`, {
        message: e instanceof Error ? e.message : String(e)
      });
    }
    return null;
  }

  /**
   * 简单 YAML 解析（支持基本格式）
   */
  private parseYaml(content: string): RewriteStrategySpec | null {
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentList: Array<{ input: string; output: string }> = [];
    let inExamples = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 检查 examples 节
      if (trimmed === 'examples:') {
        inExamples = true;
        continue;
      }

      if (inExamples) {
        // 解析 - input: xxx
        const inputMatch = trimmed.match(/^- input:\s*(.+)$/);
        if (inputMatch) {
          currentList.push({ input: inputMatch[1].trim(), output: '' });
          continue;
        }
        // 解析 - output: xxx
        const outputMatch = trimmed.match(/^- output:\s*(.+)$/);
        if (outputMatch && currentList.length > 0) {
          currentList[currentList.length - 1].output = outputMatch[1].trim();
          continue;
        }
        // examples 结束
        if (!trimmed.startsWith('-') && !trimmed.startsWith('  ')) {
          if (currentList.length > 0) {
            result.examples = currentList;
          }
          inExamples = false;
          currentList = [];
        }
      }

      // 解析 key: value
      const match = trimmed.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();

        if (value) {
          // 布尔值
          if (value === 'true') result[key] = true;
          else if (value === 'false') result[key] = false;
          // 数字
          else if (/^\d+$/.test(value)) result[key] = parseInt(value, 10);
          else result[key] = value;
        } else {
          // key with empty value - multi-line value context (not parsed further)
          void key;
        }
      }
    }

    if (currentList.length > 0) {
      result.examples = currentList;
    }

    // 填充默认值
    const spec = result as Partial<RewriteStrategySpec>;
    return {
      name: spec.name || 'unknown',
      display_name: spec.display_name || spec.name || 'Unknown',
      description: spec.description || '',
      prompt_template: spec.prompt_template || '',
      applicable_when: spec.applicable_when || '',
      examples: spec.examples || [],
      priority: spec.priority ?? 0,
      exclusive_group: spec.exclusive_group || '',
      enabled: spec.enabled ?? true,
      parallel_search: spec.parallel_search ?? true
    };
  }

  // ---------- LLM 对接 ----------

  /**
   * 为 LLM 选择生成策略描述（仅启用状态，按优先级排序）
   */
  formatForSelection(): string {
    const enabled = Array.from(this.strategies.values())
      .filter((s) => s.enabled)
      .sort((a, b) => b.priority - a.priority);

    const lines: string[] = [];
    for (const spec of enabled) {
      lines.push(
        `- **${spec.name}** (${spec.display_name}): ${spec.description}\n` +
          `  When to use: ${spec.applicable_when}`
      );
    }
    return lines.join('\n');
  }

  /**
   * 为选中的策略生成重写指令（包含 few-shot examples）
   */
  getRewriteInstructions(names: string[], query: string): string {
    const instructions: string[] = [];
    for (let i = 0; i < names.length; i++) {
      const spec = this.strategies.get(names[i]);
      if (!spec) continue;

      let exampleStr = '';
      if (spec.examples && spec.examples.length > 0) {
        const ex = spec.examples[0];
        exampleStr = `\n  Example input: ${ex.input}\n  Example output: ${ex.output}`;
      }

      const prompt = spec.prompt_template.replace('{query}', query);
      instructions.push(
        `${i + 1}. Strategy **${spec.name}** (${spec.display_name}): ` + `${prompt}${exampleStr}`
      );
    }
    return instructions.join('\n');
  }

  /**
   * 强制执行互斥组约束 - 每个互斥组只保留最高优先级的策略
   */
  enforceExclusiveGroups(names: string[]): string[] {
    if (!names || names.length === 0) return names;

    const groupBest: Map<string, [string, number]> = new Map(); // group -> (name, priority)
    const noGroup: string[] = [];

    for (const name of names) {
      const spec = this.strategies.get(name);
      if (!spec) continue;

      if (spec.exclusive_group) {
        const group = spec.exclusive_group;
        const existing = groupBest.get(group);
        if (!existing || spec.priority > existing[1]) {
          groupBest.set(group, [name, spec.priority]);
        }
      } else {
        noGroup.push(name);
      }
    }

    return [...noGroup, ...Array.from(groupBest.values()).map(([n]) => n)];
  }

  // ---------- 工厂方法 ----------

  /**
   * 创建默认注册表（加载内置策略）
   */
  static default(): StrategyRegistry {
    const registry = new StrategyRegistry();
    for (const spec of DEFAULT_STRATEGIES) {
      registry.register(spec);
    }
    return registry;
  }

  /**
   * 从目录创建注册表
   */
  static fromDirectory(directory: string): StrategyRegistry {
    const registry = new StrategyRegistry();
    registry.loadDirectory(directory);
    // 如果目录加载为空，添加默认策略
    if (registry.size === 0) {
      for (const spec of DEFAULT_STRATEGIES) {
        registry.register(spec);
      }
    }
    return registry;
  }
}
