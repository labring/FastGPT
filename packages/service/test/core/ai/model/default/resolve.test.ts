import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { resolveEffectiveDefaultModelIds } from '../../../../../core/ai/model/default/resolve';

const llm = (modelId: string, vision = false): AIModelDataType => ({
  modelId,
  model: modelId,
  name: modelId,
  provider: 'provider',
  type: ModelTypeEnum.llm,
  scope: 'system',
  isActive: true,
  config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024, vision }
});

const embedding = (modelId: string): AIModelDataType => ({
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
    const models = [
      llm('llm-first'),
      llm('llm-configured'),
      llm('vision-configured', true),
      embedding('embedding-configured')
    ];

    expect(
      resolveEffectiveDefaultModelIds({
        models,
        configuredDefaults: {
          llm: 'llm-configured',
          datasetTextLLM: 'llm-configured',
          datasetImageLLM: 'vision-configured',
          embedding: 'embedding-configured'
        }
      })
    ).toMatchObject({
      llm: 'llm-configured',
      datasetTextLLM: 'llm-configured',
      datasetImageLLM: 'vision-configured',
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

  it('never falls back optional defaults when configured models are unavailable', () => {
    const models = [llm('text-only'), llm('vision', true)];
    const result = resolveEffectiveDefaultModelIds({
      models,
      configuredDefaults: {
        datasetImageLLM: 'text-only',
        chatTitleLLM: 'unavailable'
      }
    });

    expect(result.datasetImageLLM).toBeUndefined();
    expect(result.chatTitleLLM).toBeUndefined();
  });

  it('falls back dataset text to the effective LLM rather than the first candidate', () => {
    for (const datasetTextLLM of [undefined, 'missing', 'embedding']) {
      expect(
        resolveEffectiveDefaultModelIds({
          models: [llm('first'), llm('configured'), embedding('embedding')],
          configuredDefaults: { llm: 'configured', datasetTextLLM }
        }).datasetTextLLM
      ).toBe('configured');
    }
  });

  it('excludes inactive models from configured and fallback defaults', () => {
    expect(
      resolveEffectiveDefaultModelIds({
        models: [{ ...llm('inactive', true), isActive: false }, llm('active')],
        configuredDefaults: {
          llm: 'inactive',
          datasetTextLLM: 'inactive',
          datasetImageLLM: 'inactive',
          chatTitleLLM: 'inactive'
        }
      })
    ).toMatchObject({
      llm: 'active',
      datasetTextLLM: 'active',
      datasetImageLLM: undefined,
      chatTitleLLM: undefined
    });
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
