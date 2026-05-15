import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelSchemaType } from '@fastgpt/service/core/ai/type';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
  };
});

import updateWithJsonApi from '@/pages/api/core/ai/model/updateWithJson';

const buildModelConfig = (
  metadata: Partial<SystemModelSchemaType['metadata']> & {
    type: SystemModelSchemaType['metadata']['type'];
  },
  model = ' test-model '
): SystemModelSchemaType =>
  ({
    _id: 'model-config-id',
    model,
    metadata: {
      type: metadata.type,
      model: 'dirty-model',
      name: '',
      provider: 'OpenAI',
      ...metadata
    }
  }) as SystemModelSchemaType;

const callUpdateWithJson = async (data: SystemModelSchemaType[]) => {
  const root = await getRootUser();

  return Call(updateWithJsonApi, {
    auth: root,
    body: {
      config: JSON.stringify(data)
    }
  });
};

const findSavedModel = (model: string) => MongoSystemModel.findOne({ model }).lean();

describe('updateWithJson api', () => {
  it('imports configs, clears old records and normalizes model metadata', async () => {
    await MongoSystemModel.create({
      model: 'old-model',
      metadata: buildModelConfig({ type: ModelTypeEnum.llm }, 'old-model').metadata
    });

    const res = await callUpdateWithJson([buildModelConfig({ type: ModelTypeEnum.llm })]);

    expect(res.code).toBe(200);
    expect(res.data).toEqual({});
    await expect(findSavedModel('old-model')).resolves.toBeNull();

    const saved = await findSavedModel(' test-model ');

    expect(saved?.metadata.model).toBe('test-model');
    expect(saved?.metadata.name).toBe(' test-model ');
    expect(saved?.metadata.provider).toBe('OpenAI');
  });

  it('does not add missing defaultConfig and only sanitizes existing non-object values', async () => {
    const objectDefaultConfig = { extra_body: { enable_thinking: false } };
    const data = [
      buildModelConfig({ type: ModelTypeEnum.llm }, 'missing-default-config'),
      buildModelConfig(
        { type: ModelTypeEnum.embedding, defaultConfig: '' as any },
        'empty-string-default-config'
      ),
      buildModelConfig(
        { type: ModelTypeEnum.rerank, defaultConfig: 1 as any },
        'number-default-config'
      ),
      buildModelConfig(
        { type: ModelTypeEnum.llm, defaultConfig: null as any },
        'null-default-config'
      ),
      buildModelConfig(
        { type: ModelTypeEnum.llm, defaultConfig: objectDefaultConfig },
        'object-default-config'
      )
    ];

    const res = await callUpdateWithJson(data);

    expect(res.code).toBe(200);

    await expect(findSavedModel('missing-default-config')).resolves.toMatchObject({
      metadata: expect.not.objectContaining({ defaultConfig: expect.anything() })
    });
    await expect(findSavedModel('empty-string-default-config')).resolves.toMatchObject({
      metadata: { defaultConfig: {} }
    });
    await expect(findSavedModel('number-default-config')).resolves.toMatchObject({
      metadata: { defaultConfig: {} }
    });
    await expect(findSavedModel('null-default-config')).resolves.toMatchObject({
      metadata: { defaultConfig: null }
    });
    await expect(findSavedModel('object-default-config')).resolves.toMatchObject({
      metadata: { defaultConfig: objectDefaultConfig }
    });
  });

  it.each([
    ['empty item', [{} as SystemModelSchemaType], 'Invalid model or metadata'],
    [
      'missing type',
      [
        {
          model: 'missing-type',
          metadata: {
            model: 'missing-type',
            provider: 'OpenAI'
          }
        } as SystemModelSchemaType
      ],
      'missing-type metadata.type is required'
    ],
    [
      'missing metadata model',
      [
        {
          model: 'missing-model',
          metadata: {
            type: ModelTypeEnum.llm,
            provider: 'OpenAI'
          }
        } as SystemModelSchemaType
      ],
      'missing-model metadata.model is required'
    ],
    [
      'missing provider',
      [
        {
          model: 'missing-provider',
          metadata: {
            type: ModelTypeEnum.llm,
            model: 'missing-provider'
          }
        } as SystemModelSchemaType
      ],
      'missing-provider metadata.provider is required'
    ]
  ])('rejects invalid model config: %s', async (_name, data, error) => {
    const res = await callUpdateWithJson(data);

    expect(res.code).toBe(500);
    expect(res.error).toBe(error);
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });
});
