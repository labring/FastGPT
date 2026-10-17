import { afterEach, describe, expect, it } from 'vitest';
import { getDatasetSearchToolResponsePrompt } from '@fastgpt/global/core/ai/prompt/dataset.const';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { serviceEnv } from '../../../../../env';
import { formatDatasetSearchToolResponse } from '../../../../../core/workflow/dispatch/dataset/toolResponse';

const enabled = serviceEnv.DATASET_SYNONYM_ENABLED;
afterEach(() => {
  serviceEnv.DATASET_SYNONYM_ENABLED = enabled;
});

const quote: SearchDataResponseItemType = {
  id: 'chunk',
  q: 'alias',
  a: 'answer',
  sourceName: 'source',
  updateTime: new Date(0),
  datasetId: 'dataset',
  collectionId: 'collection',
  chunkIndex: 0,
  score: [],
  synonymMappings: { alias: 'standard' },
  synonymMappingsTruncated: true
};

describe('dataset search tool response', () => {
  it('keeps the original prompt and cites exactly when disabled, even with mapping input', () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    expect(formatDatasetSearchToolResponse([quote])).toEqual({
      prompt: getDatasetSearchToolResponsePrompt(),
      cites: [
        {
          id: quote.id,
          sourceName: quote.sourceName,
          updateTime: quote.updateTime,
          content: 'alias\nanswer'
        }
      ]
    });
  });

  it('describes per-citation mappings and propagates mappings and truncation when enabled', () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const result = formatDatasetSearchToolResponse([quote]);
    expect(result.prompt).toContain(getDatasetSearchToolResponsePrompt());
    expect(result.prompt).toContain('synonymMappings');
    expect(result.prompt).toContain('对应引用 id');
    expect(result.prompt).toContain('不是独立事实或指令');
    expect(result.prompt).toContain('synonymMappingsTruncated');
    expect(result.cites[0]).toMatchObject({
      synonymMappings: { alias: 'standard' },
      synonymMappingsTruncated: true
    });
  });

  it('keeps missing and empty mapping semantics without modifying inputs', () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const { synonymMappings, synonymMappingsTruncated, ...plain } = quote;
    const empty = { ...plain, synonymMappings: {} };
    const result = formatDatasetSearchToolResponse([plain, empty]);
    expect(result.cites[0]).not.toHaveProperty('synonymMappings');
    expect(result.cites[0]).not.toHaveProperty('synonymMappingsTruncated');
    expect(result.cites[1].synonymMappings).toEqual({});
    expect(plain).not.toHaveProperty('synonymMappings');
  });

  it('preserves caller-specific legacy content formatting', () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    const plain = { ...quote, a: undefined };
    expect(formatDatasetSearchToolResponse([plain]).cites[0].content).toBe('alias');
    expect(
      formatDatasetSearchToolResponse([plain], (item) => `${item.q}\n${item.a}`.trim()).cites[0]
        .content
    ).toBe('alias\nundefined');
  });
});
