import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/web/common/api/request';
import { getTeamPlanEntitlements } from '@/web/support/user/team/api';

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));

describe('getTeamPlanEntitlements', () => {
  it('requests lightweight entitlements through the existing plan endpoint', () => {
    getTeamPlanEntitlements();
    expect(GET).toHaveBeenCalledWith('/support/user/team/plan/getTeamPlanStatus', {
      scope: 'entitlements'
    });
  });
});
