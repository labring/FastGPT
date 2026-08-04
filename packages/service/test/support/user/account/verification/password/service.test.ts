import { PasswordVerificationService } from '@fastgpt/service/support/user/account/verification/password/service';
import type {
  PasswordVerificationDependencies,
  PasswordVerificationUser
} from '@fastgpt/service/support/user/account/verification/password/type';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import {
  getDataId,
  VerificationMaterialError
} from '@fastgpt/service/support/tmpData/verification';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { describe, expect, it, vi } from 'vitest';

const createDependencies = (
  overrides: Partial<PasswordVerificationDependencies> = {}
): PasswordVerificationDependencies => ({
  generateCode: vi.fn(() => 'ABC123'),
  assertConsumeFrequency: vi.fn(async () => undefined),
  savePreLoginCode: vi.fn(async () => undefined),
  findUserByCredentials: vi.fn(async () => null),
  consumeInTransaction: vi.fn(async (_params, handler) =>
    handler({
      material: { preLoginCode: 'ABC123' },
      session: undefined as unknown as ClientSession
    })
  ),
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
      ttlPreset: 'short'
    });
  });
});

describe('PasswordVerificationService default adapters', () => {
  it('stores and consumes password material after the business callback succeeds', async () => {
    const username = 'default-adapters@example.com';
    const password = 'hashed-password';
    const beforeIssue = Date.now();
    const service = new PasswordVerificationService();

    const { code } = await service.issuePreLoginCode({ username, purpose: 'login' });
    const afterIssue = Date.now();
    const authMaterial = await MongoTmpData.findOne({
      dataId: getDataId({ scene: 'login', type: 'password', key: username })
    }).lean();

    expect(code).toMatch(/^[a-z][a-zA-Z0-9]{5}$/);
    expect(authMaterial).toMatchObject({
      dataId: getDataId({ scene: 'login', type: 'password', key: username }),
      data: { preLoginCode: code }
    });
    expect(authMaterial?.expireAt.getTime()).toBeGreaterThanOrEqual(beforeIssue + 30_000);
    expect(authMaterial?.expireAt.getTime()).toBeLessThanOrEqual(afterIssue + 30_000);

    const storedUser = await MongoUser.create({ username, password });
    const result = await service.withVerifiedCredentials(
      { username, password, code, purpose: 'login' },
      async ({ user }) => user
    );

    await expect(
      MongoTmpData.findOne({
        dataId: getDataId({ scene: 'login', type: 'password', key: username })
      })
    ).resolves.toBeNull();
    expect(String(result._id)).toBe(String(storedUser._id));
  });
});

describe('PasswordVerificationService.withVerifiedCredentials', () => {
  it('passes the matched user and transaction session to the business callback', async () => {
    const user = { _id: 'user-id' } as unknown as PasswordVerificationUser;
    const session = {} as ClientSession;
    const consumeInTransaction = vi.fn(async (_params, handler) =>
      handler({ material: { preLoginCode: 'ABC123' }, session })
    );
    const dependencies = createDependencies({
      findUserByCredentials: vi.fn(async (params) => {
        expect(params.session).toBe(session);
        return user;
      }),
      consumeInTransaction
    });
    const service = new PasswordVerificationService(dependencies);
    const handler = vi.fn(async ({ user: matchedUser, session: callbackSession }) => {
      expect(matchedUser).toBe(user);
      expect(callbackSession).toBe(session);
      return 'completed';
    });

    await expect(
      service.withVerifiedCredentials(
        {
          username: 'test@example.com',
          password: 'hashed-password',
          code: 'ABC123',
          purpose: 'login'
        },
        handler
      )
    ).resolves.toBe('completed');
    expect(consumeInTransaction).toHaveBeenCalledWith(
      {
        scene: 'login',
        type: 'password',
        key: 'test@example.com',
        match: { preLoginCode: 'ABC123' }
      },
      expect.any(Function)
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('maps missing verification material to the original invalid-code error', async () => {
    const dependencies = createDependencies({
      consumeInTransaction: vi.fn(async () => Promise.reject(new VerificationMaterialError()))
    });
    const service = new PasswordVerificationService(dependencies);

    await expect(
      service.withVerifiedCredentials(
        {
          username: 'test@example.com',
          password: 'hashed-password',
          code: 'invalid',
          purpose: 'login'
        },
        async () => 'unreachable'
      )
    ).rejects.toMatchObject({ message: UserErrEnum.invalidVerificationCode });
    expect(dependencies.findUserByCredentials).not.toHaveBeenCalled();
  });
});
