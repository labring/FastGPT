import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/model/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/model/utils')>();

  return {
    ...actual,
    updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
  };
});

import updateWithJsonApi from '@/pages/api/core/ai/model/updateWithJson';

type ConfigItem = Record<string, unknown>;

const buildModelConfig = (
  overrides: Record<string, unknown> = {},
  model = 'test-model'
): ConfigItem => ({
  model,
  type: ModelTypeEnum.llm,
  name: model,
  provider: 'OpenAI',
  isActive: true,
  ...overrides
});

const callUpdateWithJson = async (data: ConfigItem[]) => {
  const root = await getRootUser();

  return Call(updateWithJsonApi, {
    auth: root,
    body: { config: JSON.stringify(data) }
  });
};

const callRawUpdateWithJson = async (config: string) => {
  const root = await getRootUser();
  return Call(updateWithJsonApi, { auth: root, body: { config } });
};

const findSavedModel = (model: string) => MongoSystemModel.findOne({ model }).lean();

describe('updateWithJson api', () => {
  it('imports configs as flat model documents (creates new models)', async () => {
    const res = await callUpdateWithJson([buildModelConfig({}, 'imported-model')]);

    expect(res.code).toBe(200);

    const saved = await findSavedModel('imported-model');
    expect(saved).toMatchObject({
      model: 'imported-model',
      name: 'imported-model',
      provider: 'OpenAI',
      type: ModelTypeEnum.llm,
      isSystem: true
    });
  });

  it('updates existing model when id is provided', async () => {
    const existing = await MongoSystemModel.create({
      model: 'existing-model',
      type: ModelTypeEnum.llm,
      name: 'Old Name',
      provider: 'OpenAI',
      isSystem: true
    });

    const res = await callUpdateWithJson([
      buildModelConfig({ id: String(existing._id), name: 'New Name' }, 'existing-model')
    ]);

    expect(res.code).toBe(200);

    const saved = await MongoSystemModel.findById(existing._id).lean();
    expect(saved?.name).toBe('New Name');
    // No duplicate created
    await expect(MongoSystemModel.countDocuments({ model: 'existing-model' })).resolves.toBe(1);
  });

  it('sanitizes unknown fields and stores normalized model', async () => {
    const res = await callUpdateWithJson([
      buildModelConfig(
        { defaultConfig: { extra_body: { enable_thinking: false } }, unknownField: 'stripped' },
        'sanitized-model'
      )
    ]);

    expect(res.code).toBe(200);

    const saved = await findSavedModel('sanitized-model');
    expect(saved?.defaultConfig).toEqual({ extra_body: { enable_thinking: false } });
    expect(saved?.unknownField).toBeUndefined();
  });

  it('maps malformed JSON to invalidModelConfig without writing', async () => {
    const existing = await MongoSystemModel.create(
      buildModelConfig({ isSystem: true }, 'existing-before-malformed')
    );

    const res = await callRawUpdateWithJson('{invalid-json');

    expect(res.error).toBe('invalidModelConfig');
    await expect(MongoSystemModel.findById(existing._id)).resolves.not.toBeNull();
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(1);
  });

  it('maps invalid nested config to invalidModelConfig and validates all items before writing', async () => {
    const res = await callUpdateWithJson([
      buildModelConfig({}, 'must-not-be-created'),
      buildModelConfig({ defaultConfig: '' }, 'invalid-nested-config')
    ]);

    expect(res.error).toBe('invalidModelConfig');
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });

  it.each([
    ['empty item', [{} as ConfigItem], 'invalidModelConfig'],
    [
      'missing type',
      [{ model: 'missing-type', provider: 'OpenAI' } as ConfigItem],
      'invalidModelConfig'
    ],
    [
      'missing model',
      [{ type: ModelTypeEnum.llm, provider: 'OpenAI' } as ConfigItem],
      'invalidModelConfig'
    ],
    [
      'missing provider',
      [{ type: ModelTypeEnum.llm, model: 'missing-provider' } as ConfigItem],
      'invalidModelConfig'
    ],
    [
      'invalid id (non-ObjectId)',
      [buildModelConfig({ id: 'not-an-object-id' }, 'bad-id-model')],
      'invalidModelId'
    ]
  ])('rejects invalid model config: %s', async (_name, data, error) => {
    const res = await callUpdateWithJson(data);

    expect(res.code).toBe(500);
    expect(res.error).toBe(error);
  });
});
