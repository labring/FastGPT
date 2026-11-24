import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemMigrationProgressInputSchema } from '@fastgpt/global/migration/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { LEGACY_SYSTEM_ROOT_API_FILE_ID } from '@fastgpt/service/core/dataset/apiDataset/utils';
import { systemMigrations, type SystemMigrationContext } from '@/migration/registry';
import { cleanApiDatasetSystemRoot } from '@/migration/tasks/4180/20261120_clean_api_dataset_system_root';
import { cleanSingleDatasetSystemRoot } from '@/migration/tasks/4180/20261120_clean_api_dataset_system_root/service';
import { getFakeUsers } from '@test/datas/users';

const createMigrationContext = () => {
  const reportProgress = vi.fn(async (input) => {
    SystemMigrationProgressInputSchema.parse(input);
  });
  const fail = vi.fn(async (err) => {
    throw new Error(err.message);
  });
  const controller = new AbortController();
  const context = {
    signal: controller.signal,
    reportProgress,
    assertActive: vi.fn(async () => {}),
    fail,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } as unknown as SystemMigrationContext;
  return { context, reportProgress, fail };
};

describe('20261120_clean_api_dataset_system_root migration', () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
      '@fastgpt/service/common/mongo/sessionRun'
    );
    vi.mocked(mongoSessionRun).mockImplementation(actual.mongoSessionRun);
  });

  it('cleans SYSTEM_ROOT sentinels, reparents children, preserves independent ACL snapshots, and is idempotent', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];

    // 知识库 1：开启集合级权限 + 独立权限哨兵（inheritPermission=false）
    const datasetPerm = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'perm-dataset',
      type: DatasetTypeEnum.apiDataset,
      syncAll: false,
      collectionPermissionEnabled: true
    });
    const sentinelPerm = await MongoDatasetCollection.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: datasetPerm._id,
      name: 'ROOT_FOLDER',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID,
      inheritPermission: false
    });
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: String(sentinelPerm._id),
      tmbId: member.tmbId,
      permission: ManageRoleVal
    });
    const inheritedChild = await MongoDatasetCollection.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: datasetPerm._id,
      name: 'top-folder',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'top-folder',
      apiFileParentId: LEGACY_SYSTEM_ROOT_API_FILE_ID,
      parentId: sentinelPerm._id,
      inheritPermission: true
    });
    const alreadyIndependentChild = await MongoDatasetCollection.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: datasetPerm._id,
      name: 'top-file',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'top-file',
      apiFileParentId: LEGACY_SYSTEM_ROOT_API_FILE_ID,
      parentId: sentinelPerm._id,
      inheritPermission: false
    });
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: String(inheritedChild._id),
      tmbId: owner.tmbId,
      permission: OwnerRoleVal
    });

    // 知识库 2：普通知识库（无独立哨兵权限）
    const datasetNormal = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'normal-dataset',
      type: DatasetTypeEnum.apiDataset,
      syncAll: false
    });
    const sentinelNormal = await MongoDatasetCollection.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: datasetNormal._id,
      name: 'ROOT_FOLDER',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID
    });
    const normalChild = await MongoDatasetCollection.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: datasetNormal._id,
      name: 'normal-file',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'normal-file',
      apiFileParentId: LEGACY_SYSTEM_ROOT_API_FILE_ID,
      parentId: sentinelNormal._id
    });

    // 知识库 3：局部导入（无哨兵），不应被置为 syncAll=true
    const datasetPartial = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'partial-dataset',
      type: DatasetTypeEnum.apiDataset,
      syncAll: false
    });
    await MongoDatasetCollection.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: datasetPartial._id,
      name: 'partial-file',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'partial-file'
    });

    // 首次执行迁移
    const { context, reportProgress } = createMigrationContext();
    const firstResult = await cleanApiDatasetSystemRoot(context);

    expect(firstResult).toEqual({ datasets: 2, sentinels: 2, reparented: 3 });
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'validation', status: SystemMigrationStatusEnum.succeeded })
    );

    // 哨兵已删，孤儿 ResourcePermission 已删
    await expect(MongoDatasetCollection.findById(sentinelPerm._id).lean()).resolves.toBeNull();
    await expect(MongoDatasetCollection.findById(sentinelNormal._id).lean()).resolves.toBeNull();
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: PerResourceTypeEnum.collection,
        resourceId: String(sentinelPerm._id)
      })
    ).toBe(0);

    // 子节点已重挂到根且清除了 apiFileParentId='SYSTEM_ROOT'
    const savedInheritedChild = await MongoDatasetCollection.findById(inheritedChild._id).lean();
    expect(savedInheritedChild?.parentId).toBeNull();
    expect(savedInheritedChild?.apiFileParentId).toBeUndefined();
    // 独立权限哨兵的直接继承子节点改为 inheritPermission=false 保留原物化快照
    expect(savedInheritedChild?.inheritPermission).toBe(false);

    const savedIndependentChild = await MongoDatasetCollection.findById(
      alreadyIndependentChild._id
    ).lean();
    expect(savedIndependentChild?.parentId).toBeNull();
    expect(savedIndependentChild?.apiFileParentId).toBeUndefined();

    const savedNormalChild = await MongoDatasetCollection.findById(normalChild._id).lean();
    expect(savedNormalChild?.parentId).toBeNull();
    expect(savedNormalChild?.apiFileParentId).toBeUndefined();

    // syncAll 回填准确
    expect((await MongoDataset.findById(datasetPerm._id).lean())?.syncAll).toBe(true);
    expect((await MongoDataset.findById(datasetNormal._id).lean())?.syncAll).toBe(true);
    expect((await MongoDataset.findById(datasetPartial._id).lean())?.syncAll).toBe(false);

    // 幂等重跑
    const { context: retryContext } = createMigrationContext();
    const retryResult = await cleanApiDatasetSystemRoot(retryContext);
    expect(retryResult).toEqual({ datasets: 0, sentinels: 0, reparented: 0 });
  });

  it('fails validation when a lingering SYSTEM_ROOT reference remains after cleanup', async () => {
    const { owner } = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'lingering-dataset',
      type: DatasetTypeEnum.apiDataset
    });
    const sentinel = await MongoDatasetCollection.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id,
      name: 'ROOT_FOLDER',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID
    });

    // 模拟在迁移阶段结束后、核验阶段前意外残留一条 SYSTEM_ROOT 记录
    const { context, fail } = createMigrationContext();
    let insertedLingering = false;
    vi.mocked(context.reportProgress).mockImplementation(async (input) => {
      SystemMigrationProgressInputSchema.parse(input);
      if (
        input.key === 'validation' &&
        input.status === SystemMigrationStatusEnum.running &&
        !insertedLingering
      ) {
        insertedLingering = true;
        await MongoDatasetCollection.create({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          datasetId: dataset._id,
          name: 'ROOT_FOLDER_LATE',
          type: DatasetCollectionTypeEnum.folder,
          apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID
        });
      }
    });

    await expect(cleanApiDatasetSystemRoot(context)).rejects.toThrow(
      'Legacy SYSTEM_ROOT references still remain after cleanup'
    );
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({
        failedRecords: expect.arrayContaining([
          expect.objectContaining({
            stageKey: 'validation',
            data: expect.objectContaining({ datasetId: String(dataset._id) })
          })
        ])
      })
    );
    // 初始哨兵本身已被正常清理
    await expect(MongoDatasetCollection.findById(sentinel._id).lean()).resolves.toBeNull();
    // 清理测试遗留记录，避免影响同库其他用例
    await cleanSingleDatasetSystemRoot({ datasetId: String(dataset._id) });
  });

  it('registers as a manual non-blocking migration in systemMigrations', () => {
    const entry = systemMigrations.find((m) => m.id === '20261120_clean_api_dataset_system_root');
    expect(entry).toBeDefined();
    expect(entry?.manual).toBe(true);
    expect(entry?.blockStartup).toBeUndefined();
  });
});
