import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createCollection, authCreate, authChanges, getModelAuthContext, modelAuthContext } =
  vi.hoisted(() => ({
    createCollection: vi.fn(),
    authCreate: vi.fn(),
    authChanges: vi.fn(),
    getModelAuthContext: vi.fn(),
    modelAuthContext: { modelHandle: {}, authorizedIds: new Set<string>() }
  }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: any) => handler }));
vi.mock('@fastgpt/service/core/dataset/apiDataset/service', () => ({
  createApiDatasetCollection: createCollection
}));
vi.mock('@fastgpt/service/core/dataset/apiDataset/auth', () => ({
  authApiFileImportChanges: authChanges
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollectionCreate: authCreate
}));
vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: vi.fn()
}));
vi.mock('@fastgpt/service/core/dataset/model', () => ({
  getDatasetModelAuthContext: getModelAuthContext
}));
import handler from '@/pages/api/core/dataset/collection/create/apiCollectionV2';

const plan = { creationParentIds: [null], newFolderIds: new Set<string>(), moves: [] };
beforeEach(() => {
  vi.clearAllMocks();
  authCreate.mockResolvedValue({
    teamId: 'team',
    tmbId: 'member',
    isRoot: false,
    dataset: { _id: 'dataset' }
  });
  getModelAuthContext.mockResolvedValue(modelAuthContext);
  authChanges.mockResolvedValue(undefined);
  createCollection.mockImplementation(async ({ authorizeChanges }) => {
    await authorizeChanges(plan);
    return { successCount: 1, failedCount: 0 };
  });
});

describe('handler', () => {
  it('把真实写入计划交给携带请求身份的鉴权，并忽略兼容 parentId', async () => {
    const req = {
      body: { datasetId: 'dataset', apiFiles: [], parentId: '6acb61a720031dde73883464' }
    };
    expect(await handler(req as any, {} as Parameters<typeof handler>[1])).toEqual({
      successCount: 1,
      failedCount: 0
    });
    expect(authChanges).toHaveBeenCalledExactlyOnceWith({
      req,
      authToken: true,
      authApiKey: true,
      datasetId: 'dataset',
      ...plan
    });
    expect(createCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: undefined,
        teamId: 'team',
        tmbId: 'member',
        modelAuthContext
      })
    );
  });
  it('真实落位鉴权失败时透传拒绝结果', async () => {
    authChanges.mockRejectedValue(new Error('restricted collection'));
    await expect(
      handler(
        { body: { datasetId: 'dataset', apiFiles: [] } } as any,
        {} as Parameters<typeof handler>[1]
      )
    ).rejects.toThrow('restricted collection');
  });
  it('非法入参在鉴权及业务执行之前拒绝', async () => {
    await expect(
      handler(
        { body: { datasetId: 'dataset', apiFiles: 'invalid' } } as any,
        {} as Parameters<typeof handler>[1]
      )
    ).rejects.toThrow();
    expect(authCreate).not.toHaveBeenCalled();
    expect(createCollection).not.toHaveBeenCalled();
  });

  it('embedding 权限失败时不开始远端导入', async () => {
    getModelAuthContext.mockRejectedValueOnce(new Error('embedding model is not authorized'));

    await expect(
      handler(
        { body: { datasetId: 'dataset', apiFiles: [] } } as any,
        {} as Parameters<typeof handler>[1]
      )
    ).rejects.toThrow('embedding model is not authorized');

    expect(createCollection).not.toHaveBeenCalled();
  });
});
