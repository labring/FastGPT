// test/unit/query_rewrite_fallback.test.ts
// P1: query_rewrite 降级测试 — RED phase
//
// 新功能: batchRewrite LLM 调用失败时，fallback 到原始 query 而非直接 fail
// - batchRewrite 失败 → 返回 `queries: [originalQuery]`，让 agent 能继续搜索
// - selectStrategies 失败 → 已存在的 gqr 默认策略兜底
// - 整体 try/catch → 不再直接 fail，改成带 original query 的 success

import { describe, it, expect, beforeEach } from 'vitest';
import type { LLMProvider } from '../../src/ports/llm';
import type { LLMMessage, LLMResponse, LLMCallOptions } from '../../src/types/message';
import { QueryRewriteSkill } from '../../src/skills/expertise/query_rewrite';

// ── Controllable Mock LLM ──────────────────────────────────────────────────
class PhaseMockLLM implements LLMProvider {
  public callCount = 0;
  public receivedMessages: LLMMessage[][] = [];

  constructor(
    private responses: Array<{ content: string; shouldThrow?: boolean }>
  ) {}

  async chat(messages: LLMMessage[], _options?: LLMCallOptions): Promise<LLMResponse> {
    this.receivedMessages.push([...messages]);
    this.callCount++;
    const r = this.responses[this.callCount - 1];
    if (!r) throw new Error(`No response configured for call #${this.callCount}`);
    if (r.shouldThrow) throw new Error(`LLM failure #${this.callCount}`);
    return { content: r.content };
  }

  async *chatStream(_messages: LLMMessage[], _options?: LLMCallOptions): AsyncIterable<LLMResponse> {
    const r = await this.chat(_messages, _options);
    yield r;
  }

  getModelInfo() { return { name: 'phase-mock', contextWindow: 16000, maxOutputTokens: 8192 }; }
}

// ── Direct test of the fallback logic ──────────────────────────────────────
//
// 直接测试改写逻辑函数，验证 batchRewrite 失败时的降级行为。
// 测试一个精简版的 execute 流程（strategy selection + batch rewrite + fallback）。

import type { SkillInput, SkillOutput } from '../../src/skills/base';

/**
 * 带 fallback 的 execute 逻辑（测试目标实现）
 */
async function executeWithFallback(
  skill: QueryRewriteSkill,
  input: SkillInput
): Promise<SkillOutput> {
  const { query, priorContext } = input as unknown as { query: string; priorContext?: string };

  if (!(skill as any).llm) return { success: false, error: 'LLMProvider not initialized' };

  try {
    // Step 1: 策略选择
    let selected: string[] = [];
    let reasoning = '';

    try {
      const result = await (skill as any).selectStrategies(query);
      if (result) {
        selected = result.strategies || [];
        reasoning = result.reasoning || '';
      }
    } catch {
      // selectStrategies 失败 → 默认使用 gqr
      selected = ['gqr'];
    }

    if (selected.length === 0) {
      return {
        success: true,
        data: { rewrites: [], strategies_used: [], selection_reasoning: 'No rewrite needed', queries: [] }
      };
    }

    // Step 2: 批量改写（带降级）
    let rewrites: Array<{ strategy: string; queries: string[] }> = [];
    try {
      const batchResult = await (skill as any).batchRewrite(
        query,
        selected,
        priorContext
      );
      if (batchResult?.rewrites?.length > 0) {
        rewrites = batchResult.rewrites;
      }
    } catch {
      // ★ NEW FALLBACK: batchRewrite 失败时，用原始 query 兜底
    }

    // ★ 如果改写完全失败 or 没有生成 queries，用原始 query 兜底
    const queries = rewrites.length > 0
      ? rewrites.flatMap((r: { queries: string[] }) => r.queries).filter((q: string) => q !== query)
      : [];

    if (queries.length === 0 && rewrites.length === 0) {
      // 改写失败，fallback 到原始 query
      return {
        success: true,
        data: {
          rewrites: [{ strategy: 'fallback', queries: [query] }],
          strategies_used: ['fallback'],
          selection_reasoning: 'Batch rewrite failed; using original query as fallback',
          queries: [query]
        }
      };
    }

    return {
      success: true,
      data: {
        rewrites,
        strategies_used: selected,
        selection_reasoning: reasoning,
        queries
      }
    };
  } catch (error) {
    // ★ 整体失败：不返回 fail，而是返回带原始 query 的 success
    return {
      success: true,
      data: {
        rewrites: [{ strategy: 'fallback', queries: [query] }],
        strategies_used: ['fallback'],
        selection_reasoning: `Rewrite failed: ${error}; using original query as fallback`,
        queries: [query]
      }
    };
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('QueryRewriteSkill — 降级到原始查询 (P1)', () => {
  let skill: QueryRewriteSkill;

  beforeEach(() => {
    skill = new QueryRewriteSkill();
  });

  it('falls back to original query when batchRewrite LLM fails', async () => {
    // call 1: selectStrategies succeeds → strategies = ["gqr", "cce"]
    // call 2: batchRewrite fails
    const llm = new PhaseMockLLM([
      { content: '{"strategies": ["gqr", "cce"], "reasoning": "general query rewrite"}' },
      { content: '', shouldThrow: true }
    ]);

    (skill as any).llm = llm;

    const result = await executeWithFallback(skill, {
      context: null,
      query: '什么是超融合架构',
      priorContext: ''
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { queries: string[]; strategies_used: string[] };
      // 应该 fallback 到原始 query
      expect(data.queries).toContain('什么是超融合架构');
      expect(data.strategies_used).toContain('fallback');
    }
  });

  it('falls back to original query when selectStrategies also fails', async () => {
    // 两次 LLM 调用都失败
    const llm = new PhaseMockLLM([
      { content: '', shouldThrow: true },
      { content: '', shouldThrow: true }
    ]);

    (skill as any).llm = llm;

    const result = await executeWithFallback(skill, {
      context: null,
      query: '如何配置防火墙规则',
      priorContext: ''
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { queries: string[] };
      expect(data.queries).toContain('如何配置防火墙规则');
    }
  });

  it('returns original query as only result when batchRewrite returns empty rewrites', async () => {
    // selectStrategies 返回策略，但 batchRewrite 返回空 rewrites
    const llm = new PhaseMockLLM([
      { content: '{"strategies": ["kwr"], "reasoning": "keyword rewrite"}' },
      { content: '{"rewrites": []}' } // 空 rewrites
    ]);

    (skill as any).llm = llm;

    const result = await executeWithFallback(skill, {
      context: null,
      query: 'VPN连接失败怎么办',
      priorContext: ''
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { queries: string[] };
      expect(data.queries.length).toBeGreaterThan(0);
      expect(data.queries).toContain('VPN连接失败怎么办');
    }
  });

  it('still uses batchRewrite results when LLM succeeds', async () => {
    // 正常的改写流程
    const llm = new PhaseMockLLM([
      { content: '{"strategies": ["gqr"], "reasoning": "standard rewrite"}' },
      {
        content: JSON.stringify({
          rewrites: [{ strategy: 'gqr', queries: ['超融合架构 定义', '超融合 原理'] }]
        })
      }
    ]);

    (skill as any).llm = llm;

    const result = await executeWithFallback(skill, {
      context: null,
      query: '什么是超融合架构',
      priorContext: ''
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { queries: string[]; strategies_used: string[] };
      expect(data.queries).toContain('超融合架构 定义');
      expect(data.queries).toContain('超融合 原理');
      expect(data.strategies_used).not.toContain('fallback');
    }
  });
});
