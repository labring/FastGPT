// src/skills/expertise/query_rewrite/index.ts
// Query Rewrite Skill - BATCH 架构（对齐 Python 版）
// 单次 LLM 调用完成所有策略改写，返回结构化 rewrites 带 parallel 信息

import type { SkillInput, SkillOutput } from '../../base';
import { BaseSkill } from '../../base';
import type { LLMMessage } from '../../../types/message';
import { detectLang } from '../../../utils/lang';
import { StrategyRegistry } from './registry';
import type { RewriteStrategySpec } from './types';

export { StrategyRegistry };
export type { RewriteStrategySpec };

// ============================================================
// 公共类型
// ============================================================

export interface QueryRewriteOptions {
  query: string;
  history?: LLMMessage[];
  strategy?: string;
  /** 调用方预先检索到的上下文（如 SQL 结果），引导改写生成补充性而非重复性查询 */
  priorContext?: string;
  /** 多语言目标列表。非空时启用 multilingual_expand 策略探测 KB 语言分布 */
  targetLanguages?: string[];
}

/** 单条改写结果（结构化） */
export interface RewriteEntry {
  strategy: string;
  queries: string[];
  parallel?: boolean;
  step?: number;
  depends_on?: number;
  note?: string;
}

/** QueryRewriteSkill 完整输出 */
export interface QueryRewriteResult {
  rewrites: RewriteEntry[];
  strategies_used: string[];
  selection_reasoning: string;
  /** 兼容旧接口：扁平查询列表 */
  queries: string[];
  /** decompose 策略专用：比较对象列表 */
  compare_objects?: string[];
  /** decompose 策略专用：显式维度（用户明确提到的） */
  explicit_dimensions?: string[];
  /** decompose 策略专用：隐式维度（推断的） */
  implicit_dimensions?: string[];
}

export type RewriteStrategy = 'cce' | 'decompose' | 'gqr' | 'kwr' | 'par' | 'step_back';

// ============================================================
// Prompts（对齐 Python）
// ============================================================

const STRATEGY_SELECTION_PROMPT = `You are a query analysis expert. Based on the characteristics of the user's query, \
select the most appropriate rewrite strategies from the pool below.

## Strategy Pool
{strategy_descriptions}

## Rules
- Select 1-{max_strategies} most appropriate strategies
- Not all strategies need to be used — selecting the right ones matters more than selecting many
- For simple, clear queries, one strategy or even no rewrite may suffice
- Return strategy names and reasoning

## User Query
{query}

Return as JSON:
{"strategies": ["strategy_name_1", "strategy_name_2"], "reasoning": "selection reasoning"}`;

const BATCH_REWRITE_PROMPT = `Rewrite the following query according to the specified strategies. \
Each strategy should be executed independently to produce different query variants.

**Language**: Write queries in the language most likely to match documents in the knowledge base. \
If the KB contains documents in multiple languages, use the language that maximizes recall for each query. \
Do NOT force queries to match the original query's language if documents exist in other languages.

## Original Query
{query}

{prior_context_section}## Instructions
{strategy_instructions}

Return as JSON:
{"rewrites": [{"strategy": "strategy_name", "queries": ["rewritten query"]}]}`;

// ============================================================
// 解析工具函数
// ============================================================

function parseJsonSafe(text: string): Record<string, unknown> | null {
  // 提取第一个 {...} 块（可能被 markdown 代码块包裹）
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ============================================================
// QueryRewriteSkill
// ============================================================

export class QueryRewriteSkill extends BaseSkill {
  name = 'query_rewrite';
  description = 'Adaptive strategy-based query rewriting (batch architecture)';

  private registry: StrategyRegistry;
  private maxStrategies = 3;

  constructor() {
    super();
    this.registry = StrategyRegistry.default();
  }

  async loadStrategies(): Promise<void> {
    // 策略已在构造函数中加载
  }

  loadFromDirectory(directory: string): void {
    this.registry = StrategyRegistry.fromDirectory(directory);
  }

  configure(options: { maxStrategies?: number }): void {
    if (options.maxStrategies) this.maxStrategies = options.maxStrategies;
  }

  registerStrategy(spec: RewriteStrategySpec): void {
    this.registry.register(spec);
  }

  async execute(input: SkillInput): Promise<SkillOutput> {
    const {
      query,
      strategy: specifiedStrategy,
      priorContext,
      targetLanguages
    } = input as unknown as QueryRewriteOptions;

    if (!this.llm) return this.fail('LLMProvider not initialized');

    try {
      // Step 1: 策略选择
      let selected: string[];
      let reasoning: string;

      if (specifiedStrategy && this.registry.has(specifiedStrategy)) {
        selected = [specifiedStrategy];
        reasoning = `User-specified strategy: ${specifiedStrategy}`;
      } else {
        try {
          const result = await this.selectStrategies(query);
          selected = result.strategies;
          reasoning = result.reasoning;
        } catch {
          // selectStrategies LLM 失败 → 默认 gqr
          selected = ['gqr'];
          reasoning = 'Strategy selection failed; using default';
        }
      }

      // 多语言探测：targetLanguages 非空时，注入 multilingual_expand 策略
      if (targetLanguages && targetLanguages.length > 0) {
        selected = ['multilingual_expand'];
        reasoning = 'Multilingual KB — probing document languages';
      }

      if (selected.length === 0) {
        return this.success({
          rewrites: [],
          strategies_used: [],
          selection_reasoning: 'No rewrite needed',
          queries: []
        });
      }

      // Step 1.5: 互斥组约束
      selected = this.registry.enforceExclusiveGroups(selected);

      // Step 2: 批量改写，失败时 fallback 到原始 query
      let rewrites: RewriteEntry[] = [];
      let strategiesUsed = selected;
      let selectionReasoning = reasoning;
      let compareObjects: string[] | undefined;
      let explicitDimensions: string[] | undefined;
      let implicitDimensions: string[] | undefined;

      try {
        const rewriteResult = await this.batchRewrite(
          query,
          selected,
          priorContext,
          targetLanguages
        );
        rewrites = rewriteResult.rewrites || [];
        compareObjects = rewriteResult.compare_objects;
        explicitDimensions = rewriteResult.explicit_dimensions;
        implicitDimensions = rewriteResult.implicit_dimensions;
      } catch {
        // batchRewrite LLM 调用失败 → fallback 到原始 query
        strategiesUsed = ['fallback'];
        selectionReasoning = 'Batch rewrite LLM call failed; using original query as fallback';
      }

      // 扁平化 queries（兼容旧接口）
      const queries = rewrites.flatMap((r) => r.queries);

      // 如果改写结果为空（无 queries 或无 rewrites），fallback 到原始 query
      if (queries.length === 0 && rewrites.length === 0) {
        return this.success({
          rewrites: [{ strategy: 'fallback', queries: [query] }],
          strategies_used: ['fallback'],
          selection_reasoning:
            'Batch rewrite produced no results; using original query as fallback',
          queries: [query]
        });
      }

      return this.success({
        rewrites,
        strategies_used: strategiesUsed,
        selection_reasoning: selectionReasoning,
        queries,
        ...(compareObjects ? { compare_objects: compareObjects } : {}),
        ...(explicitDimensions ? { explicit_dimensions: explicitDimensions } : {}),
        ...(implicitDimensions ? { implicit_dimensions: implicitDimensions } : {})
      });
    } catch (error) {
      // 整体异常：fallback 到原始 query，而非直接 fail
      return this.success({
        rewrites: [{ strategy: 'fallback', queries: [query] }],
        strategies_used: ['fallback'],
        selection_reasoning: `Query rewrite failed unexpectedly; using original query as fallback`,
        queries: [query]
      });
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private async selectStrategies(
    query: string
  ): Promise<{ strategies: string[]; reasoning: string }> {
    const enabled = this.registry.listEnabled();
    if (enabled.length === 0) return { strategies: ['gqr'], reasoning: 'Default fallback' };

    const prompt = STRATEGY_SELECTION_PROMPT.replace(
      '{strategy_descriptions}',
      this.registry.formatForSelection()
    )
      .replace('{max_strategies}', String(this.maxStrategies))
      .replace('{query}', query);

    const response = await this.llm!.chat(
      [
        { role: 'system', content: 'You are a query analysis expert. Respond in JSON format.' },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.3, maxTokens: 512 }
    );

    const data = parseJsonSafe(response.content);
    if (!data) return { strategies: ['gqr'], reasoning: 'JSON parse failed, using default' };

    const enabledSet = new Set(enabled);
    const strategies = ((data.strategies as string[]) || [])
      .filter((s) => enabledSet.has(s))
      .slice(0, this.maxStrategies);

    return {
      strategies: strategies.length > 0 ? strategies : ['gqr'],
      reasoning: (data.reasoning as string) || ''
    };
  }

  private async batchRewrite(
    query: string,
    strategies: string[],
    priorContext?: string,
    targetLanguages?: string[]
  ): Promise<{
    rewrites: RewriteEntry[];
    compare_objects?: string[];
    explicit_dimensions?: string[];
    implicit_dimensions?: string[];
  }> {
    const instructions = this.registry
      .getRewriteInstructions(strategies, query)
      .replace('{sourceLang}', detectLang(query))
      .replace('{targetLanguages}', (targetLanguages ?? ['en']).join(', '));
    const priorContextSection = priorContext
      ? `## Prior Context (already retrieved, generate complementary queries)\n${priorContext}\n\n`
      : '';
    const prompt = BATCH_REWRITE_PROMPT.replace('{query}', query)
      .replace('{prior_context_section}', priorContextSection)
      .replace('{strategy_instructions}', instructions);

    const response = await this.llm!.chat(
      [
        { role: 'system', content: 'You are a query rewriting expert. Respond in JSON format.' },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.7, maxTokens: 1024 }
    );

    const data = parseJsonSafe(response.content);
    if (!data) return { rewrites: [] };

    return parseRewrites(data, query, strategies, this.registry);
  }
}

// ============================================================
// 解析改写结果（对齐 Python _parse_rewrites）
// ============================================================

function parseRewrites(
  data: Record<string, unknown>,
  query: string,
  _strategies: string[],
  registry: StrategyRegistry
): {
  rewrites: RewriteEntry[];
  compare_objects?: string[];
  explicit_dimensions?: string[];
  implicit_dimensions?: string[];
} {
  const rawRewrites = (data.rewrites as Array<Record<string, unknown>>) || [];
  const result: RewriteEntry[] = [];

  // 提取 decompose 策略专用字段
  let compareObjects: string[] | undefined;
  let explicitDimensions: string[] | undefined;
  let implicitDimensions: string[] | undefined;

  for (const item of rawRewrites) {
    const strategy = (item.strategy as string) || '';
    let queries = normalizeQueries(item.queries);

    // 过滤掉与原始查询相同的
    queries = queries.filter((q) => q !== query);

    // par 策略特殊处理：提取 search_keywords（对齐 Python）
    if (strategy === 'par') {
      const parsed: string[] = [];
      for (const q of queries) {
        try {
          const obj = JSON.parse(q);
          if (typeof obj === 'object' && obj !== null) {
            const kw = (obj as Record<string, unknown>).search_keywords;
            if (typeof kw === 'string') {
              parsed.push(kw);
            } else if (Array.isArray(kw)) {
              parsed.push(...kw.filter((k): k is string => typeof k === 'string'));
            }
            continue;
          }
        } catch {
          // 非 JSON，保留原始
        }
        parsed.push(q);
      }
      queries = parsed;
    }

    // decompose 策略特殊处理：提取比较维度信息（对齐 Python）
    if (strategy === 'decompose') {
      const compareObj = item.compare_objects;
      if (Array.isArray(compareObj)) {
        compareObjects = compareObj.filter((c): c is string => typeof c === 'string');
      }
      const explicitDim = item.explicit_dimensions;
      if (Array.isArray(explicitDim)) {
        explicitDimensions = explicitDim.filter((d): d is string => typeof d === 'string');
      }
      const implicitDim = item.implicit_dimensions;
      if (Array.isArray(implicitDim)) {
        implicitDimensions = implicitDim.filter((d): d is string => typeof d === 'string');
      }
    }

    const entry: RewriteEntry = { strategy, queries };

    // 复制结构字段
    for (const field of ['parallel', 'depends_on', 'step', 'note'] as const) {
      if (field in item) (entry as unknown as Record<string, unknown>)[field] = item[field];
    }

    // 默认 parallel 取策略定义
    if (!('parallel' in entry) && queries.length > 1) {
      const spec = registry.get(strategy);
      entry.parallel = spec
        ? (spec as RewriteStrategySpec & { parallel_search?: boolean }).parallel_search !== false
        : true;
    }

    if (queries.length > 0 || strategy === 'decompose') {
      result.push(entry);
    }
  }

  return {
    rewrites: result,
    ...(compareObjects && { compare_objects: compareObjects }),
    ...(explicitDimensions && { explicit_dimensions: explicitDimensions }),
    ...(implicitDimensions && { implicit_dimensions: implicitDimensions })
  };
}

function normalizeQueries(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];

  const result: string[] = [];
  for (const q of raw) {
    if (typeof q === 'string') {
      result.push(q);
    } else if (q && typeof q === 'object') {
      const obj = q as Record<string, unknown>;
      const text = obj.query || obj.text || obj.content || '';
      if (typeof text === 'string' && text) result.push(text);
    }
  }
  return result;
}

// ============================================================
// formatRewriteSummary（对齐 Python format_rewrite_summary）
// ============================================================

/**
 * 将 QueryRewriteSkill 结果格式化为 Agent 可读的 tool observation。
 * 对 parallel=true 的多 query，输出 JSON 数组提示，让 Agent 用并发搜索。
 */
export function formatRewriteSummary(result: QueryRewriteResult): string {
  const {
    rewrites,
    strategies_used: strategies,
    selection_reasoning: reasoning,
    compare_objects,
    explicit_dimensions,
    implicit_dimensions
  } = result;

  if (!rewrites || rewrites.length === 0) {
    return 'Query rewrite complete. No rewrite needed.';
  }

  const lines: string[] = [`Query rewrite complete. Strategies used: ${strategies.join(', ')}`];
  if (reasoning) lines.push(`Selection reasoning: ${reasoning}`);

  // decompose 策略的比较维度信息
  if (compare_objects || explicit_dimensions || implicit_dimensions) {
    lines.push('Comparison dimensions:');
    if (compare_objects) lines.push(`  compare_objects: ${JSON.stringify(compare_objects)}`);
    if (explicit_dimensions)
      lines.push(`  explicit_dimensions: ${JSON.stringify(explicit_dimensions)}`);
    if (implicit_dimensions)
      lines.push(`  implicit_dimensions: ${JSON.stringify(implicit_dimensions)}`);
  }

  lines.push('Rewrite results:');

  for (const item of rewrites) {
    const { strategy, queries, parallel, step, depends_on, note } = item;

    let prefix = `  [${strategy}]`;
    if (step !== undefined) {
      prefix += ` (step ${step}`;
      if (parallel !== undefined) prefix += `, parallel=${parallel}`;
      if (depends_on !== undefined) prefix += `, depends_on=${depends_on}`;
      prefix += ')';
    }
    if (note) prefix += ` ${note}`;

    if (!queries || queries.length === 0) {
      lines.push(`${prefix} [queries to be determined from previous step]`);
    } else if (parallel && queries.length > 1) {
      // 提示 Agent 使用 JSON 数组并发搜索
      const arr = JSON.stringify(queries);
      lines.push(`${prefix} → @search({"queries": ${arr}})`);
    } else {
      for (const q of queries) {
        lines.push(`${prefix} ${q}`);
      }
    }
  }

  return lines.join('\n');
}
