import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelSchemaType } from '@fastgpt/service/core/ai/type';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { normalizeSystemModelConfig } from '@/pages/api/core/ai/model/updateWithJson';

const buildModelConfig = (
  metadata: Partial<SystemModelSchemaType['metadata']> & {
    type: SystemModelSchemaType['metadata']['type'];
  }
): SystemModelSchemaType =>
  ({
    _id: 'model-config-id',
    model: ' test-model ',
    metadata: {
      type: metadata.type,
      model: 'dirty-model',
      name: '',
      provider: 'OpenAI',
      ...metadata
    }
  }) as SystemModelSchemaType;

describe('normalizeSystemModelConfig', () => {
  it('normalizes missing defaultConfig to an explicit empty object for models with request body config', () => {
    const data = [
      buildModelConfig({ type: ModelTypeEnum.llm }),
      buildModelConfig({ type: ModelTypeEnum.embedding }),
      buildModelConfig({ type: ModelTypeEnum.rerank })
    ];

    expect(normalizeSystemModelConfig(data)).toBe(data);

    for (const item of data) {
      expect(item.metadata.defaultConfig).toEqual({});
      expect(item.metadata.model).toBe('test-model');
      expect(item.metadata.name).toBe(item.model);
    }
  });

  it('treats null, undefined and empty string defaultConfig as explicit empty object', () => {
    const data = [
      buildModelConfig({ type: ModelTypeEnum.llm, defaultConfig: null as any }),
      buildModelConfig({ type: ModelTypeEnum.embedding, defaultConfig: undefined }),
      buildModelConfig({ type: ModelTypeEnum.rerank, defaultConfig: '' as any })
    ];

    normalizeSystemModelConfig(data);

    expect(data.map((item) => item.metadata.defaultConfig)).toEqual([{}, {}, {}]);
  });

  it('keeps existing defaultConfig objects', () => {
    const data = [
      buildModelConfig({
        type: ModelTypeEnum.llm,
        name: 'Custom name',
        defaultConfig: { extra_body: { enable_thinking: false } }
      })
    ];

    normalizeSystemModelConfig(data);

    expect(data[0].metadata.defaultConfig).toEqual({
      extra_body: { enable_thinking: false }
    });
    expect(data[0].metadata.name).toBe('Custom name');
  });

  it('does not add defaultConfig to model types without request body config', () => {
    const data = [
      buildModelConfig({ type: ModelTypeEnum.tts }),
      buildModelConfig({ type: ModelTypeEnum.stt })
    ];

    normalizeSystemModelConfig(data);

    expect(data[0].metadata.defaultConfig).toBeUndefined();
    expect(data[1].metadata.defaultConfig).toBeUndefined();
  });

  it('rejects invalid model config', () => {
    expect(() => normalizeSystemModelConfig([{} as SystemModelSchemaType])).toThrow(
      'Invalid model or metadata'
    );
    expect(() =>
      normalizeSystemModelConfig([
        {
          model: 'missing-type',
          metadata: {
            model: 'missing-type',
            provider: 'OpenAI'
          }
        } as SystemModelSchemaType
      ])
    ).toThrow('missing-type metadata.type is required');
    expect(() =>
      normalizeSystemModelConfig([
        {
          model: 'missing-model',
          metadata: {
            type: ModelTypeEnum.llm,
            provider: 'OpenAI'
          }
        } as SystemModelSchemaType
      ])
    ).toThrow('missing-model metadata.model is required');
    expect(() =>
      normalizeSystemModelConfig([
        {
          model: 'missing-provider',
          metadata: {
            type: ModelTypeEnum.llm,
            model: 'missing-provider'
          }
        } as SystemModelSchemaType
      ])
    ).toThrow('missing-provider metadata.provider is required');
  });

  it('preserves empty defaultConfig after Mongo persistence', async () => {
    const data = [buildModelConfig({ type: ModelTypeEnum.llm })];

    normalizeSystemModelConfig(data);
    await MongoSystemModel.create({
      model: data[0].model,
      metadata: data[0].metadata
    });

    const saved = await MongoSystemModel.findOne({ model: data[0].model }).lean();

    expect(saved?.metadata).toHaveProperty('defaultConfig');
    expect(saved?.metadata.defaultConfig).toEqual({});
  });
});
