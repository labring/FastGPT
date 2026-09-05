import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  findLean: vi.fn(),
  upsertSystemDefaultModelIds: vi.fn(),
  updatedReloadSystemModel: vi.fn(),
  session: { id: 'default-model-session' }
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoAIModel: {
    find: vi.fn(() => ({ session: () => ({ lean: mocks.findLean }) }))
  }
}));

vi.mock('@fastgpt/service/core/ai/defaultModel/entity', () => ({
  upsertSystemDefaultModelIds: mocks.upsertSystemDefaultModelIds
}));

vi.mock('@fastgpt/service/core/ai/config/utils', () => ({
  updatedReloadSystemModel: mocks.updatedReloadSystemModel
}));

import handler from '@/pages/api/admin/settings/model/updateDefault';
vi.mock('@fastgpt/service/core/ai/config/entity', () => ({
  runSystemModelTransaction: (fn: (session: unknown) => Promise<unknown>) => fn(mocks.session)
}));

describe('PUT /api/admin/settings/model/updateDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.findLean.mockResolvedValue([]);
    mocks.upsertSystemDefaultModelIds.mockResolvedValue({ acknowledged: true });
    mocks.updatedReloadSystemModel.mockResolvedValue(undefined);
  });

  it('validates and updates ObjectId-formatted model IDs', async () => {
    const ids = {
      llm: '68ad85a7463006c963799a01',
      embedding: '68ad85a7463006c963799a02',
      datasetText: '68ad85a7463006c963799a03',
      datasetImage: '68ad85a7463006c963799a04',
      chatTitle: '68ad85a7463006c963799a05'
    };
    mocks.findLean.mockResolvedValue([
      { _id: ids.llm, type: ModelTypeEnum.llm, isActive: true, config: {} },
      { _id: ids.embedding, type: ModelTypeEnum.embedding, isActive: true, config: {} },
      { _id: ids.datasetText, type: ModelTypeEnum.llm, isActive: true, config: {} },
      {
        _id: ids.datasetImage,
        type: ModelTypeEnum.llm,
        isActive: true,
        config: { vision: true }
      },
      { _id: ids.chatTitle, type: ModelTypeEnum.llm, isActive: true, config: {} }
    ]);

    await handler({
      body: {
        [ModelTypeEnum.llm]: ids.llm,
        [ModelTypeEnum.embedding]: ids.embedding,
        datasetTextLLMModelId: ids.datasetText,
        datasetImageLLMModelId: ids.datasetImage,
        chatTitleLLMModelId: ids.chatTitle
      }
    } as any);

    expect(mocks.upsertSystemDefaultModelIds).toHaveBeenCalledWith(
      {
        llm: ids.llm,
        embedding: ids.embedding,
        tts: undefined,
        stt: undefined,
        rerank: undefined,
        datasetTextLLM: ids.datasetText,
        datasetImageLLM: ids.datasetImage,
        chatTitleLLM: ids.chatTitle
      },
      mocks.session
    );
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledWith();
  });

  it.each([
    {
      name: 'model ID does not exist in the system scope',
      body: { [ModelTypeEnum.llm]: '68ad85a7463006c963799a11' },
      models: []
    },
    {
      name: 'model type does not match the default slot',
      body: { [ModelTypeEnum.embedding]: '68ad85a7463006c963799a12' },
      models: [
        { _id: '68ad85a7463006c963799a12', type: ModelTypeEnum.llm, isActive: true, config: {} }
      ]
    },
    {
      name: 'model is disabled',
      body: { [ModelTypeEnum.llm]: '68ad85a7463006c963799a13' },
      models: [
        { _id: '68ad85a7463006c963799a13', type: ModelTypeEnum.llm, isActive: false, config: {} }
      ]
    },
    {
      name: 'dataset image model does not support vision',
      body: { datasetImageLLMModelId: '68ad85a7463006c963799a14' },
      models: [
        { _id: '68ad85a7463006c963799a14', type: ModelTypeEnum.llm, isActive: true, config: {} }
      ]
    }
  ])('rejects when $name before clearing existing defaults', async ({ body, models }) => {
    mocks.findLean.mockResolvedValue(models);

    await expect(handler({ body } as any)).rejects.toThrow(ModelErrEnum.unExist);

    expect(mocks.upsertSystemDefaultModelIds).not.toHaveBeenCalled();
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });
});
