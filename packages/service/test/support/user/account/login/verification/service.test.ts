import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import {
  getCodeVerificationKey,
  getDataId,
  verification
} from '@fastgpt/service/support/tmpData/verification';
import {
  consumeLoginVerification,
  createLoginChallenge,
  isLoginContactUsername
} from '@fastgpt/service/support/user/account/login/verification/service';

const mocks = vi.hoisted(() => ({
  withUserLock: vi.fn(async (_userId: string, handler: () => Promise<unknown>) => handler()),
  assertCodeVerificationConsumeRateLimit: vi.fn(async () => undefined)
}));

vi.mock('@fastgpt/service/support/user/lock', () => ({
  withUserLock: mocks.withUserLock
}));
vi.mock('@fastgpt/service/common/rateLimit/interface/accountVerification', () => ({
  assertCodeVerificationConsumeRateLimit: mocks.assertCodeVerificationConsumeRateLimit
}));

/** 开关由 Pro 写入共享系统配置，登录链路直接查库，这里写同一份数据模拟开启、关闭和缺失。 */
const setLogin2faEnabled = async (enabled?: boolean) => {
  await MongoSystemConfigs.deleteMany({ type: SystemConfigsTypeEnum.fastgpt });
  if (enabled === undefined) return;

  await MongoSystemConfigs.create({
    type: SystemConfigsTypeEnum.fastgpt,
    value: { feConfigs: { login2faEnabled: enabled } }
  });
};

describe('login verification service', () => {
  beforeEach(async () => {
    await setLogin2faEnabled(true);
    vi.clearAllMocks();
    await MongoTmpData.deleteMany({});
  });

  afterEach(async () => {
    await setLogin2faEnabled();
  });

  it('recognizes only email and phone login identifiers', () => {
    expect(isLoginContactUsername('user@example.com')).toBe(true);
    expect(isLoginContactUsername('13800138000')).toBe(true);
    expect(isLoginContactUsername('root')).toBe(false);
  });

  it('stores only the Challenge digest and returns the plaintext once', async () => {
    const result = await createLoginChallenge({
      userId: 'user-id',
      username: 'user@example.com',
      channel: 'email',
      target: 'user@example.com',
      language: 'zh-CN'
    });
    const challengeHash = hashStr(result.challenge);
    const record = await MongoTmpData.findOne({
      dataId: getDataId({ scene: 'login', type: 'loginChallenge', key: challengeHash })
    }).lean();

    expect(result).toMatchObject({
      status: 'verificationRequired',
      method: 'code',
      channel: 'email',
      maskedTarget: 'us***@example.com'
    });
    expect(result.challenge).toHaveLength(43);
    expect(record).toMatchObject({
      data: {
        userId: 'user-id',
        username: 'user@example.com',
        target: 'user@example.com'
      }
    });
    expect(record?.data).not.toHaveProperty('challenge');
  });

  it('consumes the Challenge and matching code together', async () => {
    const challenge = await createLoginChallenge({
      userId: 'user-id',
      username: 'user@example.com',
      channel: 'email',
      target: 'user@example.com',
      language: 'zh-CN'
    });
    const code = '123456';
    const challengeHash = hashStr(challenge.challenge);
    await verification.upsert({
      scene: 'login',
      type: 'code',
      key: getCodeVerificationKey({ account: challengeHash, code }),
      data: { code, issueId: 'issue-id' },
      ttlPreset: 'medium'
    });

    const handler = vi.fn(async ({ challenge: material }: { challenge: { userId: string } }) => {
      expect(material.userId).toBe('user-id');
      return { loggedIn: true };
    });

    await expect(
      consumeLoginVerification({ challenge: challenge.challenge, code }, handler)
    ).resolves.toEqual({ loggedIn: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.withUserLock).toHaveBeenCalledWith('user-id', expect.any(Function));
    expect(mocks.assertCodeVerificationConsumeRateLimit).toHaveBeenCalledWith({
      account: 'user@example.com',
      scene: 'login'
    });
    await expect(MongoTmpData.countDocuments({})).resolves.toBe(0);
  });

  it('does not consume the Challenge when the code is wrong', async () => {
    const challenge = await createLoginChallenge({
      userId: 'user-id',
      username: 'user@example.com',
      channel: 'email',
      target: 'user@example.com',
      language: 'zh-CN'
    });
    const validCode = '123456';
    const challengeHash = hashStr(challenge.challenge);
    await verification.upsert({
      scene: 'login',
      type: 'code',
      key: getCodeVerificationKey({ account: challengeHash, code: validCode }),
      data: { code: validCode, issueId: 'issue-id' },
      ttlPreset: 'medium'
    });

    await expect(
      consumeLoginVerification({ challenge: challenge.challenge, code: '654321' }, vi.fn())
    ).rejects.toMatchObject({ message: expect.any(String) });
    await expect(MongoTmpData.countDocuments({})).resolves.toBe(2);
  });

  it('rejects Challenge verification when the feature is disabled', async () => {
    await setLogin2faEnabled(false);

    await expect(
      consumeLoginVerification({ challenge: 'disabled-challenge', code: '123456' }, vi.fn())
    ).rejects.toThrow('Login two-factor verification is disabled');
    expect(mocks.withUserLock).not.toHaveBeenCalled();

    // 开源版没有 Pro 下发配置，开关缺失时同样保持关闭
    await setLogin2faEnabled();
    await expect(
      consumeLoginVerification({ challenge: 'disabled-challenge', code: '123456' }, vi.fn())
    ).rejects.toThrow('Login two-factor verification is disabled');
  });
});
