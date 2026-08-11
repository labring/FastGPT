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
  reportCRMTeamLifecycleOnce,
  reportCRMVisitorLifecycleOnce
} from '@fastgpt/service/support/marketing/interface';

describe('CRM lifecycle interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.has.mockResolvedValue(false);
    mocks.mark.mockResolvedValue(undefined);
    mocks.report.mockResolvedValue(true);
  });

  it('skips an event that already has a success marker', async () => {
    mocks.has.mockResolvedValueOnce(true);

    await reportCRMVisitorLifecycleOnce({
      visitorId: 'visitor-1',
      event: CRMLifecycleEvent.Consumption
    });

    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('writes the permanent marker only after CRM succeeds', async () => {
    await reportCRMVisitorLifecycleOnce({
      visitorId: 'visitor-1',
      event: CRMLifecycleEvent.Recharge
    });

    expect(mocks.report).toHaveBeenCalledWith({
      visitorId: 'visitor-1',
      event: 'recharge',
      company: undefined,
      summary: undefined
    });
    expect(mocks.mark).toHaveBeenCalledWith({
      params: {
        scope: 'integration-report',
        segments: ['crm', 'lifecycle', 'recharge', 'visitor-1']
      }
    });
  });

  it('does not mark a failed CRM request', async () => {
    mocks.report.mockResolvedValueOnce(false);

    await reportCRMVisitorLifecycleOnce({
      visitorId: 'visitor-1',
      event: CRMLifecycleEvent.Consumption
    });

    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it('fails open when Redis cannot read the marker', async () => {
    mocks.has.mockRejectedValueOnce(new Error('redis unavailable'));

    await reportCRMVisitorLifecycleOnce({
      visitorId: 'visitor-1',
      event: CRMLifecycleEvent.Consumption
    });

    expect(mocks.report).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('resolves the visitor id from the team owner stored user data', async () => {
    mocks.findTeam.mockResolvedValueOnce({ ownerId: 'user-1' });
    mocks.findUser.mockResolvedValueOnce({ fastgpt_sem: { visitor_id: 'stored-visitor' } });

    await reportCRMTeamLifecycleOnce({
      teamId: 'team-1',
      event: CRMLifecycleEvent.Consumption
    });

    expect(mocks.report).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: 'stored-visitor', event: 'consumption' })
    );
  });
});
