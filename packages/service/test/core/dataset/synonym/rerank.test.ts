import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: true,
  reRankRecall: vi.fn(),
  runtimeConfig: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/synonym/entity', () => ({
  isDatasetSynonymEnabled: () => mocks.enabled,
  getDatasetSynonymRuntimeConfig: mocks.runtimeConfig
}));
vi.mock('@fastgpt/service/core/ai/rerank', () => ({
  reRankRecall: mocks.reRankRecall
}));

import { rerankDatasetWithSynonyms } from '@fastgpt/service/core/dataset/synonym/rerank';

const matcher = {
  hasMappings: true,
  transform: (text: string) => ({
    transformedText: text.replaceAll('alias', 'standard'),
    usedMappings: []
  })
};
const documents = [{ id: 'a', datasetId: 'd1', text: 'plain text' }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.runtimeConfig.mockResolvedValue({
    config: { enabled: true, version: 2 },
    active: { version: 2, matcher }
  });
  mocks.reRankRecall.mockResolvedValue({ results: [{ id: 'a', score: 0.2 }], inputTokens: 10 });
});

describe('rerankDatasetWithSynonyms', () => {
  it('prepares synonym text without waiting for the baseline rerank to finish', async () => {
    let resolveBaseline!: (value: {
      results: { id: string; score: number }[];
      inputTokens: number;
    }) => void;
    mocks.reRankRecall
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveBaseline = resolve;
        })
      )
      .mockResolvedValueOnce({ results: [{ id: 'a', score: 0.9 }], inputTokens: 8 });

    const resultPromise = rerankDatasetWithSynonyms({ teamId: 't1', query: 'alias', documents });
    // 基线 rerank 尚未返回时，同义词准备阶段已经启动。
    await vi.waitFor(() => expect(mocks.runtimeConfig).toHaveBeenCalled());
    resolveBaseline({ results: [{ id: 'a', score: 0.2 }], inputTokens: 10 });
    const result = await resultPromise;

    expect(result.inputTokens).toBe(18);
    expect(result.results).toEqual([{ id: 'a', score: 0.9 }]);
    expect(mocks.reRankRecall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        query: 'standard',
        documents: [{ id: 'a', text: 'plain text' }]
      })
    );
  });

  it('keeps the baseline score as a floor for unchanged documents', async () => {
    mocks.reRankRecall.mockResolvedValueOnce({
      results: [{ id: 'a', score: 0.9 }],
      inputTokens: 10
    });
    mocks.reRankRecall.mockResolvedValueOnce({
      results: [{ id: 'a', score: 0.1 }],
      inputTokens: 8
    });

    const result = await rerankDatasetWithSynonyms({ teamId: 't1', query: 'alias', documents });

    expect(result.results).toEqual([{ id: 'a', score: 0.9 }]);
    expect(result.inputTokens).toBe(18);
  });

  it('propagates baseline failures', async () => {
    mocks.reRankRecall.mockRejectedValueOnce(new Error('rerank down'));
    await expect(
      rerankDatasetWithSynonyms({ teamId: 't1', query: 'alias', documents })
    ).rejects.toThrow('rerank down');
  });

  it('skips the second pass when nothing changes or synonyms are disabled', async () => {
    mocks.runtimeConfig.mockResolvedValue({
      config: { enabled: true, version: 2 },
      active: {
        version: 2,
        matcher: {
          hasMappings: true,
          transform: (text: string) => ({ transformedText: text, usedMappings: [] })
        }
      }
    });
    await rerankDatasetWithSynonyms({ teamId: 't1', query: 'alias', documents });
    expect(mocks.reRankRecall).toHaveBeenCalledTimes(1);

    mocks.enabled = false;
    await rerankDatasetWithSynonyms({ teamId: 't1', query: 'alias', documents });
    expect(mocks.reRankRecall).toHaveBeenCalledTimes(2);
  });
});
