import { describe, expect, it } from 'vitest';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { bridgeClientSessionToDbSession } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { findAppVersionNodes } from '@fastgpt/service/core/app/version/mongo/entity';

/** 使用隔离的临时 Mongo 副本集验证应用边界和真实事务可见性。 */
describe('AppVersion proxy-source node projection', () => {
  it('filters both app and requested versions, projecting only IDs and nodes', async () => {
    const appId = new Types.ObjectId().toString();
    const otherAppId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const [selected, omitted, other] = await MongoAppVersion.create([
      { appId, tmbId, nodes: [], versionName: 'selected' },
      { appId, tmbId, nodes: [], versionName: 'omitted' },
      { appId: otherAppId, tmbId, nodes: [], versionName: 'other app' }
    ]);
    const result = await findAppVersionNodes({
      appId,
      versionIds: [String(selected._id), String(other._id)]
    });
    expect(result).toEqual([{ _id: String(selected._id), nodes: [] }]);
    expect(result).not.toContainEqual(expect.objectContaining({ _id: String(omitted._id) }));
    expect(await findAppVersionNodes({ appId, versionIds: [] })).toEqual([]);
  });

  it('reads uncommitted nodes through the same DbSession and leaves no row after rollback', async () => {
    const appId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    // 先创建集合，避免事务中的建表与首次访问混淆读取可见性。
    await MongoAppVersion.createCollection();
    const session = await connectionMongo.startSession();
    session.startTransaction();
    try {
      const [version] = await MongoAppVersion.create(
        [{ appId, tmbId, nodes: [], versionName: 'uncommitted' }],
        { session }
      );
      const versionIds = [String(version._id)];
      const tx = bridgeClientSessionToDbSession(session);
      expect(await findAppVersionNodes({ appId, versionIds, tx })).toEqual([
        { _id: String(version._id), nodes: [] }
      ]);
      expect(await findAppVersionNodes({ appId, versionIds })).toEqual([]);
      await session.abortTransaction();
      expect(await findAppVersionNodes({ appId, versionIds })).toEqual([]);
    } finally {
      if (session.inTransaction()) await session.abortTransaction();
      await session.endSession();
    }
  });
});
