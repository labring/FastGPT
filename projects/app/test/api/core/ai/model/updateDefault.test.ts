import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
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
    mocks.updateMany.mockResolvedValue({ acknowledged: true });
    mocks.bulkWrite.mockResolvedValue({ acknowledged: true });
    mocks.refreshModelTemplates.mockResolvedValue([]);
    mocks.updatedReloadSystemModel.mockResolvedValue(undefined);
  });

  it('uses string model IDs without ObjectId validation or explicit conversion', async () => {
    const ids = {
      llm: 'system-llm-id',
      embedding: 'system-embedding-id',
      datasetText: 'dataset-text-id',
      datasetImage: 'dataset-image-id',
      chatTitle: 'chat-title-id'
    };

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
});
