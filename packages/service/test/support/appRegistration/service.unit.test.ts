import { describe, expect, it, vi } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import type { DbSession } from '@fastgpt/dal/db/types';
import { AppRegistrationService } from '@fastgpt/service/support/appRegistration/service';
import type {
  AppRegistrationDomainDTO,
  AppRegistrationRepository
} from '@fastgpt/dal/db/repos/appRegistration/repo.type';

const createMockRepo = (): {
  repo: AppRegistrationRepository;
  findByTeamAndApp: ReturnType<typeof vi.fn>;
  countByTeam: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  deleteByApp: ReturnType<typeof vi.fn>;
} => {
  const findByTeamAndApp = vi.fn(async () => null);
  const countByTeam = vi.fn(async () => 0);
  const create = vi.fn(
    async ({ data }): Promise<AppRegistrationDomainDTO> => ({
      _id: createEntityId(),
      teamId: data.teamId,
      tmbId: data.tmbId,
      appId: data.appId,
      createdAt: data.createdAt
    })
  );
  const deleteByApp = vi.fn(async () => 1);

  return {
    repo: {
      findById: vi.fn(async () => null),
      findByTeamAndApp,
      listByTeam: vi.fn(async () => []),
      countByTeam,
      create,
      deleteByApp
    },
    findByTeamAndApp,
    countByTeam,
    create,
    deleteByApp
  };
};

describe('AppRegistrationService (DI unit tests)', () => {
  it('registers an app within transaction when under quota and not duplicated', async () => {
    const mocks = createMockRepo();
    const fakeTx = { id: 'tx-1' } as unknown as DbSession;
    const service = new AppRegistrationService({
      appRegistrationRepo: mocks.repo,
      runTx: (fn) => fn(fakeTx)
    });

    const teamId = createEntityId();
    const tmbId = createEntityId();
    const appId = createEntityId();
    mocks.countByTeam.mockResolvedValueOnce(1);

    const created = await service.registerApp({ teamId, tmbId, appId, quotaLimit: 3 });

    expect(created.teamId).toBe(teamId);
    expect(created.appId).toBe(appId);
    expect(mocks.findByTeamAndApp).toHaveBeenCalledWith({ teamId, appId, tx: fakeTx });
    expect(mocks.countByTeam).toHaveBeenCalledWith({ teamId, tx: fakeTx });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        teamId,
        tmbId,
        appId,
        createdAt: expect.any(Date)
      },
      tx: fakeTx
    });
  });

  it('rejects duplicate registrations before checking quota or creating', async () => {
    const mocks = createMockRepo();
    const fakeTx = { id: 'tx-2' } as unknown as DbSession;
    const service = new AppRegistrationService({
      appRegistrationRepo: mocks.repo,
      runTx: (fn) => fn(fakeTx)
    });

    const teamId = createEntityId();
    const tmbId = createEntityId();
    const appId = createEntityId();
    mocks.findByTeamAndApp.mockResolvedValueOnce({
      _id: createEntityId(),
      teamId,
      tmbId,
      appId,
      createdAt: new Date()
    });

    await expect(service.registerApp({ teamId, tmbId, appId, quotaLimit: 3 })).rejects.toBe(
      'Registration already exists for this app'
    );
    expect(mocks.countByTeam).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects when team quota is reached and skips quota query when quotaLimit is omitted or <= 0', async () => {
    const mocks = createMockRepo();
    const fakeTx = { id: 'tx-3' } as unknown as DbSession;
    const service = new AppRegistrationService({
      appRegistrationRepo: mocks.repo,
      runTx: (fn) => fn(fakeTx)
    });

    const teamId = createEntityId();
    const tmbId = createEntityId();
    const appId = createEntityId();
    mocks.countByTeam.mockResolvedValueOnce(3);

    await expect(service.registerApp({ teamId, tmbId, appId, quotaLimit: 3 })).rejects.toBe(
      'Registration quota exceeded. Current: 3, Limit: 3'
    );
    expect(mocks.create).not.toHaveBeenCalled();

    await service.registerApp({ teamId, tmbId, appId, quotaLimit: 0, tx: fakeTx });
    expect(mocks.countByTeam).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('delegates countTeamRegistrations and deleteAppRegistrations with optional tx', async () => {
    const mocks = createMockRepo();
    const service = new AppRegistrationService({ appRegistrationRepo: mocks.repo });
    const fakeTx = { id: 'tx-4' } as unknown as DbSession;
    const teamId = createEntityId();
    const appId = createEntityId();

    mocks.countByTeam.mockResolvedValueOnce(5);
    expect(await service.countTeamRegistrations({ teamId, tx: fakeTx })).toBe(5);
    expect(mocks.countByTeam).toHaveBeenCalledWith({ teamId, tx: fakeTx });

    expect(await service.deleteAppRegistrations({ teamId, appId, tx: fakeTx })).toBe(1);
    expect(mocks.deleteByApp).toHaveBeenCalledWith({ teamId, appId, tx: fakeTx });
  });
});
