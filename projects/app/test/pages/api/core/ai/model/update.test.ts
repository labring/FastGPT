import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/model/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/utils')>()),
  updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
}));

import updateModelApi from '@/pages/api/core/ai/model/update';

const createModel = async () => {
  const saved = await MongoSystemModel.create({
    model: 'test-llm',
    type: ModelTypeEnum.llm,
    name: 'Original name',
    provider: 'OpenAI',
    isSystem: true,
    isActive: true,
    maxContext: 16000,
    maxResponse: 8000,
    quoteMaxToken: 12000
  });
  const modelData = {
    id: String(saved._id),
    model: saved.model,
    type: ModelTypeEnum.llm,
    name: saved.name,
    provider: saved.provider,
    isSystem: true,
    isActive: true,
    maxContext: 16000,
    maxResponse: 8000,
    quoteMaxToken: 12000
  } as const;
  global.systemModelIdMap.set(modelData.id, modelData);
  return { saved, modelData };
};

describe('update model api', () => {
  let originalSystemModelIdMap: typeof global.systemModelIdMap;

  beforeEach(() => {
    originalSystemModelIdMap = global.systemModelIdMap;
    global.systemModelIdMap = new Map();
  });

  afterEach(() => {
    global.systemModelIdMap = originalSystemModelIdMap;
  });

  it('partially updates a flat model while preserving untouched fields', async () => {
    const root = await getRootUser();
    const { saved } = await createModel();

    const res = await Call(updateModelApi, {
      auth: root,
      body: { id: String(saved._id), name: 'Updated name' }
    });

    expect(res.code).toBe(200);
    const updated = await MongoSystemModel.findById(saved._id).lean();
    expect(updated).toMatchObject({
      name: 'Updated name',
      model: 'test-llm',
      provider: 'OpenAI',
      maxContext: 16000
    });
  });

  it("rejects changing a system model to another model's identifier", async () => {
    const root = await getRootUser();
    const { saved } = await createModel();
    const conflict = await MongoSystemModel.create({
      model: 'conflicting-test-llm',
      type: ModelTypeEnum.llm,
      name: 'Conflicting model',
      provider: 'OpenAI',
      isSystem: true,
      isActive: true
    });

    const res = await Call(updateModelApi, {
      auth: root,
      body: { id: String(saved._id), model: conflict.model }
    });

    expect(res.error).toBe(ModelErrEnum.modelIdConflict);
    await expect(MongoSystemModel.findById(saved._id).lean()).resolves.toMatchObject({
      model: 'test-llm'
    });
  });

  it('rejects changing a system model to another display name', async () => {
    const root = await getRootUser();
    const { saved } = await createModel();
    await MongoSystemModel.create({
      model: 'another-display-name-model',
      type: ModelTypeEnum.llm,
      name: 'Conflicting display name',
      provider: 'OpenAI',
      isSystem: true,
      isActive: true
    });

    const res = await Call(updateModelApi, {
      auth: root,
      body: { id: String(saved._id), name: 'Conflicting display name' }
    });

    expect(res.error).toBe(ModelErrEnum.modelNameConflict);
    await expect(MongoSystemModel.findById(saved._id).lean()).resolves.toMatchObject({
      name: 'Original name'
    });
  });

  it('removes price fields when root updates a team model', async () => {
    const root = await getRootUser();
    const saved = await MongoSystemModel.create({
      model: 'team-llm',
      type: ModelTypeEnum.llm,
      name: 'Team model',
      provider: 'OpenAI',
      isSystem: false,
      isActive: true,
      maxContext: 16000,
      maxResponse: 8000,
      quoteMaxToken: 12000,
      charsPointsPrice: 3,
      priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }]
    });
    global.systemModelIdMap.set(String(saved._id), {
      ...saved.toObject(),
      id: String(saved._id)
    } as any);

    const res = await Call(updateModelApi, {
      auth: root,
      body: {
        id: String(saved._id),
        name: 'Updated team model',
        charsPointsPrice: 10,
        priceTiers: [{ minInputTokens: 0, inputPrice: 4, outputPrice: 5 }]
      }
    });

    expect(res.code).toBe(200);
    const updated = await MongoSystemModel.findById(saved._id).lean();
    expect(updated?.name).toBe('Updated team model');
    expect(updated?.charsPointsPrice).toBeUndefined();
    expect(updated?.priceTiers).toBeUndefined();
  });

  it('sanitizes unknown and immutable fields from a flat update', async () => {
    const root = await getRootUser();
    const { saved } = await createModel();

    const res = await Call(updateModelApi, {
      auth: root,
      body: {
        id: String(saved._id),
        name: 'Sanitized name',
        unknownField: 'strip-me',
        teamId: 'must-not-attach',
        tmbId: 'must-not-attach'
      } as any
    });

    expect(res.code).toBe(200);
    const updated = await MongoSystemModel.findById(saved._id).lean();
    expect(updated?.name).toBe('Sanitized name');
    expect(updated).not.toHaveProperty('unknownField');
    expect(updated?.teamId).toBeUndefined();
    expect(updated?.tmbId).toBeUndefined();
  });

  it('rejects invalid nested fields without modifying the database', async () => {
    const root = await getRootUser();
    const { saved } = await createModel();

    const res = await Call(updateModelApi, {
      auth: root,
      body: { id: String(saved._id), defaultConfig: '' } as any
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    const unchanged = await MongoSystemModel.findById(saved._id).lean();
    expect(unchanged?.name).toBe('Original name');
    expect(unchanged?.defaultConfig).toBeUndefined();
  });

  it('validates the canonical id before writing', async () => {
    const res = await Call(updateModelApi, {
      body: { id: 'invalid-model-id', name: 'Updated model' }
    });

    expect(res.error).toBe(ModelErrEnum.invalidModelId);
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects the removed model and metadata request shape', async () => {
    const res = await Call(updateModelApi, {
      body: { model: 'legacy-model', metadata: { name: 'Legacy model' } }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    expect(res.error?.context).toEqual({ inputSource: 'body' });
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });
});
