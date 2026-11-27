import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { closeDbRuntime, getDbRuntime } from '@fastgpt/dal/db/runtime';
import { createMockOceanBaseKysely } from '@fastgpt/dal/db/testing';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import { Types } from '@fastgpt/service/common/mongo';
import { configureDalRuntime } from '@fastgpt/service/common/db/dalRuntime';
import { AppRegistrationService } from '@fastgpt/service/support/appRegistration/service';

// 验证真实 MongoDB 事务与伴生 Mongo Runtime 协同，取消全局 sessionRun mock。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const { bridgeClientSessionToDbSession, mongoSessionRun } =
  await import('@fastgpt/service/common/mongo/sessionRun');
const { applyApiDatasetSyncAll, cleanDatasetLegacySystemRootInSession } =
  await import('@fastgpt/service/core/dataset/apiDataset/service');
const { applyCollectionPermissionStates } =
  await import('@fastgpt/service/core/dataset/apiDataset/permission/writer');
const { LEGACY_SYSTEM_ROOT_API_FILE_ID } =
  await import('@fastgpt/service/core/dataset/apiDataset/utils');
const { MongoDataset } = await import('@fastgpt/service/core/dataset/schema');
const { MongoDatasetCollection } = await import('@fastgpt/service/core/dataset/collection/schema');
const { MongoResourcePermission } = await import('@fastgpt/service/support/permission/schema');

describe('OceanBase mixed-mode compatibility for Mongo-only API dataset repositories', () => {
  afterEach(async () => {
    await closeDbRuntime();
    configureDalRuntime({ dialect: 'mongo' });
  });

  it('keeps API dataset syncAll, legacy SYSTEM_ROOT cleanup, and permission writes working on Mongo while routing dual-engine repos to OceanBase', async () => {
    await closeDbRuntime();

    const mockOb = createMockOceanBaseKysely((query) =>
      query.sql.toLowerCase().startsWith('select')
        ? { rows: [] }
        : { rows: [], numAffectedRows: BigInt(1) }
    );
    const oceanBaseTxSpy = vi.fn(async ({ execute }) => execute(mockOb.db));
    configureDalRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      transactionRunner: oceanBaseTxSpy
    });

    expect(getDbRuntime().dialect).toBe('oceanbase');
    expect(getDbRuntime('mongo').dialect).toBe('mongo');

    const teamId = String(new Types.ObjectId());
    const tmbId = String(new Types.ObjectId());
    const readerTmbId = String(new Types.ObjectId());
    const datasetId = String(new Types.ObjectId());
    const pausedFolderId = String(new Types.ObjectId());
    const sentinelId = String(new Types.ObjectId());
    const childFileId = String(new Types.ObjectId());
    const apiDatasetServer = {
      apiServer: { baseUrl: 'https://example.com' },
      permissionSync: true
    };

    await MongoDataset.create({
      _id: datasetId,
      teamId,
      tmbId,
      name: 'mixed-mode-api-dataset',
      type: DatasetTypeEnum.apiDataset,
      syncAll: false,
      collectionPermissionEnabled: true,
      apiDatasetServer
    });
    await MongoDatasetCollection.create([
      {
        _id: pausedFolderId,
        teamId,
        datasetId,
        tmbId,
        name: 'paused-folder',
        type: DatasetCollectionTypeEnum.folder,
        apiFileId: 'folder-1',
        syncChildren: false,
        inheritPermission: true
      },
      {
        _id: sentinelId,
        teamId,
        datasetId,
        tmbId,
        name: 'SYSTEM_ROOT',
        type: DatasetCollectionTypeEnum.folder,
        apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID,
        inheritPermission: true
      },
      {
        _id: childFileId,
        teamId,
        datasetId,
        tmbId,
        parentId: sentinelId,
        name: 'child-file',
        type: DatasetCollectionTypeEnum.apiFile,
        apiFileId: 'file-1',
        apiFileParentId: LEGACY_SYSTEM_ROOT_API_FILE_ID,
        inheritPermission: true
      }
    ]);
    await MongoResourcePermission.create({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: sentinelId,
      tmbId,
      permission: OwnerRoleVal
    });

    // 1. 模拟 dataset/update.ts：外层 mongoSessionRun + bridgeClientSessionToDbSession 开启 syncAll
    await mongoSessionRun(async (session) => {
      await applyApiDatasetSyncAll({
        teamId,
        datasetId,
        tx: bridgeClientSessionToDbSession(session),
        updateDataset: true
      });
    });

    expect((await MongoDataset.findById(datasetId).lean())?.syncAll).toBe(true);
    expect((await MongoDatasetCollection.findById(pausedFolderId).lean())?.syncChildren).toBe(true);

    // 2. 模拟 20261120_clean_api_dataset_system_root：清理历史 SYSTEM_ROOT 并回填 syncAll
    await MongoDataset.updateOne({ _id: datasetId }, { $set: { syncAll: false } });
    const cleanup = await mongoSessionRun((session) =>
      cleanDatasetLegacySystemRootInSession({
        datasetId,
        tx: bridgeClientSessionToDbSession(session),
        backfillSyncAll: true
      })
    );

    expect(cleanup).toEqual({ sentinels: 1, reparented: 1 });
    expect((await MongoDataset.findById(datasetId).lean())?.syncAll).toBe(true);
    expect(await MongoDatasetCollection.findById(sentinelId).lean()).toBeNull();
    const reparentedChild = await MongoDatasetCollection.findById(childFileId).lean();
    expect(reparentedChild?.parentId).toBeNull();
    expect(reparentedChild?.apiFileParentId).toBeUndefined();
    expect(
      await MongoResourcePermission.countDocuments({
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: sentinelId
      })
    ).toBe(0);

    // 3. 自建事务路径：applyApiDatasetSyncAll（无外部 tx）与 applyCollectionPermissionStates 均自动走 Mongo 事务
    await MongoDatasetCollection.updateOne(
      { _id: pausedFolderId },
      { $set: { syncChildren: false } }
    );
    await applyApiDatasetSyncAll({ teamId, datasetId });
    expect((await MongoDatasetCollection.findById(pausedFolderId).lean())?.syncChildren).toBe(true);

    const permissionResult = await applyCollectionPermissionStates({
      teamId,
      datasetId,
      states: [
        {
          collectionId: childFileId,
          type: DatasetCollectionTypeEnum.apiFile,
          parentId: null,
          collaborators: [
            { tmbId, permission: OwnerRoleVal },
            { tmbId: readerTmbId, permission: ReadRoleVal }
          ],
          currentCollaborators: [],
          isIndependent: false,
          changed: true
        }
      ],
      expectedApiDatasetServer: apiDatasetServer
    });
    expect(permissionResult).toEqual({ updated: 1 });
    expect((await MongoDatasetCollection.findById(childFileId).lean())?.inheritPermission).toBe(
      false
    );
    expect(
      await MongoResourcePermission.countDocuments({
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: childFileId,
        tmbId: readerTmbId,
        permission: ReadRoleVal
      })
    ).toBe(1);

    // 4. 全程未触发 OceanBase 事务，而双引擎服务（AppRegistration）与默认事务仍严格走 OceanBase
    expect(oceanBaseTxSpy).not.toHaveBeenCalled();
    expect(mockOb.queries).toHaveLength(0);

    const defaultTxDialect = await runInTransaction(async (tx) => tx.dialect);
    expect(defaultTxDialect).toBe('oceanbase');
    expect(oceanBaseTxSpy).toHaveBeenCalledTimes(1);

    const appRegService = new AppRegistrationService();
    const registered = await appRegService.registerApp({
      teamId,
      tmbId,
      appId: String(new Types.ObjectId())
    });
    expect(registered.teamId).toBe(teamId);
    expect(oceanBaseTxSpy).toHaveBeenCalledTimes(2);
    expect(mockOb.queries.some((q) => q.sql.includes('app_registrations'))).toBe(true);
  });
});
