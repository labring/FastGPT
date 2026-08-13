import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { CAPTCHA_VERIFICATION_PURPOSES } from '@fastgpt/global/support/user/account/verification/type';
import { mapLegacyAuthCode } from '../../../scripts/migration/authCodeToTmpData';

const now = new Date('2026-07-31T00:00:00.000Z');
const expireAt = new Date('2026-07-31T00:05:00.000Z');
const getCodeDataId = ({
  scene,
  account,
  code
}: {
  scene: string;
  account: string;
  code: string;
}) =>
  `verification:v1:${scene}:code:${account}:${createHash('sha256')
    .update(code.toLowerCase())
    .digest('hex')}`;

describe('mapLegacyAuthCode', () => {
  it('skips obsolete prelogin materials', () => {
    expect(
      mapLegacyAuthCode(
        {
          key: 'user@example.com',
          type: 'login',
          code: 'Ab12Cd',
          expiredTime: expireAt
        },
        now
      )
    ).toEqual({ kind: 'skipped', reason: 'obsolete-prelogin' });
  });

  it.each([
    ['register', 'register'],
    ['findPassword', 'forgetPassword'],
    ['bindNotification', 'bindNotification']
  ] as const)('maps %s materials to the %s code scene', (legacyType, scene) => {
    expect(
      mapLegacyAuthCode(
        { key: 'account@example.com', type: legacyType, code: '123456', expiredTime: expireAt },
        now
      )
    ).toEqual({
      kind: 'mapped',
      records: [
        {
          dataId: getCodeDataId({ scene, account: 'account@example.com', code: '123456' }),
          data: { code: '123456' },
          expireAt
        }
      ]
    });
  });

  it('hashes WeChat scene keys and maps openid to openId', () => {
    expect(
      mapLegacyAuthCode(
        { key: 'wx-scene', type: 'wxLogin', openid: 'openid-1', expiredTime: expireAt },
        now
      )
    ).toEqual({
      kind: 'mapped',
      records: [
        {
          dataId:
            'verification:v1:login:wechat:fc3413ae75ac6b00f7c1933b7b6457184a9e579e08236b9f5513ab220523dce7',
          data: { openId: 'openid-1' },
          expireAt
        }
      ]
    });
  });

  it('maps legacy captchas to every supported captcha scene', () => {
    expect(
      mapLegacyAuthCode(
        { key: 'account@example.com', type: 'captcha', code: 'AbC123', expiredTime: expireAt },
        now
      )
    ).toEqual({
      kind: 'mapped',
      records: CAPTCHA_VERIFICATION_PURPOSES.map((scene) => ({
        dataId: `verification:v1:${scene}:captcha:account@example.com`,
        data: { code: 'abc123' },
        expireAt
      }))
    });
  });

  it('skips expired records and derives the legacy default expiry when needed', () => {
    expect(
      mapLegacyAuthCode(
        {
          key: 'expired@example.com',
          type: 'register',
          code: '123456',
          expiredTime: new Date('2026-07-30T23:59:59.000Z')
        },
        now
      )
    ).toEqual({ kind: 'skipped', reason: 'expired' });

    expect(
      mapLegacyAuthCode(
        {
          key: 'account@example.com',
          type: 'register',
          code: '123456',
          createTime: new Date('2026-07-30T23:59:00.000Z')
        },
        now
      )
    ).toEqual({
      kind: 'mapped',
      records: [
        expect.objectContaining({
          expireAt: new Date('2026-07-31T00:04:00.000Z')
        })
      ]
    });
  });
});
