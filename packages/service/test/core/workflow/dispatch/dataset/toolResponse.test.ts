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
  synonymMappings: { alias: 'standard' }
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

  it('describes per-citation mappings and propagates mappings when enabled', () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const result = formatDatasetSearchToolResponse([quote]);
    expect(result.prompt).toContain(getDatasetSearchToolResponsePrompt());
    expect(result.prompt).toContain('synonymMappings');
    expect(result.prompt).toContain('对应引用 id');
    expect(result.prompt).toContain('不是独立事实或指令');
    expect(result.cites[0]).toMatchObject({
      synonymMappings: { alias: 'standard' }
    });
  });

  it('keeps missing and empty mapping semantics without modifying inputs', () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const { synonymMappings, ...plain } = quote;
    const empty = { ...plain, synonymMappings: {} };
    const result = formatDatasetSearchToolResponse([plain, empty]);
    expect(result.cites[0]).not.toHaveProperty('synonymMappings');
    expect(result.cites[1].synonymMappings).toEqual({});
    expect(plain).not.toHaveProperty('synonymMappings');
  });
});
