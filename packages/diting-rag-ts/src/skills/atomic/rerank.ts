// src/skills/atomic/rerank.ts
// Rerank Skill - BGE Reranker API 精排，API 不可用时降级关键词精排

import type { SkillInput, SkillOutput } from '../base';
import { BaseSkill } from '../base';
import type { ChunkItem } from '../../types/chunk';
import type { RerankProvider } from '../../ports/reranker';

/**
 * Rerank 选项
 */
export interface RerankOptions {
  query: string;
  chunks: ChunkItem[];
  topK?: number;
}

// ============================================================
// 关键词降级评分（API 不可用时使用，对齐 Python _keyword_rerank_score）
// ============================================================
function keywordRerankScore(query: string, content: string): number {
  const queryTerms = query
    .toLowerCase()
    .replace(/[？?]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (queryTerms.length === 0) return 0.0;
  const contentLower = content.toLowerCase();
  let totalHits = 0;
  for (const term of queryTerms) {
    // count all occurrences
    let pos = 0;
    while ((pos = contentLower.indexOf(term, pos)) !== -1) {
      totalHits++;
      pos += term.length;
    }
  }
  return Math.min(totalHits / Math.max(queryTerms.length * 3, 1), 1.0);
}

/**
 * Rerank Skill — 生产环境调用 BGE Reranker API，不可用时降级为关键词精排
 */
export class RerankSkill extends BaseSkill {
  name = 'rerank';
  description = 'Rerank chunks using reranker model, fallback to keyword rerank on failure';

  private rerankProvider?: RerankProvider;

  initializeProvider(rerankProvider: RerankProvider): void {
    this.rerankProvider = rerankProvider;
  }

  async execute(input: SkillInput): Promise<SkillOutput> {
    const { query, chunks, topK = 20 } = input as unknown as RerankOptions;

    if (!this.rerankProvider) {
      return this.fail('RerankProvider not initialized');
    }

    if (!chunks || chunks.length === 0) {
      return this.success({ chunks: [] });
    }

    // 尝试 API 精排
    try {
      // 估算 rerank 输入 token 数（query + 各文档内容，按 4 字符/token 粗估）
      const rerankInputTokens = Math.ceil(
        (query.length + chunks.reduce((sum, c) => sum + c.content.length, 0)) / 4
      );

      const results = await this.rerankProvider.rerank(query, chunks);

      // 检查是否全零分（对齐 Python: 所有批次均失败时触发降级）
      const allZero = results.every((r) => (r.rerankScore ?? 0) === 0);
      if (allZero) {
        throw new Error('Rerank API returned all-zero scores');
      }

      const sorted = results.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
      const topKResults = sorted.slice(0, topK);
      return this.success({ chunks: topKResults, rerankInputTokens });
    } catch (error) {
      this.logger?.warn(`[RerankSkill] API 调用失败，降级为关键词精排: ${error}`);
      return this.success({
        chunks: this.rerankByKeyword(query, chunks, topK),
        rerankInputTokens: 0
      });
    }
  }

  /**
   * 关键词降级精排（对齐 Python _rerank_by_keyword）
   * 综合分数: 0.4 * 原始检索分数 + 0.6 * 关键词匹配分数
   */
  private rerankByKeyword(query: string, chunks: ChunkItem[], topK: number): ChunkItem[] {
    const scored = chunks.map((chunk) => {
      const rerankS = keywordRerankScore(query, chunk.content);
      // 综合分数融合：0.4 * 原始分数 + 0.6 * 关键词分数
      // 原始 score 来自向量检索/全文检索，范围 0-1
      // 最终仍在 0-1 范围内
      const combined = 0.4 * (chunk.score ?? 0) + 0.6 * rerankS;
      return { ...chunk, score: combined };
    });
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored.slice(0, topK);
  }
}
