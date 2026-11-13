import { beforeEach, describe, expect, it } from 'vitest';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ensureSandboxTeamOwnership } from '@fastgpt/service/core/ai/sandbox/application/ownership';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  assertNoUnmigratedLegacySandbox,
  LEGACY_SANDBOX_V2_COLLECTION_NAME,
  resetLegacyV2EmptyCacheForTest
} from '@fastgpt/service/core/ai/sandbox/legacy/v2MigrationGate';

describe('v2MigrationGate (assertNoUnmigratedLegacySandbox)', () => {
  const getV2Collection = () => {
    const db = connectionMongo.connection.db;
    if (!db) {
      throw new Error('Test MongoDB is not connected');
    }
    return db.collection(LEGACY_SANDBOX_V2_COLLECTION_NAME);
  };

  beforeEach(async () => {
    resetLegacyV2EmptyCacheForTest();
    await getV2Collection().deleteMany({});
  });

  it('allows activation and caches empty state when v2 collection has no active documents', async () => {
    const collection = getV2Collection();

    await expect(
      assertNoUnmigratedLegacySandbox({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-empty',
        userId: 'user-1'
      })
    ).resolves.toBeUndefined();

    // 进程级空表缓存已置位：即便直接往底层 v2 插入记录，未重置缓存前也会零查询短路放行
    await collection.insertOne({
      provider: 'opensandbox',
      sandboxId: 'cached-check-sbx',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-empty',
      userId: 'user-1',
      status: 'stopped'
    });
    await expect(
      assertNoUnmigratedLegacySandbox({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-empty',
        userId: 'user-1'
      })
    ).resolves.toBeUndefined();

    // 重置缓存后立即命中 v2 未迁移门禁
    resetLegacyV2EmptyCacheForTest();
    await expect(
      assertNoUnmigratedLegacySandbox({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-empty',
        userId: 'user-1'
      })
    ).rejects.toThrow(SandboxErrEnum.agentSandboxMigrationInProgress);
  });

  it('rejects activation with agentSandboxMigrationInProgress when v2 has an unmigrated record', async () => {
    const collection = getV2Collection();
    await collection.insertOne({
      provider: 'opensandbox',
      sandboxId: 'legacy-sbx-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-legacy',
      userId: 'user-legacy',
      status: 'stopped'
    });

    await expect(
      assertNoUnmigratedLegacySandbox({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-legacy',
        userId: 'user-legacy'
      })
    ).rejects.toThrow(SandboxErrEnum.agentSandboxMigrationInProgress);

    // 同集合下其他无关用户仍可正常在 v3 创建新沙箱，但此时不能误置位全表空缓存
    await expect(
      assertNoUnmigratedLegacySandbox({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-legacy',
        userId: 'user-fresh'
      })
    ).resolves.toBeUndefined();

    // 再次访问未迁移用户依然受门禁保护
    await expect(
      assertNoUnmigratedLegacySandbox({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-legacy',
        userId: 'user-legacy'
      })
    ).rejects.toThrow(SandboxErrEnum.agentSandboxMigrationInProgress);
  });

  it('ignores v2 records in deleting status and caches empty state if only deleting records remain', async () => {
    const collection = getV2Collection();
    await collection.insertOne({
      provider: 'opensandbox',
      sandboxId: 'legacy-deleting-1',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-deleting',
      userId: ChatSourceTypeEnum.skillEdit,
      status: 'deleting'
    });

    await expect(
      assertNoUnmigratedLegacySandbox({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-deleting'
      })
    ).resolves.toBeUndefined();
  });

  it('blocks ensureSandboxTeamOwnership until record is migrated into v3', async () => {
    const teamId = '000000000000000000000001';
    const tmbId = '000000000000000000000002';
    const appDoc = await MongoApp.create({
      teamId,
      tmbId,
      name: `gate-test-${getNanoid(6)}`,
      type: 'simple',
      modules: []
    });
    const sourceId = String(appDoc._id);
    const userId = `user-${getNanoid(6)}`;
    const sandboxId = `app-${getNanoid(8)}`;

    try {
      await getV2Collection().insertOne({
        provider: 'opensandbox',
        sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId,
        userId,
        status: 'archived'
      });

      // v3 未命中但 v2 存在未迁移记录 -> 拒绝激活
      await expect(
        ensureSandboxTeamOwnership({
          sandboxId,
          sourceType: ChatSourceTypeEnum.app,
          sourceId,
          userId
        })
      ).rejects.toThrow(SandboxErrEnum.agentSandboxMigrationInProgress);

      // 模拟任务 1 将记录迁入 v3（即使 v2 尚未在任务 2 清理）-> 立即放行激活
      await MongoSandboxInstance.create({
        sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId,
        userId,
        teamId,
        status: 'stopped'
      });

      await expect(
        ensureSandboxTeamOwnership({
          sandboxId,
          sourceType: ChatSourceTypeEnum.app,
          sourceId,
          userId
        })
      ).resolves.toMatchObject({
        teamId,
        resource: expect.objectContaining({ sandboxId, status: 'stopped' })
      });
    } finally {
      await MongoSandboxInstance.deleteMany({ sandboxId });
      await MongoApp.deleteOne({ _id: appDoc._id });
    }
  });

  it('fails closed during transient MongoDB reconnection instead of bypassing the migration gate', async () => {
    resetLegacyV2EmptyCacheForTest();
    const conn = connectionMongo.connection as unknown as {
      readyState: number;
      host: string;
    };
    const ownReadyStateDesc = Object.getOwnPropertyDescriptor(
      connectionMongo.connection,
      'readyState'
    );
    const originalHost = conn.host;

    try {
      Object.defineProperty(connectionMongo.connection, 'readyState', {
        configurable: true,
        get: () => 2 // connecting
      });
      conn.host = originalHost || '127.0.0.1';

      await expect(
        assertNoUnmigratedLegacySandbox({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app-reconnecting',
          userId: 'user-1'
        })
      ).rejects.toThrow('MongoDB connection is unavailable');
    } finally {
      if (ownReadyStateDesc) {
        Object.defineProperty(connectionMongo.connection, 'readyState', ownReadyStateDesc);
      } else {
        Reflect.deleteProperty(connectionMongo.connection, 'readyState');
      }
      conn.host = originalHost;
    }
  });
});
