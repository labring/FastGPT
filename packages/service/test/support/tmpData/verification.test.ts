import { addMinutes } from 'date-fns';
import { beforeEach, describe, expect, it } from 'vitest';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { getDataId, verification } from '@fastgpt/service/support/tmpData/verification';

describe('tmp data verification wrapper', () => {
  beforeEach(async () => {
    await MongoTmpData.deleteMany({});
  });

  it('builds a scene and type scoped data id', () => {
    expect(getDataId('login', 'code', 'user@example.com')).toBe(
      'verification:v1:login:code:user@example.com'
    );
  });

  it('upserts the complete material and refreshes its expiration', async () => {
    const firstExpiredAt = addMinutes(new Date(), 1);
    const secondExpiredAt = addMinutes(new Date(), 2);

    await verification.upsert(
      'register',
      'code',
      'user@example.com',
      { code: '111111' },
      firstExpiredAt
    );
    await verification.upsert(
      'register',
      'code',
      'user@example.com',
      { code: '222222' },
      secondExpiredAt
    );

    await expect(MongoTmpData.find({}).lean()).resolves.toMatchObject([
      {
        dataId: 'verification:v1:register:code:user@example.com',
        data: { code: '222222' },
        expireAt: secondExpiredAt
      }
    ]);
  });

  it('consumes valid material once and ignores expired material', async () => {
    await verification.upsert(
      'login',
      'oauth',
      'temporary-key',
      { provider: 'github' },
      addMinutes(new Date(), 1)
    );

    await expect(
      verification.consume<{ provider: string }>('login', 'oauth', 'temporary-key')
    ).resolves.toEqual({
      provider: 'github'
    });
    await expect(verification.consume('login', 'oauth', 'temporary-key')).resolves.toBeNull();

    await verification.upsert(
      'login',
      'password',
      'expired-key',
      { password: 'secret' },
      new Date(Date.now() - 1)
    );

    await expect(verification.consume('login', 'password', 'expired-key')).resolves.toBeNull();
    await expect(
      MongoTmpData.countDocuments({ dataId: getDataId('login', 'password', 'expired-key') })
    ).resolves.toBe(1);
  });

  it('does not consume material when nested verification fields do not match', async () => {
    await verification.upsert(
      'login',
      'oauth',
      'state-hash',
      { state: 'state-value', transactionId: 'transaction-a' },
      addMinutes(new Date(), 1)
    );

    await expect(
      verification.consume('login', 'oauth', 'state-hash', {
        state: 'state-value',
        transactionId: 'transaction-b'
      })
    ).resolves.toBeNull();

    await expect(
      verification.consume('login', 'oauth', 'state-hash', {
        state: 'state-value',
        transactionId: 'transaction-a'
      })
    ).resolves.toEqual({ state: 'state-value', transactionId: 'transaction-a' });
  });

  it('deletes material only when the current code matches', async () => {
    const expiredAt = addMinutes(new Date(), 1);
    await verification.upsert(
      'register',
      'code',
      'user@example.com',
      { code: '111111' },
      expiredAt
    );

    await verification.deleteIfMatch('register', 'code', 'user@example.com', { code: '222222' });
    await expect(
      MongoTmpData.countDocuments({ dataId: getDataId('register', 'code', 'user@example.com') })
    ).resolves.toBe(1);

    await verification.deleteIfMatch('register', 'code', 'user@example.com', { code: '111111' });
    await expect(
      MongoTmpData.countDocuments({ dataId: getDataId('register', 'code', 'user@example.com') })
    ).resolves.toBe(0);
  });

  it('keeps unread QR material and consumes it after an openId is written', async () => {
    const expiredAt = addMinutes(new Date(), 1);
    const key = 'scene-hash';

    await verification.upsert('login', 'wechat', key, null, expiredAt);
    await expect(verification.getAndDelete('login', 'wechat', key)).resolves.toBeUndefined();
    await expect(
      MongoTmpData.countDocuments({ dataId: getDataId('login', 'wechat', key) })
    ).resolves.toBe(1);

    await verification.upsert('login', 'wechat', key, { openId: 'openid-1' }, expiredAt);
    await expect(
      verification.getAndDelete<{ openId: string }>('login', 'wechat', key)
    ).resolves.toEqual({ openId: 'openid-1' });
    await expect(verification.getAndDelete('login', 'wechat', key)).resolves.toBeNull();
  });

  it('returns null for an expired QR material without deleting it', async () => {
    const key = 'expired-scene-hash';

    await verification.upsert('login', 'wechat', key, null, new Date(Date.now() - 1));

    await expect(verification.getAndDelete('login', 'wechat', key)).resolves.toBeNull();
    await expect(
      MongoTmpData.countDocuments({ dataId: getDataId('login', 'wechat', key) })
    ).resolves.toBe(1);
  });
});
