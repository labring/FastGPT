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
  createLoginVerificationCaptcha,
  sendLoginVerificationCode,
  isLoginContactUsername,
  isLoginVerificationEnabled
} from '@fastgpt/service/support/user/account/login/verification/service';

const mocks = vi.hoisted(() => ({
  withUserLock: vi.fn(async (_userId: string, handler: () => Promise<unknown>) => handler()),
  assertCodeVerificationConsumeRateLimit: vi.fn(async () => undefined),
  getProConfig: vi.fn(),
  postToPro: vi.fn(),
  proUrl: 'http://127.0.0.1:3001/api'
}));

vi.mock('@fastgpt/service/common/system/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/constants')>()),
  get FastGPTProUrl() {
    return mocks.proUrl;
  }
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPro/plusRequest', () => ({
  GET: mocks.getProConfig,
  POST: mocks.postToPro
}));
vi.mock('@fastgpt/service/support/user/lock', () => ({
  withUserLock: mocks.withUserLock
}));
vi.mock('@fastgpt/service/common/rateLimit/interface/accountVerification', () => ({
  assertCodeVerificationConsumeRateLimit: mocks.assertCodeVerificationConsumeRateLimit
}));

/** 旧库值只用于验证已退役的开关不能覆盖 Pro 当前配置。 */
const setLegacyLogin2faEnabled = async (enabled?: boolean) => {
  await MongoSystemConfigs.deleteMany({ type: SystemConfigsTypeEnum.fastgpt });
  if (enabled === undefined) return;

  await MongoSystemConfigs.create({
    type: SystemConfigsTypeEnum.fastgpt,
    value: { feConfigs: { login2faEnabled: enabled } }
  });
};

describe('login verification service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.proUrl = 'http://127.0.0.1:3001/api';
    mocks.getProConfig.mockReset().mockResolvedValue({ enabled: true });
    mocks.postToPro.mockReset();
    await setLegacyLogin2faEnabled(false);
    await MongoTmpData.deleteMany({});
  });

  afterEach(async () => {
    await setLegacyLogin2faEnabled();
  });

  it('uses the current Pro flag even when the legacy DB flag says the opposite', async () => {
    await expect(isLoginVerificationEnabled()).resolves.toBe(true);
    await setLegacyLogin2faEnabled(true);
    mocks.getProConfig.mockResolvedValue({ enabled: false });

    await expect(isLoginVerificationEnabled()).resolves.toBe(false);
    expect(mocks.getProConfig).toHaveBeenCalledWith(
      '/support/user/account/login/verification/config'
    );
  });

  it('keeps community edition disabled without making a Pro request', async () => {
    mocks.proUrl = '';
    await setLegacyLogin2faEnabled(true);

    await expect(isLoginVerificationEnabled()).resolves.toBe(false);
    expect(mocks.getProConfig).not.toHaveBeenCalled();
  });

  it('fails closed when Pro is unreachable or returns an invalid flag', async () => {
    const internalError = Object.assign(new Error('Pro unavailable'), {
      config: { headers: { 'x-fastgpt-pro-token': 'synthetic-private-pro-token' } }
    });
    mocks.getProConfig.mockRejectedValueOnce(internalError);
    const error = await isLoginVerificationEnabled().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty('message', 'Login verification configuration is unavailable');
    expect(error).not.toBe(internalError);
    expect(error).not.toHaveProperty('config');
    expect(error).not.toHaveProperty('cause');

    mocks.getProConfig.mockResolvedValueOnce({ enabled: 'true' });
    await expect(isLoginVerificationEnabled()).rejects.toThrow(
      'Login verification configuration is unavailable'
    );
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
    mocks.getProConfig.mockResolvedValue({ enabled: false });

    await expect(
      consumeLoginVerification({ challenge: 'disabled-challenge', code: '123456' }, vi.fn())
    ).rejects.toThrow('Login two-factor verification is disabled');
    expect(mocks.withUserLock).not.toHaveBeenCalled();

    // 开源版未接入 Pro 时同样保持关闭
    mocks.proUrl = '';
    await expect(
      consumeLoginVerification({ challenge: 'disabled-challenge', code: '123456' }, vi.fn())
    ).rejects.toThrow('Login two-factor verification is disabled');
  });

  it('rechecks the Pro flag before captcha, send and consume', async () => {
    mocks.getProConfig.mockResolvedValue({ enabled: false });
    await expect(createLoginVerificationCaptcha({ challenge: 'disabled' })).rejects.toThrow(
      'Login two-factor verification is disabled'
    );
    await expect(
      sendLoginVerificationCode({ challenge: 'disabled', captcha: '1234' })
    ).rejects.toThrow('Login two-factor verification is disabled');
    await expect(
      consumeLoginVerification({ challenge: 'disabled', code: '123456' }, vi.fn())
    ).rejects.toThrow('Login two-factor verification is disabled');
    expect(mocks.getProConfig).toHaveBeenCalledTimes(3);
    expect(mocks.postToPro).not.toHaveBeenCalled();

    mocks.getProConfig.mockRejectedValue(new Error('Pro unavailable'));
    await expect(createLoginVerificationCaptcha({ challenge: 'disabled' })).rejects.toThrow(
      'Login verification configuration is unavailable'
    );
    await expect(
      sendLoginVerificationCode({ challenge: 'disabled', captcha: '1234' })
    ).rejects.toThrow('Login verification configuration is unavailable');
    await expect(
      consumeLoginVerification({ challenge: 'disabled', code: '123456' }, vi.fn())
    ).rejects.toThrow('Login verification configuration is unavailable');
    expect(mocks.postToPro).not.toHaveBeenCalled();
  });

  it('checks Pro before forwarding captcha and sendCode for an existing challenge', async () => {
    const challenge = await createLoginChallenge({
      userId: 'user-id',
      username: 'user@example.com',
      channel: 'email',
      target: 'user@example.com',
      language: 'zh-CN'
    });
    mocks.postToPro.mockResolvedValueOnce({ captchaImage: 'data:image/png;base64,test' });
    mocks.postToPro.mockResolvedValueOnce({ message: 'sent' });

    await expect(
      createLoginVerificationCaptcha({ challenge: challenge.challenge })
    ).resolves.toEqual({
      captchaImage: 'data:image/png;base64,test'
    });
    await expect(
      sendLoginVerificationCode({ challenge: challenge.challenge, captcha: '1234' })
    ).resolves.toEqual({ message: 'sent' });
    expect(mocks.getProConfig).toHaveBeenCalledTimes(2);
    expect(mocks.postToPro).toHaveBeenNthCalledWith(
      1,
      '/support/user/account/login/verification/captcha',
      { challengeHash: hashStr(challenge.challenge) }
    );
    expect(mocks.postToPro).toHaveBeenNthCalledWith(
      2,
      '/support/user/account/login/verification/sendCode',
      expect.objectContaining({ challengeHash: hashStr(challenge.challenge), channel: 'email' })
    );
  });
});
