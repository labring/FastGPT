import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verification } from '@fastgpt/service/support/tmpData/verification';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { puzzleCaptchaFixture } from '@test/datas/captcha';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  requiresCaptcha: vi.fn(),
  recordFailure: vi.fn(),
  credentials: vi.fn(),
  enabled: vi.fn(),
  resolve: vi.fn(),
  createChallenge: vi.fn(),
  finish: vi.fn(),
  createPuzzle: vi.fn()
}));
vi.mock('@fastgpt/service/support/user/account/login/risk/service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@fastgpt/service/support/user/account/login/risk/service')
  >()),
  loginRiskService: { requiresCaptcha: mocks.requiresCaptcha, recordFailure: mocks.recordFailure }
}));
vi.mock('@fastgpt/service/support/user/account/verification/password/service', () => ({
  passwordVerificationService: { withVerifiedCredentials: mocks.credentials }
}));
vi.mock(
  '@fastgpt/service/support/user/account/login/verification/service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@fastgpt/service/support/user/account/login/verification/service')
    >()),
    isLoginVerificationEnabled: mocks.enabled,
    resolveLoginVerification: mocks.resolve,
    createLoginChallenge: mocks.createChallenge
  })
);
vi.mock('@fastgpt/service/support/user/account/captcha/service', () => ({
  puzzleCaptchaService: { create: mocks.createPuzzle }
}));
vi.mock('@fastgpt/service/support/user/account/login/service', () => ({
  assertPasswordLoginUser: vi.fn(),
  completePasswordLogin: vi.fn(async () => ({ user: {}, token: 'token' })),
  finishPasswordLogin: mocks.finish
}));
const api = (await import('@/pages/api/support/user/account/loginByPassword')).default;
const body = {
  username: 'alice@example.com',
  password: 'hashed',
  code: 'prelogin',
  language: 'en'
};
const call = (props = {}) =>
  Call(api, { headers: { 'user-agent': 'Mozilla/5.0' }, body: { ...body, ...props } });
const proof = 'b'.repeat(64);
const storeProof = (username = body.username) =>
  verification.upsert({
    type: 'captcha',
    scene: 'login',
    key: `password-login:${username}`,
    data: { code: proof },
    ttlPreset: 'short'
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockResolvedValue(false);
  mocks.requiresCaptcha.mockResolvedValue(false);
  mocks.recordFailure.mockResolvedValue(undefined);
  mocks.createPuzzle.mockResolvedValue(puzzleCaptchaFixture);
  mocks.credentials.mockImplementation(async (_params, handler) =>
    handler({ user: { _id: 'user', username: body.username } })
  );
  mocks.finish.mockResolvedValue({
    user: {
      _id: '68ad85a7463006c963799a01',
      username: body.username,
      timezone: 'Asia/Shanghai',
      hasPassword: true,
      status: 'active',
      permission: {},
      team: {
        userId: '68ad85a7463006c963799a01',
        teamId: '68ad85a7463006c963799a02',
        tmbId: '68ad85a7463006c963799a03',
        teamName: 'Team',
        memberName: 'Alice',
        status: 'active',
        permission: {}
      }
    },
    token: 'token'
  });
});

describe('password login risk gate', () => {
  it('allows low-risk login and returns a puzzle before checking a high-risk password', async () => {
    expect((await call()).data.token).toBe('token');
    mocks.credentials.mockClear();
    mocks.requiresCaptcha.mockResolvedValue(true);
    expect((await call()).data).toEqual({
      status: 'captchaRequired',
      captcha: puzzleCaptchaFixture
    });
    expect(mocks.credentials).not.toHaveBeenCalled();
    expect(mocks.createPuzzle).toHaveBeenCalledWith({
      username: body.username,
      purpose: 'login',
      scopeKey: `password-login:${body.username}`
    });
    expect(mocks.finish).toHaveBeenCalledTimes(1);
  });

  it('consumes a valid scoped proof once, including on wrong passwords', async () => {
    mocks.requiresCaptcha.mockResolvedValue(true);
    await storeProof();
    expect((await call({ captcha: proof })).data.token).toBe('token');
    expect((await call({ captcha: proof })).error).toMatchObject({
      message: UserErrEnum.invalidVerificationCode
    });
    await storeProof();
    mocks.credentials.mockRejectedValue(UserErrEnum.account_psw_error);
    expect((await call({ captcha: proof })).error).toBe(UserErrEnum.account_psw_error);
    expect(mocks.recordFailure).toHaveBeenCalledWith({ username: body.username, ip: 'unknown' });
    await expect(
      verification.get({ type: 'captcha', scene: 'login', key: `password-login:${body.username}` })
    ).resolves.toBeNull();
  });

  it('rejects another account, a normal send-code proof, and expired proofs', async () => {
    mocks.requiresCaptcha.mockResolvedValue(true);
    await storeProof('other@example.com');
    await verification.upsert({
      type: 'captcha',
      scene: 'login',
      key: body.username,
      data: { code: proof },
      ttlPreset: 'short'
    });
    expect((await call({ captcha: proof })).error).toMatchObject({
      message: UserErrEnum.invalidVerificationCode
    });
    await storeProof();
    const { MongoTmpData } = await import('@fastgpt/service/support/tmpData/schema');
    await MongoTmpData.updateMany({}, { expireAt: new Date(0) });
    expect((await call({ captcha: proof })).error).toMatchObject({
      message: UserErrEnum.invalidVerificationCode
    });
    expect(mocks.credentials).not.toHaveBeenCalled();
  });

  it('skips the risk puzzle only when the account will actually enter 2FA', async () => {
    mocks.enabled.mockResolvedValue(true);
    mocks.resolve.mockResolvedValue({
      status: 'supported',
      channel: 'email',
      target: body.username
    });
    mocks.createChallenge.mockResolvedValue({
      status: 'verificationRequired',
      challenge: 'challenge',
      method: 'code',
      channel: 'email',
      maskedTarget: 'a***@example.com',
      expiredAt: '2099-01-01T00:00:00.000Z'
    });
    expect((await call({ automated: true })).data.status).toBe('verificationRequired');
    expect(mocks.requiresCaptcha).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();

    mocks.resolve.mockResolvedValue({ status: 'unsupported' });
    mocks.requiresCaptcha.mockResolvedValue(true);
    expect((await call({ automated: true })).data.status).toBe('captchaRequired');
    expect(mocks.requiresCaptcha).toHaveBeenCalled();
  });
});
