import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  has: vi.fn(),
  mark: vi.fn(),
  report: vi.fn(),
  configured: vi.fn(),
  findUser: vi.fn(),
  findTeam: vi.fn(),
  warn: vi.fn()
}));

vi.mock('@fastgpt/dal/redis/caches', () => ({
  successMarkerCache: {
    has: mocks.has,
    mark: mocks.mark
  }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ warn: mocks.warn }),
  LogCategories: { MODULE: { USER: { ACCOUNT: ['user', 'account'] } } }
}));

vi.mock('@fastgpt/service/support/user/schema', () => ({
  MongoUser: {
    findById: (...args: unknown[]) => ({ lean: () => mocks.findUser(...args) })
  }
}));

vi.mock('@fastgpt/service/support/user/team/teamSchema', () => ({
  MongoTeam: {
    findById: (...args: unknown[]) => ({ lean: () => mocks.findTeam(...args) })
  }
}));

vi.mock('@fastgpt/service/support/marketing/attribution', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/support/marketing/attribution')>();
  return {
    ...original,
    isCRMReportingConfigured: mocks.configured,
    reportCRMVisitorLifecycle: mocks.report
  };
});

import {
  CRMLifecycleEvent,
  reportCRMTeamLifecycleOnce
} from '@fastgpt/service/support/marketing/interface';

describe('CRM team lifecycle interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.has.mockResolvedValue(false);
    mocks.mark.mockResolvedValue(undefined);
    mocks.report.mockResolvedValue(true);
    mocks.findTeam.mockResolvedValue({ ownerId: 'user-1' });
    mocks.findUser.mockResolvedValue({ fastgpt_sem: { visitor_id: 'stored-visitor' } });
  });

  it('checks the team marker before querying team or user', async () => {
    mocks.has.mockResolvedValueOnce(true);

    await reportCRMTeamLifecycleOnce({
      teamId: 'team-1',
      event: CRMLifecycleEvent.Consumption
    });

    expect(mocks.has).toHaveBeenCalledWith({
      scope: 'integration-report',
      segments: ['crm', 'lifecycle', 'consumption', 'team', 'team-1']
    });
    expect(mocks.findTeam).not.toHaveBeenCalled();
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('resolves the team owner visitor and marks the team only after CRM succeeds', async () => {
    await reportCRMTeamLifecycleOnce({
      teamId: 'team-1',
      event: CRMLifecycleEvent.Recharge
    });

    expect(mocks.findTeam).toHaveBeenCalledWith('team-1', 'ownerId');
    expect(mocks.findUser).toHaveBeenCalledWith('user-1', 'fastgpt_sem');
    expect(mocks.report).toHaveBeenCalledWith({
      visitorId: 'stored-visitor',
      event: 'recharge',
      company: undefined,
      summary: undefined
    });
    expect(mocks.mark).toHaveBeenCalledWith({
      params: {
        scope: 'integration-report',
        segments: ['crm', 'lifecycle', 'recharge', 'team', 'team-1']
      }
    });
  });

  it('does not mark a failed CRM request', async () => {
    mocks.report.mockResolvedValueOnce(false);

    await reportCRMTeamLifecycleOnce({
      teamId: 'team-1',
      event: CRMLifecycleEvent.Consumption
    });

    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it('fails open when Redis cannot read the team marker', async () => {
    mocks.has.mockRejectedValueOnce(new Error('redis unavailable'));

    await reportCRMTeamLifecycleOnce({
      teamId: 'team-1',
      event: CRMLifecycleEvent.Consumption
    });

    expect(mocks.findTeam).toHaveBeenCalledTimes(1);
    expect(mocks.report).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('does not mark when the owner has no visitor id', async () => {
    mocks.findUser.mockResolvedValueOnce({ fastgpt_sem: {} });

    await reportCRMTeamLifecycleOnce({
      teamId: 'team-1',
      event: CRMLifecycleEvent.Consumption
    });

    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  });
});
