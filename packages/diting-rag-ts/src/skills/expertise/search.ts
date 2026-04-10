// src/skills/expertise/search.ts
// Search Skill - 多查询并发 + Rerank 融合

import type { SkillInput, SkillOutput } from '../base';
import { BaseSkill } from '../base';
import type { RetrieveSkill } from '../atomic/retrieve';
import type { RerankSkill } from '../atomic/rerank';
import type { ChunkItem } from '../../types/chunk';
import { DEFAULT_SEARCH_CONFIG } from '../../utils/constants';

/**
 * Search 选项
 */
export interface SearchOptions {
  queries: string[]; // 改写后的查询列表
  datasetIds: string[];
  tokenBudget: number;
  enableRerank?: boolean;
  topK?: number;
  originalQuery?: string; // 用户原始问题，rerank 时优先使用（比改写后的子查询更准确）
}

/**
 * Search 结果
 */
export interface SearchResult {
  chunks: ChunkItem[];
  queries: string[];
  searchMode: string;
}

/**
 * Search Skill
 * 1. 并发执行多个查询的检索
 * 2. 合并去重
 * 3. Rerank 融合（可选）
 */
export class SearchSkill extends BaseSkill {
  name = 'search';
  description = 'Multi-query search with rerank fusion';

  private retrieveSkill?: RetrieveSkill;
  private rerankSkill?: RerankSkill;

  initializeSkills(retrieve: RetrieveSkill, rerank: RerankSkill): void {
    this.retrieveSkill = retrieve;
    this.rerankSkill = rerank;
  }

  async execute(input: SkillInput): Promise<SkillOutput> {
    const {
      queries,
      datasetIds,
      tokenBudget,
      enableRerank = true,
      topK = DEFAULT_SEARCH_CONFIG.RERANK_TOP_K,
      originalQuery
    } = input as unknown as SearchOptions;

    if (!this.retrieveSkill) {
      return this.fail('RetrieveSkill not initialized');
    }

    try {
      // 并发检索所有查询（对齐 Python asyncio.gather()）
      const retrieveResults = await Promise.all(
        queries.map((query) =>
          this.retrieveSkill!.execute({
            context: input.context,
            queries: [query],
            datasetIds,
            limit: topK,
            searchMode: 'mixedRecall'
          })
        )
      );

      const allChunks: ChunkItem[] = [];
      const allQueries: string[] = [];
      let totalEmbeddingTokens = 0;

      for (const result of retrieveResults) {
        if (result.success && result.data) {
          const data = result.data as {
            chunks: ChunkItem[];
            queries: string[];
            embeddingTokens?: number;
          };
          allChunks.push(...data.chunks);
          allQueries.push(...data.queries);
          totalEmbeddingTokens += data.embeddingTokens ?? 0;
        }
      }

      // 去重
      const deduped = this.deduplicateChunks(allChunks);

      // Rerank 融合：对所有 queries 分别 rerank，每个 chunk 取最高分
      // 原因：agent 已做 alias 展开（如 "超融合 默认密码" + "HCI 默认密码"），
      //       reranker 对 "超融合" 不知道等价 "HCI"，但对 "HCI" 能正确评分。
      //       对所有 queries 求最高分，任意一个 query 命中即可保留 chunk。
      let finalChunks = deduped;
      let totalRerankInputTokens = 0;
      if (enableRerank && this.rerankSkill && deduped.length > 1) {
        // 去重合并：originalQuery + 所有搜索 queries，避免重复调用
        const rerankQueries = [...(originalQuery ? [originalQuery] : []), ...queries].filter(
          (q, i, arr) => arr.indexOf(q) === i
        );

        // 对每个 query 调用 reranker，记录每个 chunk 的最高得分
        const maxScoreMap = new Map<string, number>();
        for (const rq of rerankQueries) {
          const rerankResult = await this.rerankSkill.execute({
            context: input.context,
            query: rq,
            chunks: deduped,
            topK: deduped.length // 拿所有 chunk 的分数，后续统一截断
          });
          if (rerankResult.success && rerankResult.data) {
            const rerankData = rerankResult.data as {
              chunks: ChunkItem[];
              rerankInputTokens?: number;
            };
            totalRerankInputTokens += rerankData.rerankInputTokens ?? 0;
            for (const c of rerankData.chunks) {
              const prev = maxScoreMap.get(c.id) ?? 0;
              const cur = c.rerankScore ?? 0;
              if (cur > prev) maxScoreMap.set(c.id, cur);
            }
          }
        }

        // 将最高分写回 chunk，排序后取 topK
        finalChunks = deduped
          .map((c) => ({ ...c, rerankScore: maxScoreMap.get(c.id) ?? c.rerankScore }))
          .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
          .slice(0, topK);
      }

      // Token budget 裁剪
      const fitted = this.fitToTokenBudget(finalChunks, tokenBudget);

      return this.success({
        chunks: fitted,
        queries: allQueries,
        searchMode: 'mixedRecall',
        embeddingTokens: totalEmbeddingTokens,
        rerankInputTokens: totalRerankInputTokens
      });
    } catch (error) {
      return this.fail(`Search failed: ${error}`);
    }
  }

  private deduplicateChunks(chunks: ChunkItem[]): ChunkItem[] {
    const seen = new Set<string>();
    return chunks.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }

  private fitToTokenBudget(chunks: ChunkItem[], budget: number): ChunkItem[] {
    // 简单实现：按分数排序后逐个添加
    const sorted = [...chunks].sort(
      (a, b) => (b.rerankScore ?? b.score) - (a.rerankScore ?? a.score)
    );
    let tokens = 0;
    const result: ChunkItem[] = [];

    for (const chunk of sorted) {
      const chunkTokens = Math.ceil(chunk.content.length / 4); // 粗略估算
      if (tokens + chunkTokens > budget) break;
      result.push(chunk);
      tokens += chunkTokens;
    }

    return result;
  }
}
