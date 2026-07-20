import { beforeEach, describe, expect, it } from 'vitest';
import { addMinutes } from 'date-fns';
import { AccountVerificationMaterialTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';
import {
  consumeVerificationMaterial,
  createVerificationMaterial,
  deleteVerificationMaterialIfMatch,
  findValidVerificationMaterial,
  updateWechatMaterialIdentity,
  upsertVerificationMaterial
} from '@fastgpt/service/support/user/account/verification/entity';
import { MongoAccountVerificationMaterial } from '@fastgpt/service/support/user/account/verification/schema';
import { addAuthCode } from '@fastgpt/service/support/user/auth/controller';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';

describe('verification material entity', () => {
  beforeEach(async () => {
    await MongoAccountVerificationMaterial.deleteMany({});
  });

  it('upserts only the latest material and refreshes its timestamps', async () => {
    const firstCreatedAt = new Date('2026-07-14T00:00:00.000Z');
    const secondCreatedAt = new Date('2026-07-14T00:01:00.000Z');

    await upsertVerificationMaterial({
      key: 'user@example.com',
      type: AccountVerificationMaterialTypeEnum.register,
      code: '111111',
      createTime: firstCreatedAt,
      expiredTime: addMinutes(firstCreatedAt, 5)
    });
    await upsertVerificationMaterial({
      key: 'user@example.com',
      type: AccountVerificationMaterialTypeEnum.register,
      code: '222222',
      createTime: secondCreatedAt,
      expiredTime: addMinutes(secondCreatedAt, 5)
    });

    const records = await MongoAccountVerificationMaterial.find({}).lean();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ code: '222222' });
    expect(records[0].createTime).toEqual(secondCreatedAt);
    expect(records[0].expiredTime).toEqual(addMinutes(secondCreatedAt, 5));
  });

  it('shares one model with the legacy auth controller without dropping binding fields', async () => {
    await addAuthCode({
      key: 'legacy-account',
      type: UserAuthTypeEnum.login,
      code: '123456'
    });

    await createVerificationMaterial({
      key: 'accountCancellation:user-hash',
      type: AccountVerificationMaterialTypeEnum.accountCancellation,
      code: '654321',
      userIdHash: 'user-hash',
      purpose: 'accountCancellation',
      provider: 'github',
      callbackHash: 'callback-hash',
      expiredTime: addMinutes(new Date(), 5)
    });

    await expect(
      MongoAccountVerificationMaterial.findOne({
        key: 'accountCancellation:user-hash',
        type: AccountVerificationMaterialTypeEnum.accountCancellation
      }).lean()
    ).resolves.toMatchObject({
      userIdHash: 'user-hash',
      purpose: 'accountCancellation',
      provider: 'github',
      callbackHash: 'callback-hash'
    });
  });

  it('rejects material at and after the expiration boundary', async () => {
    const expiredTime = new Date('2026-07-14T00:05:00.000Z');
    await upsertVerificationMaterial({
      key: 'account',
      type: AccountVerificationMaterialTypeEnum.findPassword,
      code: '123456',
      expiredTime
    });

    await expect(
      findValidVerificationMaterial({
        key: 'account',
        type: AccountVerificationMaterialTypeEnum.findPassword,
        code: '123456',
        now: new Date(expiredTime.getTime() - 1)
      })
    ).resolves.toBeTruthy();
    await expect(
      findValidVerificationMaterial({
        key: 'account',
        type: AccountVerificationMaterialTypeEnum.findPassword,
        code: '123456',
        now: expiredTime
      })
    ).resolves.toBeNull();
  });

  it('allows only one concurrent consumer', async () => {
    await upsertVerificationMaterial({
      key: 'account',
      type: AccountVerificationMaterialTypeEnum.login,
      code: '123456',
      expiredTime: addMinutes(new Date(), 1)
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        consumeVerificationMaterial({
          key: 'account',
          type: AccountVerificationMaterialTypeEnum.login,
          code: '123456'
        })
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('matches case-insensitive codes literally without regex injection', async () => {
    await MongoAccountVerificationMaterial.create({
      key: 'account',
      type: AccountVerificationMaterialTypeEnum.captcha,
      code: 'A.[B]C',
      createTime: new Date(),
      expiredTime: addMinutes(new Date(), 1)
    });

    await expect(
      consumeVerificationMaterial({
        key: 'account',
        type: AccountVerificationMaterialTypeEnum.captcha,
        code: 'a.[b]c',
        caseInsensitiveCode: true
      })
    ).resolves.toBeTruthy();
  });

  it('updates only a valid empty WeChat placeholder', async () => {
    const [placeholder] = await createVerificationMaterial({
      key: 'wechat-scene',
      type: AccountVerificationMaterialTypeEnum.wxLogin,
      expiredTime: addMinutes(new Date(), 1)
    });

    await expect(
      updateWechatMaterialIdentity({ key: 'wechat-scene', openid: 'openid' })
    ).resolves.toMatchObject({ openid: 'openid' });
    await expect(
      updateWechatMaterialIdentity({ key: 'wechat-scene', openid: 'other-openid' })
    ).resolves.toBeNull();

    await MongoAccountVerificationMaterial.updateOne(
      { _id: placeholder._id },
      { expiredTime: new Date(0), $unset: { openid: 1 } }
    );
    await expect(
      updateWechatMaterialIdentity({ key: 'wechat-scene', openid: 'late-openid' })
    ).resolves.toBeNull();
  });

  it('conditionally deletes only the material from the failed attempt', async () => {
    await upsertVerificationMaterial({
      key: 'account',
      type: AccountVerificationMaterialTypeEnum.register,
      code: '222222',
      expiredTime: addMinutes(new Date(), 1)
    });

    await deleteVerificationMaterialIfMatch({
      key: 'account',
      type: AccountVerificationMaterialTypeEnum.register,
      code: '111111'
    });
    await expect(MongoAccountVerificationMaterial.countDocuments({})).resolves.toBe(1);

    await deleteVerificationMaterialIfMatch({
      key: 'account',
      type: AccountVerificationMaterialTypeEnum.register,
      code: '222222'
    });
    await expect(MongoAccountVerificationMaterial.countDocuments({})).resolves.toBe(0);
  });
});
