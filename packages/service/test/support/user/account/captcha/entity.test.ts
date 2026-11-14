import { describe, expect, it } from 'vitest';
import { claimCaptchaAttempt } from '@fastgpt/service/support/user/account/captcha/entity';
import { getDataId, verification } from '@fastgpt/service/support/tmpData/verification';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';

describe('claimCaptchaAttempt', () => {
  it('increments the attempt without extending the image expiration', async () => {
    const challengeId = 'a'.repeat(64);
    const params = { type: 'puzzle' as const, scene: 'register' as const, key: challengeId };
    await verification.upsert({
      ...params,
      data: { angle: 140, scopeKey: 'a@example.com', createdAt: Date.now(), attempts: 0 },
      ttlPreset: 'medium'
    });
    const before = await MongoTmpData.findOne({ dataId: getDataId(params) }).lean();
    expect(await claimCaptchaAttempt({ challengeId, purpose: 'register' })).toMatchObject({
      attempts: 1
    });
    const after = await MongoTmpData.findOne({ dataId: getDataId(params) }).lean();
    expect(after!.expireAt).toEqual(before!.expireAt);
  });

  it('refuses missing, exhausted and expired images', async () => {
    const challengeId = 'b'.repeat(64);
    const params = { type: 'puzzle' as const, scene: 'register' as const, key: challengeId };
    const claim = () => claimCaptchaAttempt({ challengeId, purpose: 'register' });
    expect(await claim()).toBeNull();
    await verification.upsert({
      ...params,
      data: { angle: 140, scopeKey: 'a@example.com', createdAt: Date.now(), attempts: 3 },
      ttlPreset: 'medium'
    });
    expect(await claim()).toBeNull();
    await MongoTmpData.updateOne(
      { dataId: getDataId(params) },
      { $set: { 'data.attempts': 0, expireAt: new Date(Date.now() - 1) } }
    );
    expect(await claim()).toBeNull();
  });
});
