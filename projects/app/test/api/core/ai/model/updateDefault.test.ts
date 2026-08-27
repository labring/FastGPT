import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  findLean: vi.fn(),
  updateMany: vi.fn(),
  bulkWrite: vi.fn(),
  refreshModelTemplates: vi.fn(),
  updatedReloadSystemModel: vi.fn(),
  session: { id: 'session-1' }
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoAIModel: {
    find: vi.fn(() => ({ lean: mocks.findLean })),
    updateMany: mocks.updateMany,
    bulkWrite: mocks.bulkWrite
  }
}));

vi.mock('@fastgpt/service/core/ai/config/utils', () => ({
  refreshModelTemplates: mocks.refreshModelTemplates,
  updatedReloadSystemModel: mocks.updatedReloadSystemModel
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn(async (callback: (session: unknown) => Promise<unknown>) =>
    callback(mocks.session)
  )
}));

import handler from '@/pages/api/admin/settings/model/updateDefault';

describe('PUT /api/admin/settings/model/updateDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.findLean.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ acknowledged: true });
    mocks.bulkWrite.mockResolvedValue({ acknowledged: true });
    mocks.refreshModelTemplates.mockResolvedValue([]);
    mocks.updatedReloadSystemModel.mockResolvedValue(undefined);
  });

  it('validates and updates string model IDs without ObjectId conversion', async () => {
    const ids = {
      llm: 'system-llm-id',
      embedding: 'system-embedding-id',
      datasetText: 'dataset-text-id',
      datasetImage: 'dataset-image-id',
      chatTitle: 'chat-title-id'
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

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { scope: 'system' },
      {
        $unset: {
          isDefault: '',
          isDefaultDatasetTextModel: '',
          isDefaultDatasetImageModel: '',
          isDefaultChatTitleModel: ''
        }
      },
      { session: mocks.session }
    );
    const [operations, options] = mocks.bulkWrite.mock.calls[0];
    expect(options).toEqual({ session: mocks.session });
    expect(operations.map((operation: any) => operation.updateOne.filter._id)).toEqual([
      ids.llm,
      ids.embedding,
      ids.datasetText,
      ids.datasetImage,
      ids.chatTitle
    ]);
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledWith({ pluginDocuments: [] });
  });

  it.each([
    {
      name: 'model ID does not exist in the system scope',
      body: { [ModelTypeEnum.llm]: 'missing-model-id' },
      models: []
    },
    {
      name: 'model type does not match the default slot',
      body: { [ModelTypeEnum.embedding]: 'llm-model-id' },
      models: [{ _id: 'llm-model-id', type: ModelTypeEnum.llm, isActive: true, config: {} }]
    },
    {
      name: 'model is disabled',
      body: { [ModelTypeEnum.llm]: 'disabled-model-id' },
      models: [{ _id: 'disabled-model-id', type: ModelTypeEnum.llm, isActive: false, config: {} }]
    },
    {
      name: 'dataset image model does not support vision',
      body: { datasetImageLLMModelId: 'text-only-model-id' },
      models: [{ _id: 'text-only-model-id', type: ModelTypeEnum.llm, isActive: true, config: {} }]
    }
  ])('rejects when $name before clearing existing defaults', async ({ body, models }) => {
    mocks.findLean.mockResolvedValue(models);

    await expect(handler({ body } as any)).rejects.toThrow(ModelErrEnum.unExist);

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.bulkWrite).not.toHaveBeenCalled();
    expect(mocks.refreshModelTemplates).not.toHaveBeenCalled();
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });
});
