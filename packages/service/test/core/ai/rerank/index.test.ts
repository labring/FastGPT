import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';

// hoisted：让 mock 实例可在 beforeEach 中重设
const { mockCountPromptTokens, mockAxiosPost } = vi.hoisted(() => ({
  mockCountPromptTokens: vi.fn(),
  // mockAxiosPost 接收原始 payload(即 axios response 的 .data),包装成 { data }
  mockAxiosPost: vi.fn()
}));

vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countPromptTokens: mockCountPromptTokens
}));

// rerank 走 axiosWithoutSSRF(管理员配置的 url 允许内网),mock 它的 .post 返回 axios 风格的 { data, ... }
vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: {
    post: (...args: any[]) => Promise.resolve(mockAxiosPost(...args)).then((data) => ({ data }))
  }
}));

// Mock text2Chunks：按 chunkSize 字符切分，保证测试确定性
vi.mock('@fastgpt/service/worker/function', () => ({
  text2Chunks: vi.fn(async ({ text, chunkSize }: { text: string; chunkSize: number }) => {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return { chunks };
  })
}));

// import 放在 mock 之后
const { reRankRecall } = await import('@fastgpt/service/core/ai/rerank/index');

const mockModel: RerankModelItemType = {
  provider: 'test',
  model: 'rerank-test',
  name: 'Test Rerank',
  type: ModelTypeEnum.rerank,
  maxToken: 8000
};

describe('reRankRecall', () => {
  beforeEach(() => {
    mockAxiosPost.mockReset();
    mockCountPromptTokens.mockReset();
    mockCountPromptTokens.mockImplementation(async (text: string) => text.length);
  });

  // ── 基础场景 ──────────────────────────────────────────────────────────────

  it('正常场景：多文档返回正确 id 和 score', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: [
        { index: 1, relevance_score: 0.9 },
        { index: 0, relevance_score: 0.5 }
      ],
      meta: { tokens: { input_tokens: 20, output_tokens: 0 } }
    });

    const result = await reRankRecall({
      model: mockModel,
      query: 'query',
      documents: [
        { id: 'doc1', text: 'hello' },
        { id: 'doc2', text: 'world' }
      ]
    });

    expect(result.inputTokens).toBe(20);
    expect(result.results).toHaveLength(2);
    expect(result.results.find((r) => r.id === 'doc2')?.score).toBe(0.9);
    expect(result.results.find((r) => r.id === 'doc1')?.score).toBe(0.5);
  });

  it('单文档正常召回', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: [{ index: 0, relevance_score: 0.75 }],
      meta: { tokens: { input_tokens: 10, output_tokens: 0 } }
    });

    const result = await reRankRecall({
      model: mockModel,
      query: 'q',
      documents: [{ id: 'doc1', text: 'hello' }]
    });

    expect(result.results).toEqual([{ id: 'doc1', score: 0.75 }]);
    expect(result.inputTokens).toBe(10);
  });

  // ── 边界值 ────────────────────────────────────────────────────────────────

  it('documents 为空时直接返回空，不发请求', async () => {
    const result = await reRankRecall({
      model: mockModel,
      query: 'q',
      documents: []
    });

    expect(result).toEqual({ results: [], inputTokens: 0 });
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('所有文档 text 为空或空白时，返回空结果，不发请求', async () => {
    const result = await reRankRecall({
      model: mockModel,
      query: 'q',
      documents: [
        { id: 'doc1', text: '' },
        { id: 'doc2', text: '   ' }
      ]
    });

    expect(result).toEqual({ results: [], inputTokens: 0 });
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  // ── 复杂场景：文档切分 ────────────────────────────────────────────────────

  it('文档超过 token 预算时切分 chunks，取最高分聚合并返回原始 doc id', async () => {
    // maxToken=600, query='q'(length=1), docBudget=599
    // longText length=1100 > 599 → 被切分
    // chunkSize = floor((1100/1100)*599*0.9) = 539 → 3 chunks (indices 0,1,2)
    // doc2 'short' length=5 <= 599 → 不切分 (index 3)
    const longText = 'a'.repeat(1100);

    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      // API 按 score 降序返回
      results: [
        { index: 0, relevance_score: 0.8 }, // doc1__chunk_0 → doc1
        { index: 3, relevance_score: 0.6 }, // doc2
        { index: 1, relevance_score: 0.3 }, // doc1__chunk_1 → doc1（已存在，跳过）
        { index: 2, relevance_score: 0.1 } // doc1__chunk_2 → doc1（已存在，跳过）
      ],
      meta: { tokens: { input_tokens: 30, output_tokens: 0 } }
    });

    const result = await reRankRecall({
      model: { ...mockModel, maxToken: 600 },
      query: 'q',
      documents: [
        { id: 'doc1', text: longText },
        { id: 'doc2', text: 'short' }
      ]
    });

    // 返回的 id 应为原始 doc id，不含 __chunk_ 后缀
    expect(result.results.every((r) => !r.id.includes('__chunk_'))).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.find((r) => r.id === 'doc1')?.score).toBe(0.8);
    expect(result.results.find((r) => r.id === 'doc2')?.score).toBe(0.6);
  });

  it('同一文档多个 chunk，非最高分 chunk 排在前面时，仍取第一个（最高分）', async () => {
    // doc1 3个 chunks (indices 0,1,2)；API 返回 chunk_1 分最高
    // maxToken=600, query='q'(1), docBudget=599, chunkSize=539
    const longText = 'b'.repeat(1100);

    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: [
        { index: 1, relevance_score: 0.95 }, // chunk_1 最高
        { index: 0, relevance_score: 0.4 }, // chunk_0 跳过
        { index: 2, relevance_score: 0.2 } // chunk_2 跳过
      ],
      meta: { tokens: { input_tokens: 20, output_tokens: 0 } }
    });

    const result = await reRankRecall({
      model: { ...mockModel, maxToken: 600 },
      query: 'q',
      documents: [{ id: 'doc1', text: longText }]
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({ id: 'doc1', score: 0.95 });
  });

  // ── inputTokens 计算 ──────────────────────────────────────────────────────

  it('API 未返回 meta tokens 时，通过 countPromptTokens 估算', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: [{ index: 0, relevance_score: 0.5 }]
      // 无 meta
    });

    const result = await reRankRecall({
      model: mockModel,
      query: 'test', // length=4
      documents: [{ id: 'doc1', text: 'hello' }] // text length=5
    });

    // documentsTextArray.join('\n') = 'hello'（单元素无分隔符）+ 'test' = 'hellotest'(9)
    expect(result.inputTokens).toBe(9);
  });

  it('API 返回 meta tokens 时直接使用', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: [{ index: 0, relevance_score: 0.5 }],
      meta: { tokens: { input_tokens: 42, output_tokens: 0 } }
    });

    const result = await reRankRecall({
      model: mockModel,
      query: 'q',
      documents: [{ id: 'doc1', text: 'hello' }]
    });

    expect(result.inputTokens).toBe(42);
  });

  // ── requestUrl / requestAuth ──────────────────────────────────────────────

  it('有 requestUrl 和 requestAuth 时，使用自定义地址和认证头', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: [{ index: 0, relevance_score: 0.5 }],
      meta: { tokens: { input_tokens: 5, output_tokens: 0 } }
    });

    await reRankRecall({
      model: {
        ...mockModel,
        requestUrl: 'https://custom.rerank.io/rerank',
        requestAuth: 'secret-key'
      },
      query: 'q',
      documents: [{ id: 'doc1', text: 'hello' }]
    });

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://custom.rerank.io/rerank',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-key'
        })
      })
    );
  });

  it('未设置 requestUrl 时，使用 baseUrl/rerank', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: [{ index: 0, relevance_score: 0.5 }],
      meta: { tokens: { input_tokens: 5, output_tokens: 0 } }
    });

    await reRankRecall({
      model: mockModel,
      query: 'q',
      documents: [{ id: 'doc1', text: 'hello' }]
    });

    const url: string = mockAxiosPost.mock.calls[0][0];
    expect(url.endsWith('/rerank')).toBe(true);
  });

  // ── 异常场景 ──────────────────────────────────────────────────────────────

  it('model 为 undefined 时 reject', async () => {
    await expect(
      reRankRecall({
        model: undefined,
        query: 'q',
        documents: [{ id: 'doc1', text: 'hello' }]
      })
    ).rejects.toThrow('No rerank model');
  });

  it('query 超过 maxToken 时 reject', async () => {
    // maxToken=5, query length=26 → docBudget = 5-26 = -21 ≤ 500 → reject
    await expect(
      reRankRecall({
        model: { ...mockModel, maxToken: 5 },
        query: 'this query is way too long',
        documents: [{ id: 'doc1', text: 'hello' }]
      })
    ).rejects.toThrow('Rerank query too long');
  });

  it('docBudget === 500 时 reject（边界值）', async () => {
    // mockCountPromptTokens 按 text.length 计算
    // maxToken=501, query='q'(length=1) → docBudget = 501-1 = 500 ≤ 500 → reject
    await expect(
      reRankRecall({
        model: { ...mockModel, maxToken: 501 },
        query: 'q',
        documents: [{ id: 'doc1', text: 'hello' }]
      })
    ).rejects.toThrow('Rerank query too long');
  });

  it('docBudget === 501 时不因 query 过长 reject', async () => {
    // maxToken=502, query='q'(length=1) → docBudget = 502-1 = 501 > 500 → 正常发请求
    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: [{ index: 0, relevance_score: 0.5 }],
      meta: { tokens: { input_tokens: 5, output_tokens: 0 } }
    });

    const result = await reRankRecall({
      model: { ...mockModel, maxToken: 502 },
      query: 'q',
      documents: [{ id: 'doc1', text: 'hello' }]
    });

    expect(result.results).toHaveLength(1);
    expect(mockAxiosPost).toHaveBeenCalledOnce();
  });

  it('API 请求失败时，reject 并传递原始错误', async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      reRankRecall({
        model: mockModel,
        query: 'q',
        documents: [{ id: 'doc1', text: 'hello' }]
      })
    ).rejects.toThrow('Network error');
  });

  it('API 返回空 results 时，返回空 results', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      id: 'r1',
      results: []
    });

    const result = await reRankRecall({
      model: mockModel,
      query: 'q',
      documents: [{ id: 'doc1', text: 'hello' }]
    });

    expect(result.results).toHaveLength(0);
    expect(mockAxiosPost).toHaveBeenCalledOnce();
    // 空 results 时提前返回，inputTokens 固定为 0
    expect(result.inputTokens).toBe(0);
  });
});
