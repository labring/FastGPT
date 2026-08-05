import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
import { VerificationTtlSeconds } from '@fastgpt/global/support/user/account/verification/type';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import {
  getCodeVerificationKey,
  getDataId,
  verification,
  VerificationMaterialError
} from '@fastgpt/service/support/tmpData/verification';

describe('tmp data verification wrapper', () => {
  beforeEach(async () => {
    await MongoTmpData.deleteMany({});
  });

  it('builds a scene and type scoped data id', () => {
    expect(getDataId({ scene: 'register', type: 'code', key: 'user@example.com' })).toBe(
      'verification:v1:register:code:user@example.com'
    );
  });

  it('keeps scene, type, and material fields correlated at compile time', () => {
    if (false) {
      verification.upsert({
        scene: 'register',
        type: 'code',
        key: 'user@example.com',
        // @ts-expect-error password materials are not valid for code storage
        data: { preLoginCode: 'wrong-material' },
        ttlPreset: 'medium'
      });
      // @ts-expect-error login is not a valid scene for code materials
      verification.get({ scene: 'login', type: 'code', key: 'user@example.com' });
      verification.get({
        scene: 'register',
        type: 'code',
        key: 'user@example.com',
        // @ts-expect-error unknown material fields cannot be used in a code match
        match: { cod: 'typo' }
      });
    }

    expect(true).toBe(true);
  });

  it('upserts the complete material and refreshes its expiration', async () => {
    const firstStartedAt = Date.now();

    await verification.upsert({
      scene: 'register',
      type: 'code',
      key: 'user@example.com',
      data: { code: '111111' },
      ttlPreset: 'short'
    });
    const secondStartedAt = Date.now();
    await verification.upsert({
      scene: 'register',
      type: 'code',
      key: 'user@example.com',
      data: { code: '222222' },
      ttlPreset: 'medium'
    });

    const record = await MongoTmpData.findOne({}).lean();
    expect(record).toMatchObject({
      dataId: 'verification:v1:register:code:user@example.com',
      data: { code: '222222' }
    });
    expect(record?.expireAt.getTime()).toBeGreaterThanOrEqual(
      secondStartedAt + VerificationTtlSeconds.medium * 1000
    );
    expect(record?.expireAt.getTime()).toBeLessThanOrEqual(
      Date.now() + VerificationTtlSeconds.medium * 1000
    );
    expect(record?.expireAt.getTime()).toBeGreaterThan(firstStartedAt + 30_000);
  });

  it('keeps independently issued account codes active and consumes only the matched code', async () => {
    const account = 'multi-code@example.com';
    const firstCode = '111111';
    const secondCode = '222222';
    const firstKey = getCodeVerificationKey({ account, code: firstCode });
    const secondKey = getCodeVerificationKey({ account, code: secondCode });

    await expect(
      verification.createIfInactive({
        scene: 'register',
        type: 'code',
        key: firstKey,
        data: { code: firstCode, issueId: 'issue-1' },
        ttlPreset: 'medium'
      })
    ).resolves.toBe(true);
    await expect(
      verification.createIfInactive({
        scene: 'register',
        type: 'code',
        key: firstKey,
        data: { code: firstCode, issueId: 'collision' },
        ttlPreset: 'medium'
      })
    ).resolves.toBe(false);
    await expect(
      verification.createIfInactive({
        scene: 'register',
        type: 'code',
        key: secondKey,
        data: { code: secondCode, issueId: 'issue-2' },
        ttlPreset: 'medium'
      })
    ).resolves.toBe(true);

    await expect(MongoTmpData.countDocuments({})).resolves.toBe(2);
    await verification.consumeInTransaction(
      {
        scene: 'register',
        type: 'code',
        key: firstKey,
        match: { code: firstCode }
      },
      async () => undefined
    );
    await expect(
      verification.get({
        scene: 'register',
        type: 'code',
        key: secondKey,
        match: { code: secondCode }
      })
    ).resolves.toEqual({ code: secondCode, issueId: 'issue-2' });
  });

  it('replaces an expired record when the same account code is issued again', async () => {
    const account = 'expired-code@example.com';
    const code = '111111';
    const key = getCodeVerificationKey({ account, code });
    const dataId = getDataId({ scene: 'register', type: 'code', key });

    await MongoTmpData.create({
      dataId,
      data: { code, issueId: 'expired-issue' },
      expireAt: new Date(Date.now() - 1000)
    });

    await expect(
      verification.createIfInactive({
        scene: 'register',
        type: 'code',
        key,
        data: { code, issueId: 'new-issue' },
        ttlPreset: 'medium'
      })
    ).resolves.toBe(true);
    await expect(MongoTmpData.findOne({ dataId }).lean()).resolves.toMatchObject({
      data: { code, issueId: 'new-issue' },
      expireAt: expect.any(Date)
    });
  });

  it('only reports material that is still active', async () => {
    const key = 'active-status';

    await verification.upsert({
      scene: 'login',
      type: 'wechat',
      key,
      data: null,
      ttlPreset: 'medium'
    });
    await expect(verification.hasActive({ scene: 'login', type: 'wechat', key })).resolves.toBe(
      true
    );

    await MongoTmpData.updateOne(
      { dataId: getDataId({ scene: 'login', type: 'wechat', key }) },
      { $set: { expireAt: new Date(Date.now() - 1000) } }
    );

    await expect(verification.hasActive({ scene: 'login', type: 'wechat', key })).resolves.toBe(
      false
    );
    await expect(
      verification.hasActive({ scene: 'login', type: 'wechat', key: 'missing-status' })
    ).resolves.toBe(false);
  });

  it('updates only an existing material that is still active', async () => {
    const key = 'active-qr';

    await verification.upsert({
      scene: 'login',
      type: 'wechat',
      key,
      data: null,
      ttlPreset: 'long'
    });
    const updateStartedAt = Date.now();
    await verification.updateIfActive({
      scene: 'login',
      type: 'wechat',
      key,
      data: { openId: 'openid-1' },
      ttlPreset: 'medium'
    });

    const record = await MongoTmpData.findOne({}).lean();
    expect(record).toMatchObject({
      dataId: getDataId({ scene: 'login', type: 'wechat', key }),
      data: { openId: 'openid-1' }
    });
    expect(record?.expireAt.getTime()).toBeGreaterThanOrEqual(
      updateStartedAt + VerificationTtlSeconds.medium * 1000
    );
  });

  it('does not create or refresh missing and expired material', async () => {
    const key = 'inactive-qr';

    await verification.updateIfActive({
      scene: 'login',
      type: 'wechat',
      key,
      data: { openId: 'missing-openid' },
      ttlPreset: 'medium'
    });
    await expect(
      MongoTmpData.countDocuments({
        dataId: getDataId({ scene: 'login', type: 'wechat', key })
      })
    ).resolves.toBe(0);

    await verification.upsert({
      scene: 'login',
      type: 'wechat',
      key,
      data: null,
      ttlPreset: 'short'
    });
    const expiredAt = new Date(Date.now() - 1000);
    await MongoTmpData.updateOne(
      { dataId: getDataId({ scene: 'login', type: 'wechat', key }) },
      { $set: { expireAt: expiredAt } }
    );
    await verification.updateIfActive({
      scene: 'login',
      type: 'wechat',
      key,
      data: { openId: 'expired-openid' },
      ttlPreset: 'medium'
    });

    await expect(
      MongoTmpData.findOne({
        dataId: getDataId({ scene: 'login', type: 'wechat', key })
      }).lean()
    ).resolves.toMatchObject({
      data: null,
      expireAt: expiredAt
    });
  });

  it('commits material consumption after a successful transaction callback', async () => {
    const key = 'transaction-success-key';

    await verification.upsert({
      scene: 'login',
      type: 'oauth',
      key,
      data: { provider: 'github', state: 'state-value' },
      ttlPreset: 'medium'
    });

    await expect(
      verification.consumeInTransaction(
        {
          scene: 'login',
          type: 'oauth',
          key,
          match: { state: 'state-value' }
        },
        async ({ material, session }) => {
          expect(material).toEqual({ provider: 'github', state: 'state-value' });
          expect(session).toBeDefined();
          return 'completed';
        }
      )
    ).resolves.toBe('completed');

    await expect(
      MongoTmpData.findOne({
        dataId: getDataId({ scene: 'login', type: 'oauth', key })
      }).lean()
    ).resolves.toBeNull();
  });

  it('rejects expired material that is still waiting for TTL cleanup', async () => {
    const key = 'expired-transaction-material';
    const dataId = getDataId({ scene: 'login', type: 'oauth', key });
    const handler = vi.fn();

    await verification.upsert({
      scene: 'login',
      type: 'oauth',
      key,
      data: { provider: 'github', state: 'expired-state' },
      ttlPreset: 'medium'
    });
    await MongoTmpData.updateOne({ dataId }, { $set: { expireAt: new Date(Date.now() - 1000) } });

    await expect(
      verification.consumeInTransaction(
        {
          scene: 'login',
          type: 'oauth',
          key,
          match: { state: 'expired-state' }
        },
        handler
      )
    ).rejects.toBeInstanceOf(VerificationMaterialError);
    expect(handler).not.toHaveBeenCalled();
    await expect(MongoTmpData.countDocuments({ dataId })).resolves.toBe(1);
  });

  it('rolls back both business writes and material consumption when the callback fails', async () => {
    const materialKey = 'transaction-failure-material';
    const businessKey = 'transaction-failure-business';
    const error = new Error('business operation failed');

    await verification.upsert({
      scene: 'login',
      type: 'oauth',
      key: materialKey,
      data: { provider: 'github', state: 'state-value' },
      ttlPreset: 'medium'
    });
    await verification.upsert({
      scene: 'login',
      type: 'oauth',
      key: businessKey,
      data: { provider: 'initial' },
      ttlPreset: 'medium'
    });

    const handler = vi.fn(async ({ session }: { session: any }) => {
      await MongoTmpData.updateOne(
        { dataId: getDataId({ scene: 'login', type: 'oauth', key: businessKey }) },
        { $set: { 'data.provider': 'changed' } },
        { session }
      );
      throw error;
    });
    await expect(
      verification.consumeInTransaction(
        {
          scene: 'login',
          type: 'oauth',
          key: materialKey,
          match: { state: 'state-value' }
        },
        handler
      )
    ).rejects.toBe(error);
    expect(handler).toHaveBeenCalledTimes(1);

    await expect(
      MongoTmpData.findOne({
        dataId: getDataId({ scene: 'login', type: 'oauth', key: materialKey })
      }).lean()
    ).resolves.toMatchObject({
      data: { provider: 'github', state: 'state-value' }
    });
    await expect(
      MongoTmpData.findOne({
        dataId: getDataId({ scene: 'login', type: 'oauth', key: businessKey })
      }).lean()
    ).resolves.toMatchObject({ data: { provider: 'initial' } });
  });

  it('finds the only active scene from exact data id candidates', async () => {
    const key = 'shared-wechat-key';

    await verification.upsert({
      scene: 'register',
      type: 'wechat',
      key,
      data: null,
      ttlPreset: 'medium'
    });
    await verification.upsert({
      scene: 'login',
      type: 'wechat',
      key,
      data: null,
      ttlPreset: 'short'
    });
    await MongoTmpData.updateOne(
      { dataId: getDataId({ scene: 'login', type: 'wechat', key }) },
      { $set: { expireAt: new Date(Date.now() - 1) } }
    );

    const candidateDataIds = [
      getDataId({ scene: 'register', type: 'wechat', key }),
      getDataId({ scene: 'login', type: 'wechat', key })
    ];
    await expect(verification.findUniqueActiveDataId(candidateDataIds)).resolves.toBe(
      candidateDataIds[0]
    );
    await expect(
      verification.findUniqueActiveDataId([
        getDataId({ scene: 'register', type: 'wechat', key: 'missing-key' }),
        getDataId({ scene: 'login', type: 'wechat', key: 'missing-key' })
      ])
    ).resolves.toBeNull();
  });

  it('rejects conflicting active scenes for the same key', async () => {
    const key = 'conflicting-wechat-key';

    await verification.upsert({
      scene: 'login',
      type: 'wechat',
      key,
      data: null,
      ttlPreset: 'medium'
    });
    await verification.upsert({
      scene: 'register',
      type: 'wechat',
      key,
      data: null,
      ttlPreset: 'medium'
    });

    await expect(
      verification.findUniqueActiveDataId([
        getDataId({ scene: 'login', type: 'wechat', key }),
        getDataId({ scene: 'register', type: 'wechat', key })
      ])
    ).rejects.toThrow('Verification material data id conflict');
  });

  it('deletes material only when the current code matches', async () => {
    await verification.upsert({
      scene: 'register',
      type: 'code',
      key: 'user@example.com',
      data: { code: '111111' },
      ttlPreset: 'medium'
    });

    await verification.deleteIfMatch({
      scene: 'register',
      type: 'code',
      key: 'user@example.com',
      match: { code: '222222' }
    });
    await expect(
      MongoTmpData.countDocuments({
        dataId: getDataId({ scene: 'register', type: 'code', key: 'user@example.com' })
      })
    ).resolves.toBe(1);

    await verification.deleteIfMatch({
      scene: 'register',
      type: 'code',
      key: 'user@example.com',
      match: { code: '111111' }
    });
    await expect(
      MongoTmpData.countDocuments({
        dataId: getDataId({ scene: 'register', type: 'code', key: 'user@example.com' })
      })
    ).resolves.toBe(0);
  });
});
