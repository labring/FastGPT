import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler, updateTraining, updateSyncSchedule } from '@/pages/api/core/dataset/update';
import {
  DatasetTypeEnum,
  TrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

// Partial mock helpers for modules with named exports
vi.mock('@fastgpt/service/core/dataset/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/dataset/schema')>();
  return {
    ...actual,
    MongoDataset: {
      ...actual.MongoDataset,
      findByIdAndUpdate: vi.fn()
    }
  };
});
vi.mock('@fastgpt/service/core/dataset/training/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/training/schema')>();
  return {
    ...actual,
    MongoDatasetTraining: {
      ...actual.MongoDatasetTraining,
      updateMany: vi.fn()
    }
  };
});
vi.mock('@fastgpt/service/core/dataset/collection/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/collection/schema')>();
  return {
    ...actual,
    MongoDatasetCollection: {
      ...actual.MongoDatasetCollection,
      updateMany: vi.fn()
    }
  };
});
vi.mock('@fastgpt/service/support/permission/dataset/auth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/dataset/auth')>();
  return {
    ...actual,
    authDataset: vi.fn()
  };
});
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/mongo/sessionRun')>();
  return {
    ...actual,
    mongoSessionRun: vi.fn((fn) => fn({}))
  };
});
vi.mock('@fastgpt/service/support/permission/controller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/controller')>();
  return {
    ...actual,
    getResourceClbsAndGroups: vi.fn()
  };
});
vi.mock('@fastgpt/service/common/file/image/controller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/common/file/image/controller')>();
  return {
    ...actual,
    refreshSourceAvatar: vi.fn()
  };
});
vi.mock('@fastgpt/service/core/dataset/websiteSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/dataset/websiteSync')>();
  return {
    ...actual,
    upsertWebsiteSyncJobScheduler: vi.fn(),
    removeWebsiteSyncJobScheduler: vi.fn()
  };
});
vi.mock('@fastgpt/service/core/dataset/controller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/dataset/controller')>();
  return {
    ...actual,
    delDatasetRelevantData: vi.fn()
  };
});
vi.mock('@fastgpt/service/support/permission/inheritPermission', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/inheritPermission')>();
  return {
    ...actual,
    syncCollaborators: vi.fn(),
    syncChildrenPermission: vi.fn()
  };
});
vi.mock('@fastgpt/service/support/permission/user/auth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/user/auth')>();
  return {
    ...actual,
    authUserPer: vi.fn()
  };
});
vi.mock('@fastgpt/global/common/parentFolder/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/common/parentFolder/utils')>();
  return {
    ...actual,
    parseParentIdInMongo: vi.fn(() => ({}))
  };
});
vi.mock('lodash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lodash')>();
  return {
    ...actual,
    isEqual: actual.isEqual
  };
});
vi.mock('date-fns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('date-fns')>();
  return {
    ...actual,
    addDays: actual.addDays
  };
});

// Mock MongoResourcePermission.deleteMany for move-to-root, move-from-root, and remove clb tests
vi.mock('@fastgpt/service/support/permission/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/schema')>();
  return {
    ...actual,
    MongoResourcePermission: {
      ...actual.MongoResourcePermission,
      deleteMany: vi.fn()
    }
  };
});

describe('dataset update handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject if id is missing', async () => {
    await expect(handler({ body: {} } as any, {} as any)).rejects.toBe(CommonErrEnum.missingParams);
  });

  it('should reject if no write permission', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    vi.mocked(mockAuthDataset.authDataset).mockResolvedValue({
      dataset: {
        type: DatasetTypeEnum.dataset
      },
      permission: {
        hasWritePer: false
      }
    } as any);

    await expect(handler({ body: { id: '123' } } as any, {} as any)).rejects.toBe(
      DatasetErrEnum.unAuthDataset
    );
  });

  it('should update dataset with correct fields and call all side effects for normal update', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    vi.mocked(mockAuthDataset.authDataset).mockResolvedValue({
      dataset: {
        _id: 'ds1',
        id: 'ds1',
        type: DatasetTypeEnum.dataset,
        teamId: 'teamX',
        parentId: undefined,
        chunkSettings: { chunkSize: 100 },
        avatar: 'oldAvatar'
      },
      permission: {
        hasWritePer: true
      }
    } as any);

    const { MongoDataset } = await import('@fastgpt/service/core/dataset/schema');
    const mockFindByIdAndUpdate = vi.mocked(MongoDataset.findByIdAndUpdate);
    mockFindByIdAndUpdate.mockResolvedValue({});

    const mockRefreshSourceAvatar = await import('@fastgpt/service/common/file/image/controller');
    vi.mocked(mockRefreshSourceAvatar.refreshSourceAvatar).mockResolvedValue({});

    await handler(
      {
        body: {
          id: 'ds1',
          name: 'newName',
          avatar: 'newAvatar',
          intro: 'desc',
          agentModel: 'gpt-4',
          vlmModel: 'vlm',
          websiteConfig: { url: 'https://foo' },
          externalReadUrl: 'https://bar',
          apiServer: { baseUrl: 'api', authorization: 'token', basePath: '/api' },
          chunkSettings: { chunkSize: 200 },
          autoSync: true
        }
      } as any,
      {} as any
    );

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'ds1',
      expect.objectContaining({
        name: 'newName',
        avatar: 'newAvatar',
        intro: 'desc',
        agentModel: 'gpt-4',
        vlmModel: 'vlm',
        websiteConfig: { url: 'https://foo' },
        externalReadUrl: 'https://bar',
        'apiServer.baseUrl': 'api',
        'apiServer.authorization': 'token',
        'apiServer.basePath': '/api',
        chunkSettings: { chunkSize: 200 },
        autoSync: true
      }),
      expect.any(Object)
    );
    expect(mockRefreshSourceAvatar.refreshSourceAvatar).toHaveBeenCalledWith(
      'newAvatar',
      'oldAvatar',
      expect.anything()
    );
  });

  it('should call delDatasetRelevantData when websiteDataset chunkSettings change', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    vi.mocked(mockAuthDataset.authDataset).mockResolvedValue({
      dataset: {
        _id: 'ds1',
        id: 'ds1',
        type: DatasetTypeEnum.websiteDataset,
        teamId: 'teamX',
        parentId: undefined,
        chunkSettings: {
          chunkSize: 100,
          imageIndex: 1,
          autoIndexes: false,
          trainingType: 'a',
          chunkSettingMode: 'a',
          chunkSplitMode: 'a',
          chunkSplitter: 'a',
          indexSize: 1,
          qaPrompt: 'p'
        },
        avatar: 'oldAvatar'
      },
      permission: {
        hasWritePer: true
      }
    } as any);

    const delDatasetRelevantData = (await import('@fastgpt/service/core/dataset/controller'))
      .delDatasetRelevantData;
    vi.mocked(delDatasetRelevantData).mockResolvedValue({});

    await handler(
      {
        body: {
          id: 'ds1',
          chunkSettings: {
            chunkSize: 200,
            imageIndex: 1,
            autoIndexes: false,
            trainingType: 'a',
            chunkSettingMode: 'a',
            chunkSplitMode: 'a',
            chunkSplitter: 'a',
            indexSize: 1,
            qaPrompt: 'p'
          }
        }
      } as any,
      {} as any
    );

    expect(delDatasetRelevantData).toHaveBeenCalledWith(
      expect.objectContaining({
        datasets: [expect.objectContaining({ _id: 'ds1' })],
        session: expect.anything()
      })
    );
  });

  it('should handle move to folder and call syncCollaborators and syncChildrenPermission', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    let callCount = 0;
    vi.mocked(mockAuthDataset.authDataset).mockImplementation(async (args: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          dataset: {
            _id: 'ds1',
            id: 'ds1',
            type: DatasetTypeEnum.folder,
            teamId: 'teamX',
            parentId: undefined,
            inheritPermission: true
          },
          permission: { hasWritePer: true }
        };
      } else {
        return {
          dataset: {
            _id: 'folder2',
            id: 'folder2',
            type: DatasetTypeEnum.folder,
            teamId: 'teamX'
          },
          permission: { hasWritePer: true }
        };
      }
    });

    const getResourceClbsAndGroups = (
      await import('@fastgpt/service/support/permission/controller')
    ).getResourceClbsAndGroups;
    vi.mocked(getResourceClbsAndGroups).mockResolvedValue([{ userId: 'u1' }]);

    const syncCollaborators = (
      await import('@fastgpt/service/support/permission/inheritPermission')
    ).syncCollaborators;
    const syncChildrenPermission = (
      await import('@fastgpt/service/support/permission/inheritPermission')
    ).syncChildrenPermission;

    await handler(
      {
        body: {
          id: 'ds1',
          parentId: 'folder2'
        }
      } as any,
      {} as any
    );

    expect(getResourceClbsAndGroups).toHaveBeenCalled();
    expect(syncCollaborators).toHaveBeenCalled();
    expect(syncChildrenPermission).toHaveBeenCalled();
  });

  it('should handle move to root and call authUserPer', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    // Also mock deleteMany for MongoResourcePermission to avoid CastError
    const { MongoResourcePermission } = await import('@fastgpt/service/support/permission/schema');
    vi.mocked(MongoResourcePermission.deleteMany).mockResolvedValue({});

    vi.mocked(mockAuthDataset.authDataset).mockImplementation(async (args: any) => {
      if (args.datasetId === 'ds1') {
        return {
          dataset: {
            _id: 'ds1',
            id: 'ds1',
            type: DatasetTypeEnum.dataset,
            teamId: '000000000000000000000001', // valid ObjectId-like string
            parentId: 'folder1'
          },
          permission: { hasWritePer: true }
        };
      } else if (args.datasetId === null) {
        return {
          dataset: {
            _id: null,
            id: null,
            type: DatasetTypeEnum.folder,
            teamId: '000000000000000000000001'
          },
          permission: { hasWritePer: true }
        };
      } else {
        return {
          dataset: {
            _id: 'folder1',
            id: 'folder1',
            type: DatasetTypeEnum.folder,
            teamId: '000000000000000000000001'
          },
          permission: { hasWritePer: true }
        };
      }
    });

    const authUserPer = (await import('@fastgpt/service/support/permission/user/auth')).authUserPer;
    vi.mocked(authUserPer).mockResolvedValue({});

    await handler(
      {
        body: {
          id: 'ds1',
          parentId: null
        }
      } as any,
      {} as any
    );

    expect(authUserPer).toHaveBeenCalled();
  });

  it('should handle move from root and call authUserPer', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    // Also mock deleteMany for MongoResourcePermission to avoid CastError
    const { MongoResourcePermission } = await import('@fastgpt/service/support/permission/schema');
    vi.mocked(MongoResourcePermission.deleteMany).mockResolvedValue({});

    vi.mocked(mockAuthDataset.authDataset).mockImplementation(async (args: any) => {
      if (args.datasetId === 'ds1') {
        return {
          dataset: {
            _id: 'ds1',
            id: 'ds1',
            type: DatasetTypeEnum.dataset,
            teamId: '000000000000000000000001', // valid ObjectId-like string
            parentId: undefined
          },
          permission: { hasWritePer: true }
        };
      } else {
        return {
          dataset: {
            _id: 'folder2',
            id: 'folder2',
            type: DatasetTypeEnum.folder,
            teamId: '000000000000000000000001'
          },
          permission: { hasWritePer: true }
        };
      }
    });

    const authUserPer = (await import('@fastgpt/service/support/permission/user/auth')).authUserPer;
    vi.mocked(authUserPer).mockResolvedValue({});

    await handler(
      {
        body: {
          id: 'ds1',
          parentId: 'folder2'
        }
      } as any,
      {} as any
    );

    expect(authUserPer).toHaveBeenCalled();
  });

  it('should remove all clb when moving non-folder dataset', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    const { MongoResourcePermission } = await import('@fastgpt/service/support/permission/schema');
    vi.mocked(MongoResourcePermission.deleteMany).mockResolvedValue({});

    vi.mocked(mockAuthDataset.authDataset).mockResolvedValue({
      dataset: {
        _id: 'ds1',
        id: 'ds1',
        type: DatasetTypeEnum.dataset,
        teamId: '000000000000000000000001', // valid ObjectId-like string
        parentId: 'folder1'
      },
      permission: {
        hasWritePer: true
      }
    } as any);

    await handler(
      {
        body: {
          id: 'ds1',
          parentId: 'folder2'
        }
      } as any,
      {} as any
    );
    expect(MongoResourcePermission.deleteMany).toHaveBeenCalledWith(
      {
        resourceId: 'ds1',
        teamId: '000000000000000000000001',
        resourceType: 'dataset'
      },
      { session: expect.anything() }
    );
  });

  it('should update apiServer.basePath even if it is empty string', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    vi.mocked(mockAuthDataset.authDataset).mockResolvedValue({
      dataset: {
        _id: 'ds1',
        id: 'ds1',
        type: DatasetTypeEnum.dataset,
        teamId: 'teamX',
        parentId: undefined,
        chunkSettings: { chunkSize: 100 },
        avatar: 'oldAvatar'
      },
      permission: {
        hasWritePer: true
      }
    } as any);

    const { MongoDataset } = await import('@fastgpt/service/core/dataset/schema');
    const mockFindByIdAndUpdate = vi.mocked(MongoDataset.findByIdAndUpdate);
    mockFindByIdAndUpdate.mockResolvedValue({});

    await handler(
      {
        body: {
          id: 'ds1',
          apiServer: { basePath: '' }
        }
      } as any,
      {} as any
    );

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'ds1',
      expect.objectContaining({
        'apiServer.basePath': ''
      }),
      expect.any(Object)
    );
  });

  it('should update yuqueServer.basePath even if it is empty string', async () => {
    const mockAuthDataset = await import('@fastgpt/service/support/permission/dataset/auth');
    vi.mocked(mockAuthDataset.authDataset).mockResolvedValue({
      dataset: {
        _id: 'ds1',
        id: 'ds1',
        type: DatasetTypeEnum.dataset,
        teamId: 'teamX',
        parentId: undefined,
        chunkSettings: { chunkSize: 100 },
        avatar: 'oldAvatar'
      },
      permission: {
        hasWritePer: true
      }
    } as any);

    const { MongoDataset } = await import('@fastgpt/service/core/dataset/schema');
    const mockFindByIdAndUpdate = vi.mocked(MongoDataset.findByIdAndUpdate);
    mockFindByIdAndUpdate.mockResolvedValue({});

    await handler(
      {
        body: {
          id: 'ds1',
          yuqueServer: { basePath: '' }
        }
      } as any,
      {} as any
    );

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'ds1',
      expect.objectContaining({
        'yuqueServer.basePath': ''
      }),
      expect.any(Object)
    );
  });
});

describe('updateTraining', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not update if agentModel is missing', async () => {
    const { MongoDatasetTraining } = await import('@fastgpt/service/core/dataset/training/schema');
    await updateTraining({
      teamId: '123',
      datasetId: '456'
    });

    expect(MongoDatasetTraining.updateMany).not.toHaveBeenCalled();
  });

  it('should update training with new model', async () => {
    const { MongoDatasetTraining } = await import('@fastgpt/service/core/dataset/training/schema');
    await updateTraining({
      teamId: '123',
      datasetId: '456',
      agentModel: 'gpt-4'
    });

    expect(MongoDatasetTraining.updateMany).toHaveBeenCalledWith(
      {
        teamId: '123',
        datasetId: '456',
        mode: { $in: [TrainingModeEnum.qa, TrainingModeEnum.auto] }
      },
      {
        $set: {
          model: 'gpt-4',
          retryCount: 5,
          lockTime: new Date('2000/1/1')
        }
      }
    );
  });
});

describe('updateSyncSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not update if autoSync is undefined', async () => {
    const { MongoDatasetCollection } = await import(
      '@fastgpt/service/core/dataset/collection/schema'
    );
    await updateSyncSchedule({
      dataset: {
        type: DatasetTypeEnum.websiteDataset
      } as any,
      session: {} as any
    });

    expect(MongoDatasetCollection.updateMany).not.toHaveBeenCalled();
  });

  it('should update collection sync time when autoSync is true', async () => {
    const { MongoDatasetCollection } = await import(
      '@fastgpt/service/core/dataset/collection/schema'
    );
    await updateSyncSchedule({
      dataset: {
        _id: '123',
        teamId: '456',
        type: DatasetTypeEnum.dataset
      } as any,
      autoSync: true,
      session: {} as any
    });

    expect(MongoDatasetCollection.updateMany).toHaveBeenCalledWith(
      {
        teamId: '456',
        datasetId: '123',
        type: { $in: [DatasetCollectionTypeEnum.apiFile, DatasetCollectionTypeEnum.link] }
      },
      {
        $set: {
          nextSyncTime: expect.any(Date)
        }
      },
      { session: {} }
    );
  });

  it('should remove nextSyncTime when autoSync is false', async () => {
    const { MongoDatasetCollection } = await import(
      '@fastgpt/service/core/dataset/collection/schema'
    );
    await updateSyncSchedule({
      dataset: {
        _id: '123',
        teamId: '456',
        type: DatasetTypeEnum.dataset
      } as any,
      autoSync: false,
      session: {} as any
    });

    expect(MongoDatasetCollection.updateMany).toHaveBeenCalledWith(
      {
        teamId: '456',
        datasetId: '123'
      },
      {
        $unset: {
          nextSyncTime: 1
        }
      },
      { session: {} }
    );
  });

  it('should call upsertWebsiteSyncJobScheduler for websiteDataset and autoSync true', async () => {
    const upsertWebsiteSyncJobScheduler = (
      await import('@fastgpt/service/core/dataset/websiteSync')
    ).upsertWebsiteSyncJobScheduler;

    await updateSyncSchedule({
      dataset: {
        _id: 'ds1',
        teamId: 'teamX',
        type: DatasetTypeEnum.websiteDataset
      } as any,
      autoSync: true,
      session: {} as any
    });

    expect(upsertWebsiteSyncJobScheduler).toHaveBeenCalledWith({ datasetId: 'ds1' });
  });

  it('should call removeWebsiteSyncJobScheduler for websiteDataset and autoSync false', async () => {
    const removeWebsiteSyncJobScheduler = (
      await import('@fastgpt/service/core/dataset/websiteSync')
    ).removeWebsiteSyncJobScheduler;

    await updateSyncSchedule({
      dataset: {
        _id: 'ds1',
        teamId: 'teamX',
        type: DatasetTypeEnum.websiteDataset
      } as any,
      autoSync: false,
      session: {} as any
    });

    expect(removeWebsiteSyncJobScheduler).toHaveBeenCalledWith('ds1');
  });
});
