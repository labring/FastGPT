import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';

const mocks = vi.hoisted(() => ({
  findRoot: vi.fn(),
  selectPassword: vi.fn(),
  createUser: vi.fn(),
  createDefaultTeam: vi.fn(),
  runTransaction: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/schema', () => ({
  MongoUser: {
    findOne: mocks.findRoot,
    create: mocks.createUser
  }
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  createDefaultTeam: mocks.createDefaultTeam
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.runTransaction
}));

vi.mock('@/env', () => ({
  appEnv: { DEFAULT_ROOT_PSW: 'configured-root-password' }
}));

import { initRootUser } from '@/service/mongo';

describe('initRootUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findRoot.mockReturnValue({ select: mocks.selectPassword });
    mocks.runTransaction.mockImplementation(async (callback) => callback('mongo-session'));
    mocks.createDefaultTeam.mockResolvedValue(undefined);
  });

  it('does not rewrite an unchanged configured password', async () => {
    const updateOne = vi.fn();
    mocks.selectPassword.mockResolvedValue({
      _id: 'root-id',
      toObject: () => ({
        password: hashStr(hashStr('configured-root-password'))
      }),
      updateOne
    });

    await initRootUser();

    expect(updateOne).not.toHaveBeenCalled();
    expect(mocks.createDefaultTeam).toHaveBeenCalledWith({
      userId: 'root-id',
      session: 'mongo-session'
    });
  });

  it('updates password and update time when the configured password changes', async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    mocks.selectPassword.mockResolvedValue({
      _id: 'root-id',
      toObject: () => ({ password: hashStr(hashStr('old-root-password')) }),
      updateOne
    });

    await initRootUser();

    expect(updateOne).toHaveBeenCalledWith(
      {
        password: hashStr('configured-root-password'),
        passwordUpdateTime: expect.any(Date)
      },
      { session: 'mongo-session' }
    );
  });

  it('writes password update time when creating root for the first time', async () => {
    mocks.selectPassword.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue([{ _id: 'new-root-id' }]);

    await initRootUser();

    expect(mocks.createUser).toHaveBeenCalledWith(
      [
        {
          username: 'root',
          password: hashStr('configured-root-password'),
          passwordUpdateTime: expect.any(Date)
        }
      ],
      { session: 'mongo-session', ordered: true }
    );
    expect(mocks.createDefaultTeam).toHaveBeenCalledWith({
      userId: 'new-root-id',
      session: 'mongo-session'
    });
  });
});
