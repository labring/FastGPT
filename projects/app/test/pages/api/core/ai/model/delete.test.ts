import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  refreshModelTemplates: vi.fn(),
  findModelData: vi.fn(),
  deleteModel: vi.fn(),
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
  refreshModelTemplates: mocks.refreshModelTemplates,
  updatedReloadSystemModel: mocks.updatedReloadSystemModel
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  findModelData: mocks.findModelData
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoAIModel: { deleteOne: mocks.deleteModel }
}));

vi.mock('@fastgpt/service/support/permission/schema', () => ({
  MongoResourcePermission: { deleteMany: mocks.deletePermissions }
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn(async (callback: (session: unknown) => Promise<unknown>) =>
    callback(mocks.session)
  )
}));

import handler from '@/pages/api/admin/settings/model/delete';

describe('DELETE /api/admin/settings/model/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.refreshModelTemplates.mockResolvedValue([]);
    mocks.findModelData.mockReturnValue({ modelId: 'model-id', model: 'custom-model' });
    mocks.deleteModel.mockResolvedValue({ deletedCount: 1 });
    mocks.deletePermissions.mockResolvedValue({ deletedCount: 1 });
    mocks.updatedReloadSystemModel.mockResolvedValue(undefined);
  });

  it('hard deletes a model absent from plugins together with its permission resources', async () => {
    await handler({ query: { modelId: 'model-id' } } as any);

    expect(mocks.deleteModel).toHaveBeenCalledWith(
      { _id: 'model-id', scope: 'system' },
      { session: mocks.session }
    );
    expect(mocks.deletePermissions).toHaveBeenCalledWith(
      {
        resourceType: 'model',
        resourceId: 'model-id'
      },
      { session: mocks.session }
    );
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledWith({ pluginDocuments: [] });
  });

  it('rejects deletion when the latest plugin snapshot still contains the model', async () => {
    mocks.refreshModelTemplates.mockResolvedValue([{ model: 'custom-model' }]);

    await expect(handler({ query: { modelId: 'model-id' } } as any)).rejects.toBe(
      'Plugin model cannot be deleted'
    );

    expect(mocks.deleteModel).not.toHaveBeenCalled();
    expect(mocks.deletePermissions).not.toHaveBeenCalled();
  });

  it('does not delete data when plugin refresh fails', async () => {
    mocks.refreshModelTemplates.mockRejectedValue(new Error('plugin unavailable'));

    await expect(handler({ query: { modelId: 'model-id' } } as any)).rejects.toThrow(
      'plugin unavailable'
    );

    expect(mocks.deleteModel).not.toHaveBeenCalled();
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });
});
