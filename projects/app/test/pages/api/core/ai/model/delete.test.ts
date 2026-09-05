import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const modelId = '68ad85a7463006c963799a05';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  findModelData: vi.fn(),
  removeModelsFromAIProxyChannels: vi.fn(),
  deleteModels: vi.fn(),
  deletePermissions: vi.fn(),
  updatedReloadSystemModel: vi.fn(),
  session: { id: 'session-1' }
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/core/ai/config/utils', () => ({
  updatedReloadSystemModel: mocks.updatedReloadSystemModel
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  findModelData: mocks.findModelData
}));

vi.mock('@fastgpt/service/thirdProvider/aiproxy/channel', () => ({
  removeModelsFromAIProxyChannels: mocks.removeModelsFromAIProxyChannels
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoAIModel: {
    deleteMany: mocks.deleteModels,
    find: ({ _id }: { _id: { $in: string[] } }) => ({
      select: () => ({
        lean: async () => _id.$in.map((modelId) => mocks.findModelData({ modelId })).filter(Boolean)
      })
    })
  }
}));

vi.mock('@fastgpt/service/support/permission/schema', () => ({
  MongoResourcePermission: { deleteMany: mocks.deletePermissions }
}));

vi.mock('@fastgpt/service/core/ai/config/entity', () => ({
  runSystemModelTransaction: vi.fn(async (callback: (session: unknown) => Promise<unknown>) =>
    callback(mocks.session)
  )
}));

import handler from '@/pages/api/admin/settings/model/delete';

describe('DELETE /api/admin/settings/model/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.findModelData.mockImplementation(({ modelId: requestedModelId }) => ({
      modelId: requestedModelId,
      model: `model-${requestedModelId}`,
      type: ModelTypeEnum.llm
    }));
    mocks.removeModelsFromAIProxyChannels.mockResolvedValue(undefined);
    mocks.deleteModels.mockResolvedValue({ deletedCount: 1 });
    mocks.deletePermissions.mockResolvedValue({ deletedCount: 1 });
    mocks.updatedReloadSystemModel.mockResolvedValue(undefined);
  });

  it('hard deletes an installed model without consulting Plugin templates', async () => {
    await handler({ query: { modelId } } as any);

    expect(mocks.removeModelsFromAIProxyChannels).toHaveBeenCalledWith({
      models: [`model-${modelId}`]
    });
    expect(mocks.deleteModels).toHaveBeenCalledWith(
      { _id: { $in: [modelId] }, scope: 'system' },
      { session: mocks.session }
    );
    expect(mocks.deletePermissions).toHaveBeenCalledWith(
      {
        resourceType: 'model',
        resourceId: { $in: [modelId] }
      },
      { session: mocks.session }
    );
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledWith();
  });

  it('deletes the model regardless of whether Plugin is available', async () => {
    await handler({ query: { modelId } } as any);

    expect(mocks.deleteModels).toHaveBeenCalledOnce();
  });

  it('deletes multiple models and permissions in one transaction', async () => {
    const secondModelId = '68ad85a7463006c963799a06';
    mocks.deleteModels.mockResolvedValueOnce({ deletedCount: 2 });

    await handler({ body: { modelIds: [modelId, secondModelId] } } as any);

    expect(mocks.removeModelsFromAIProxyChannels).toHaveBeenCalledWith({
      models: [`model-${modelId}`, `model-${secondModelId}`]
    });
    expect(mocks.deleteModels).toHaveBeenCalledWith(
      { _id: { $in: [modelId, secondModelId] }, scope: 'system' },
      { session: mocks.session }
    );
    expect(mocks.deletePermissions).toHaveBeenCalledWith(
      {
        resourceType: 'model',
        resourceId: { $in: [modelId, secondModelId] }
      },
      { session: mocks.session }
    );
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledOnce();
  });

  it('does not mutate channels or MongoDB when any model does not exist', async () => {
    const missingModelId = '68ad85a7463006c963799a06';
    mocks.findModelData.mockImplementation(({ modelId: requestedModelId }) =>
      requestedModelId === missingModelId
        ? undefined
        : {
            modelId: requestedModelId,
            model: `model-${requestedModelId}`,
            type: ModelTypeEnum.llm
          }
    );

    await expect(
      handler({ body: { modelIds: [modelId, missingModelId] } } as any)
    ).rejects.toBeDefined();

    expect(mocks.removeModelsFromAIProxyChannels).not.toHaveBeenCalled();
    expect(mocks.deleteModels).not.toHaveBeenCalled();
  });

  it('does not delete MongoDB records when channel unbinding fails', async () => {
    mocks.removeModelsFromAIProxyChannels.mockRejectedValueOnce(new Error('unbind failed'));

    await expect(handler({ query: { modelId } } as any)).rejects.toThrow('unbind failed');

    expect(mocks.deleteModels).not.toHaveBeenCalled();
    expect(mocks.deletePermissions).not.toHaveBeenCalled();
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('unbinds channels before starting the MongoDB deletion', async () => {
    await handler({ query: { modelId } } as any);

    expect(mocks.removeModelsFromAIProxyChannels.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteModels.mock.invocationCallOrder[0]
    );
  });
});
