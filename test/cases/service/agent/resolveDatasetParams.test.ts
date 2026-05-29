import { describe, it, expect } from 'vitest';
import { resolveDatasetParams } from '@fastgpt/service/core/workflow/dispatch/ai/agent/resolveDatasetParams';

describe('resolveDatasetParams', () => {
  it('should return undefined when no dataset params exist', () => {
    expect(resolveDatasetParams({})).toBeUndefined();
    expect(resolveDatasetParams({ datasets: [] })).toBeUndefined();
  });

  it('should return composite datasetParams when agent_datasetParams is provided', () => {
    const composite = {
      datasets: [{ datasetId: '123', name: 'test' }],
      similarity: 0.5,
      limit: 3000,
      searchMode: 'embedding'
    };
    const result = resolveDatasetParams({ agent_datasetParams: composite });
    expect(result).toEqual(composite);
  });

  it('should construct datasetParams from individual fields', () => {
    const datasets = [{ datasetId: '456', name: 'test-ds' }];
    const result = resolveDatasetParams({
      datasets,
      similarity: 0.7,
      limit: 2000,
      searchMode: 'fullText',
      embeddingWeight: 0.3,
      usingReRank: true,
      rerankModelId: 'rerank-v1',
      rerankWeight: 0.6,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: 'gpt-4',
      datasetSearchExtensionBg: 'background text',
      collectionFilterMatch: 'filter'
    });
    expect(result).toBeDefined();
    expect(result!.datasets).toEqual(datasets);
    expect(result!.similarity).toBe(0.7);
    expect(result!.limit).toBe(2000);
    expect(result!.searchMode).toBe('fullText');
    expect(result!.embeddingWeight).toBe(0.3);
    expect(result!.usingReRank).toBe(true);
    expect(result!.rerankModelId).toBe('rerank-v1');
    expect(result!.rerankWeight).toBe(0.6);
    expect(result!.datasetSearchUsingExtensionQuery).toBe(true);
    expect(result!.datasetSearchExtensionModelId).toBe('gpt-4');
    expect(result!.datasetSearchExtensionBg).toBe('background text');
    expect(result!.collectionFilterMatch).toBe('filter');
  });

  it('should prefer composite over individual fields when both exist', () => {
    const composite = {
      datasets: [{ datasetId: 'composite', name: 'composite-ds' }],
      similarity: 0.9
    };
    const result = resolveDatasetParams({
      agent_datasetParams: composite,
      datasets: [{ datasetId: 'individual', name: 'individual-ds' }],
      similarity: 0.3
    });
    expect(result).toEqual(composite);
  });

  it('should fall back to individual fields when composite has no datasets', () => {
    const datasets = [{ datasetId: 'fallback', name: 'fallback-ds' }];
    const result = resolveDatasetParams({
      agent_datasetParams: { datasets: [] },
      datasets,
      similarity: 0.4
    });
    expect(result).toBeDefined();
    expect(result!.datasets).toEqual(datasets);
  });
});
