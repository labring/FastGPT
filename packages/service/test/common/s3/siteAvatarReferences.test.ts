import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSiteAvatarState } from '@fastgpt/service/common/s3/models/siteAvatarState';
import {
  markSiteAvatarDeletionPending,
  reserveSiteAvatarReferences
} from '@fastgpt/service/common/s3/siteAvatarReferences';

// setup 默认把 mongoSessionRun 换成无事务执行；这里恢复真实 replica-set 事务，
// 验证状态写入确实透传 session 并能随调用方事务回滚。
beforeAll(async () => {
  const { mongoSessionRun: actualMongoSessionRun } = await vi.importActual<
    typeof import('@fastgpt/service/common/mongo/sessionRun')
  >('@fastgpt/service/common/mongo/sessionRun');
  vi.mocked(mongoSessionRun).mockImplementation(actualMongoSessionRun);
});

describe('site avatar coordination state sessions', () => {
  afterEach(async () => {
    await MongoSiteAvatarState.deleteMany({});
  });

  it('rolls back a pending state written with the caller transaction session', async () => {
    const avatarKey = 'avatar/team-1/session-pending.png';

    await expect(
      mongoSessionRun(async (session) => {
        await markSiteAvatarDeletionPending({ avatarKey, session });
        throw new Error('abort pending transaction');
      })
    ).rejects.toThrow('abort pending transaction');

    expect(await MongoSiteAvatarState.findOne({ avatarKey })).toBeNull();
  });

  it('rolls back a reference reservation written with the caller transaction session', async () => {
    const avatarKey = 'avatar/team-1/session-reserved.png';

    await expect(
      mongoSessionRun(async (session) => {
        await reserveSiteAvatarReferences({
          avatarKeys: [avatarKey],
          siteRevision: 1,
          session
        });
        throw new Error('abort reservation transaction');
      })
    ).rejects.toThrow('abort reservation transaction');

    expect(await MongoSiteAvatarState.findOne({ avatarKey })).toBeNull();
  });
});
