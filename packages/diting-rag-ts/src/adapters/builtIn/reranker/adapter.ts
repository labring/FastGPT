// src/adapters/built-in/reranker/adapter.ts
// Built-in Rerank 适配器 - 调用兼容 OpenAI API 的远程 Rerank 服务

import type { RerankProvider } from '../../../ports/reranker';
import type { ChunkResult } from '../../../types/chunk';
import type { Logger } from '../../../ports/logger';

/**
 * Built-in Rerank 配置
 */
export interface BuiltInRerankConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  topN?: number;
  timeout?: number;
  batchSize?: number; // 分批请求大小，默认 50（对齐 Python）
  maxDocLength?: number; // 文档截断长度（字符），默认 8192（对齐 Python）
  logger?: Logger;
}

/**
 * Built-in Rerank 适配器
 * 通过环境变量配置，调用兼容 OpenAI API 的远程服务（如 Ollama、vLLM 等）
 * 支持分批请求 + 文档截断 + 降级到关键词精排
 */
export class BuiltInRerankAdapter implements RerankProvider {
  public readonly type = 'builtin' as const;

  private apiKey: string;
  private endpoint: string;
  private model: string;
  private topN: number;
  private timeout: number;
  private batchSize: number;
  private maxDocLength: number;
  private logger?: Logger;

  constructor(config: BuiltInRerankConfig = {}) {
    this.apiKey = config.apiKey || process.env.RERANK_API_KEY || '';
    this.endpoint =
      config.endpoint || process.env.RERANK_ENDPOINT || 'http://fastgpt-aiproxy:3000/v1';
    this.model = config.model || process.env.RERANK_MODEL || 'bge-reranker-large';
    this.topN = config.topN || 10;
    this.timeout = config.timeout || 60000;
    this.batchSize = config.batchSize || 50;
    this.maxDocLength = config.maxDocLength || 8192;
    this.logger = config.logger;
  }

  /**
   * 构建请求头
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`
    };
  }

  /**
   * Rerank 排序
   * 优先尝试远程 API（分批），失败时降级到关键词精排
   */
  async rerank(
    query: string,
    chunks: ChunkResult[]
  ): Promise<Array<ChunkResult & { rerankScore: number }>> {
    if (chunks.length === 0) {
      return [];
    }

    try {
      return await this.rerankRemote(query, chunks);
    } catch {
      return this.rerankLocal(query, chunks);
    }
  }

  /**
   * 远程 Rerank（分批 + 文档截断，对齐 Python 实现）
   */
  private async rerankRemote(
    query: string,
    chunks: ChunkResult[]
  ): Promise<Array<ChunkResult & { rerankScore: number }>> {
    // 文档截断
    const docTexts = chunks.map((c) =>
      c.content.length > this.maxDocLength ? c.content.slice(0, this.maxDocLength) : c.content
    );

    // 构建 rerank endpoint（确保以 /rerank 结尾）
    const apiUrl = this.endpoint.replace(/\/$/, '').replace(/\/rerank$/, '') + '/rerank';

    const allScores: number[] = new Array(chunks.length).fill(0);

    // 分批请求
    for (let batchStart = 0; batchStart < docTexts.length; batchStart += this.batchSize) {
      const batchDocs = docTexts.slice(batchStart, batchStart + this.batchSize);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            model: this.model,
            query,
            documents: batchDocs
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Rerank API error: ${response.status}`);
        }

        const data = (await response.json()) as {
          results?: Array<{ index: number; relevance_score: number }>;
        };

        for (const item of data.results ?? []) {
          const globalIdx = batchStart + item.index;
          if (globalIdx < allScores.length) {
            allScores[globalIdx] = item.relevance_score;
          }
        }
      } catch (e) {
        // 该批次失败，保持 0 分，继续处理其他批次
        this.logger?.warn(
          `[Reranker] batch ${Math.floor(batchStart / this.batchSize) + 1} failed:`,
          { message: e instanceof Error ? e.message : String(e) }
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 全零分说明所有批次均失败，触发降级
    if (allScores.every((s) => s === 0)) {
      throw new Error('All rerank batches returned zero scores');
    }

    return chunks
      .map((chunk, i) => ({ ...chunk, rerankScore: allScores[i] }))
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, this.topN);
  }

  /**
   * 本地关键词精排（降级方案）
   * 返回的 rerankScore 也是 0-1 范围
   */
  private rerankLocal(
    query: string,
    chunks: ChunkResult[]
  ): Array<ChunkResult & { rerankScore: number }> {
    const queryTerms = query
      .toLowerCase()
      .replace(/[？?]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 1);

    const scored = chunks.map((chunk) => {
      const content = chunk.content.toLowerCase();
      let keywordHits = 0;
      for (const term of queryTerms) {
        // 统计出现次数（对齐 Python count()）
        let pos = 0;
        while ((pos = content.indexOf(term, pos)) !== -1) {
          keywordHits++;
          pos++;
        }
      }
      const keywordScore =
        queryTerms.length > 0 ? Math.min(keywordHits / Math.max(queryTerms.length * 3, 1), 1.0) : 0;

      // 融合公式: 0.4 * 原始向量分数 + 0.6 * 关键词分数
      // 原始 score 来自向量检索或全文检索，范围 0-1
      // 综合后仍保持 0-1 范围
      const rerankScore = 0.4 * (chunk.score ?? 0) + 0.6 * keywordScore;
      return { ...chunk, rerankScore };
    });

    scored.sort((a, b) => b.rerankScore - a.rerankScore);
    return scored.slice(0, this.topN);
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return { name: this.model };
  }
}
