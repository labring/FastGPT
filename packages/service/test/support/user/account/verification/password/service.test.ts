import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import { PasswordVerificationService } from '@fastgpt/service/support/user/account/verification/password/service';
import type {
  PasswordVerificationDependencies,
  PasswordVerificationUser
} from '@fastgpt/service/support/user/account/verification/password/type';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { getDataId } from '@fastgpt/service/support/tmpData/verification';
import { describe, expect, it, vi } from 'vitest';

const createUser = (): PasswordVerificationUser =>
  ({
    _id: 'user-id',
    username: 'test@example.com',
    password: 'hashed-password',
    promotionRate: 0,
    openaiKey: '',
    createTime: 0,
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    status: 'active',
    tags: [],
    save: vi.fn(async () => undefined)
  }) as PasswordVerificationUser;

const createDependencies = (
  overrides: Partial<PasswordVerificationDependencies> = {}
): PasswordVerificationDependencies => ({
  generateCode: vi.fn(() => 'ABC123'),
  now: vi.fn(() => new Date('2026-07-28T00:00:00.000Z')),
  assertConsumeFrequency: vi.fn(async () => undefined),
  savePreLoginCode: vi.fn(async () => undefined),
  verifyPreLoginCode: vi.fn(async () => undefined),
  findUserByCredentials: vi.fn(async () => createUser()),
  ...overrides
});

describe('PasswordVerificationService.issuePreLoginCode', () => {
  it('creates the same six-character, thirty-second pre-login material', async () => {
    const dependencies = createDependencies();
    const service = new PasswordVerificationService(dependencies);

    await expect(
      service.issuePreLoginCode({ username: 'test@example.com', purpose: 'login' })
    ).resolves.toEqual({ code: 'ABC123' });
    expect(dependencies.generateCode).toHaveBeenCalledWith(6);
    expect(dependencies.savePreLoginCode).toHaveBeenCalledWith({
      username: 'test@example.com',
      code: 'ABC123',
      purpose: 'login',
      expiredTime: new Date('2026-07-28T00:00:30.000Z')
    });
  });
});

describe('PasswordVerificationService.verifyCredentials', () => {
  it('verifies the pre-login code before querying the user', async () => {
    const calls: string[] = [];
    const user = createUser();
    const dependencies = createDependencies({
      verifyPreLoginCode: vi.fn(async () => {
        calls.push('verify-code');
      }),
      assertConsumeFrequency: vi.fn(async () => {
        calls.push('consume-frequency');
      }),
      findUserByCredentials: vi.fn(async () => {
        calls.push('find-user');
        return user;
      })
    });
    const service = new PasswordVerificationService(dependencies);

    await expect(
      service.verifyCredentials({
        username: 'test@example.com',
        password: 'hashed-password',
        code: 'ABC123',
        purpose: 'login'
      })
    ).resolves.toBe(user);
    expect(calls).toEqual(['consume-frequency', 'verify-code', 'find-user']);
    expect(dependencies.findUserByCredentials).toHaveBeenCalledWith({
      username: 'test@example.com',
      password: 'hashed-password'
    });
  });

  it('keeps the original account/password error when no user matches', async () => {
    const dependencies = createDependencies({
      findUserByCredentials: vi.fn(async () => null)
    });
    const service = new PasswordVerificationService(dependencies);

    await expect(
      service.verifyCredentials({
        username: 'missing@example.com',
        password: 'wrong-password',
        code: 'ABC123',
        purpose: 'login'
      })
    ).rejects.toBe(UserErrEnum.account_psw_error);
  });

  it('returns a matched user without applying login-only account policies', async () => {
    const user = {
      ...createUser(),
      username: 'wecom-openid',
      status: 'forbidden'
    } as UserModelSchema;
    const dependencies = createDependencies({
      findUserByCredentials: vi.fn(async () => user)
    });
    const service = new PasswordVerificationService(dependencies);

    await expect(
      service.verifyCredentials({
        username: 'wecom-openid',
        password: 'hashed-password',
        code: 'ABC123',
        purpose: 'login'
      })
    ).resolves.toBe(user);
  });

  it('does not query the user when pre-login verification fails', async () => {
    const error = new Error('invalid code');
    const dependencies = createDependencies({
      verifyPreLoginCode: vi.fn(async () => Promise.reject(error))
    });
    const service = new PasswordVerificationService(dependencies);

    await expect(
      service.verifyCredentials({
        username: 'test@example.com',
        password: 'hashed-password',
        code: 'invalid',
        purpose: 'login'
      })
    ).rejects.toBe(error);
    expect(dependencies.findUserByCredentials).not.toHaveBeenCalled();
  });

  it('does not consume the pre-login material when frequency is exceeded', async () => {
    const error = new Error('too frequent');
    const dependencies = createDependencies({
      assertConsumeFrequency: vi.fn(async () => Promise.reject(error))
    });
    const service = new PasswordVerificationService(dependencies);

    await expect(
      service.verifyCredentials({
        username: 'test@example.com',
        password: 'hashed-password',
        code: 'ABC123',
        purpose: 'login'
      })
    ).rejects.toBe(error);
    expect(dependencies.verifyPreLoginCode).not.toHaveBeenCalled();
  });
});

describe('PasswordVerificationService default adapters', () => {
  it('stores and consumes password material in tmp_datas', async () => {
    const username = 'default-adapters@example.com';
    const password = 'hashed-password';
    const beforeIssue = Date.now();
    const service = new PasswordVerificationService();

    const { code } = await service.issuePreLoginCode({ username, purpose: 'login' });
    const afterIssue = Date.now();
    const authMaterial = await MongoTmpData.findOne({
      dataId: getDataId('login', 'password', username)
    }).lean();

    expect(code).toMatch(/^[a-z][a-zA-Z0-9]{5}$/);
    expect(authMaterial).toMatchObject({
      dataId: getDataId('login', 'password', username),
      data: { preLoginCode: code }
    });
    expect(authMaterial?.expireAt.getTime()).toBeGreaterThanOrEqual(beforeIssue + 30_000);
    expect(authMaterial?.expireAt.getTime()).toBeLessThanOrEqual(afterIssue + 30_000);

    const storedUser = await MongoUser.create({ username, password });
    const result = await service.verifyCredentials({ username, password, code, purpose: 'login' });

    await expect(
      MongoTmpData.findOne({ dataId: getDataId('login', 'password', username) })
    ).resolves.toBeNull();
    expect(String(result._id)).toBe(String(storedUser._id));
  });
});
