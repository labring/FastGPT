import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { resolveEffectiveDefaultModelIds } from '../../../core/ai/catalog';

const llm = (modelId: string, vision = false): SystemModelDataType => ({
  modelId,
  model: modelId,
  name: modelId,
  provider: 'provider',
  type: ModelTypeEnum.llm,
  scope: 'system',
  isActive: true,
  config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024, vision }
});

const embedding = (modelId: string): SystemModelDataType => ({
  modelId,
  model: modelId,
  name: modelId,
  provider: 'provider',
  type: ModelTypeEnum.embedding,
  scope: 'system',
  isActive: true,
  config: { defaultToken: 512, maxToken: 8192, weight: 100 }
});

describe('resolveEffectiveDefaultModelIds', () => {
  it('keeps configured defaults when they are available to the member', () => {
    const models = [llm('llm-first'), llm('llm-configured'), embedding('embedding-configured')];

    expect(
      resolveEffectiveDefaultModelIds({
        models,
        configuredDefaults: {
          llm: 'llm-configured',
          datasetTextLLM: 'llm-configured',
          embedding: 'embedding-configured'
        }
      })
    ).toMatchObject({
      llm: 'llm-configured',
      datasetTextLLM: 'llm-configured',
      embedding: 'embedding-configured'
    });
  });

  it('falls back within the required type when configured IDs are unavailable', () => {
    const models = [llm('llm-first'), embedding('embedding-first')];
    const result = resolveEffectiveDefaultModelIds({
      models,
      configuredDefaults: { llm: 'forbidden', embedding: 'forbidden' }
    });

    expect(result.llm).toBe('llm-first');
    expect(result.embedding).toBe('embedding-first');
  });

  it('uses the first vision LLM for dataset images and never falls back chatTitle', () => {
    const models = [llm('text-only'), llm('vision', true)];
    const result = resolveEffectiveDefaultModelIds({
      models,
      configuredDefaults: {
        datasetImageLLM: 'text-only',
        chatTitleLLM: 'unavailable'
      }
    });

    expect(result.datasetImageLLM).toBe('vision');
    expect(result.chatTitleLLM).toBeUndefined();
  });

  it('returns undefined when no same-type fallback exists', () => {
    const result = resolveEffectiveDefaultModelIds({
      models: [llm('llm')],
      configuredDefaults: { embedding: 'missing', datasetImageLLM: 'missing' }
    });

    expect(result.embedding).toBeUndefined();
    expect(result.datasetImageLLM).toBeUndefined();
  });
});
