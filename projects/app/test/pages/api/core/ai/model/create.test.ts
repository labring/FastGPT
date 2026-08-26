import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/model/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/utils')>()),
  updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
}));

import createModelApi from '@/pages/api/core/ai/model/create';

describe('create model api', () => {
  it('does not persist price fields when root creates a team model', async () => {
    const root = await getRootUser();

    const res = await Call(createModelApi, {
      auth: root,
      body: {
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
      }
    });

    expect(res.code).toBe(200);
    const created = await MongoSystemModel.findById(res.data.id).lean();
    expect(created?.isSystem).toBe(false);
    expect(created?.charsPointsPrice).toBeUndefined();
    expect(created?.priceTiers).toEqual([]);
  });

  it('rejects a duplicate system model identifier', async () => {
    const root = await getRootUser();
    const body = {
      model: `duplicate-system-${Date.now()}`,
      type: ModelTypeEnum.llm,
      name: 'Duplicate system model',
      provider: 'OpenAI',
      isSystem: true,
      isActive: true,
      maxContext: 16000,
      maxResponse: 8000,
      quoteMaxToken: 12000
    } as const;

    const first = await Call(createModelApi, { auth: root, body });
    expect(first.code).toBe(200);

    const duplicate = await Call(createModelApi, { auth: root, body });
    expect(duplicate.error).toBe(ModelErrEnum.modelIdConflict);
    await expect(
      MongoSystemModel.countDocuments({ model: body.model, isSystem: true })
    ).resolves.toBe(1);
  });

  it('rejects a duplicate system display name', async () => {
    const root = await getRootUser();
    const body = {
      model: `duplicate-system-display-${Date.now()}`,
      type: ModelTypeEnum.llm,
      name: 'Duplicate system display name',
      provider: 'OpenAI',
      isSystem: true,
      isActive: true,
      maxContext: 16000,
      maxResponse: 8000,
      quoteMaxToken: 12000
    } as const;
    const first = await Call(createModelApi, { auth: root, body });
    expect(first.code).toBe(200);

    const duplicate = await Call(createModelApi, {
      auth: root,
      body: { ...body, model: `${body.model}-other` }
    });
    expect(duplicate.error).toBe(ModelErrEnum.modelNameConflict);
  });

  it('rejects a duplicate private model identifier for the same member', async () => {
    const root = await getRootUser();
    const body = {
      model: `duplicate-private-${Date.now()}`,
      type: ModelTypeEnum.llm,
      name: 'Duplicate private model',
      provider: 'OpenAI',
      isSystem: false,
      isActive: true,
      maxContext: 16000,
      maxResponse: 8000,
      quoteMaxToken: 12000
    } as const;

    const first = await Call(createModelApi, { auth: root, body });
    expect(first.code).toBe(200);

    const duplicate = await Call(createModelApi, { auth: root, body });
    expect(duplicate.error).toBe(ModelErrEnum.modelIdConflict);
    await expect(
      MongoSystemModel.countDocuments({ model: body.model, isSystem: false })
    ).resolves.toBe(1);
  });

  it('rejects a duplicate private display name for the same member', async () => {
    const root = await getRootUser();
    const body = {
      model: `duplicate-private-display-${Date.now()}`,
      type: ModelTypeEnum.llm,
      name: 'Duplicate private display name',
      provider: 'OpenAI',
      isSystem: false,
      isActive: true,
      maxContext: 16000,
      maxResponse: 8000,
      quoteMaxToken: 12000
    } as const;
    const first = await Call(createModelApi, { auth: root, body });
    expect(first.code).toBe(200);

    const duplicate = await Call(createModelApi, {
      auth: root,
      body: { ...body, model: `${body.model}-other` }
    });
    expect(duplicate.error).toBe(ModelErrEnum.modelNameConflict);
  });
});
