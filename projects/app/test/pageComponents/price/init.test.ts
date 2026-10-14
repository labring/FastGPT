import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetLogoutState } from '@/web/support/user/logoutState';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import type { UserType } from '@fastgpt/global/support/user/type';
import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';

const mocks = vi.hoisted(() => ({
  getSystemInitData: vi.fn(),
  getTokenLogin: vi.fn(),
  getTeamPlanStatus: vi.fn()
}));
vi.mock('@/web/common/system/api', () => ({ getSystemInitData: mocks.getSystemInitData }));
vi.mock('@/web/support/user/api', () => ({ getTokenLogin: mocks.getTokenLogin }));
vi.mock('@/web/support/user/team/api', () => ({ getTeamPlanStatus: mocks.getTeamPlanStatus }));

// 在导入真实持久化 Store 前提供浏览器 Storage，避免 Node 的占位 localStorage 被捕获。
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
const { initPriceData } = await import('@/pageComponents/price/init');
const { clientInitData } = await import('@/web/common/system/staticData');
const { useSystemStore } = await import('@/web/common/system/useSystemStore');
const { useUserStore } = await import('@/web/support/user/useUserStore');

/** 控制真实初始化链路的响应时序，其他 Store 和并发逻辑不替换。 */
const deferResponse = () => {
  let resolve!: (response: GetSystemInitDataResponse) => void;
  const promise = new Promise<GetSystemInitDataResponse>((release) => {
    resolve = release;
  });
  return { promise, resolve };
};

const initialSystemState = useSystemStore.getState();
const initialUserState = useUserStore.getState();
const plans = { extraDatasetSize: { price: 4 } };
const response = { isAuthenticated: false, feConfigs: { systemTitle: 'public' }, subPlans: plans };

describe('initPriceData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('window', { location: { pathname: '/price' } });
    useSystemStore.setState(initialSystemState, true);
    useUserStore.setState(initialUserState, true);
    resetLogoutState();
    mocks.getSystemInitData.mockResolvedValue(response);
    mocks.getTokenLogin.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetLogoutState();
  });

  it('shares cold initialization and reuses confirmed plans on later price-page visits', async () => {
    const held = deferResponse();
    mocks.getSystemInitData.mockReturnValueOnce(held.promise);
    const globalInit = clientInitData();
    const priceInit = initPriceData();
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
    held.resolve(response);
    await globalInit;
    expect(await priceInit).toEqual({ userInfo: null, teamSubPlan: null });
    await initPriceData();
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
    expect(mocks.getTeamPlanStatus).not.toHaveBeenCalled();
  });

  it('returns restored identity and obtains team status once while sharing global initialization', async () => {
    const permission = new TeamPermission({ isOwner: true });
    const user: UserType = {
      _id: 'user-id',
      username: 'member',
      avatar: '',
      timezone: 'Asia/Shanghai',
      language: 'en',
      hasPassword: true,
      tags: [],
      permission,
      team: {
        userId: 'user-id',
        tmbId: 'member-id',
        teamId: 'team-id',
        teamName: 'Team',
        memberName: 'Member',
        isSetMemberName: true,
        avatar: '',
        role: TeamMemberRoleEnum.owner,
        status: TeamMemberStatusEnum.active,
        permission
      }
    };
    mocks.getTokenLogin.mockResolvedValueOnce(user);
    mocks.getTeamPlanStatus.mockResolvedValueOnce(null);
    const held = deferResponse();
    mocks.getSystemInitData.mockReturnValueOnce(held.promise);
    const globalInit = clientInitData();
    const priceInit = initPriceData();
    held.resolve({ ...response, isAuthenticated: true });
    await globalInit;
    expect(await priceInit).toEqual({ userInfo: user, teamSubPlan: null });
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
    expect(mocks.getTokenLogin).toHaveBeenCalledTimes(1);
    expect(mocks.getTeamPlanStatus).toHaveBeenCalledTimes(1);
  });

  it('refreshes persisted plans that were not confirmed during this session', async () => {
    useSystemStore.setState({
      initConfigGeneration: 0,
      subPlans: { extraDatasetSize: { price: 999 } }
    });
    await initPriceData();
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
    expect(useSystemStore.getState().subPlans).toEqual(plans);
  });

  it.each([false, true])(
    'supplements an ordinary pending request only when it lacks plans: hasPlans=%s',
    async (hasPlans) => {
      window.location.pathname = '/login';
      const held = deferResponse();
      mocks.getSystemInitData.mockReturnValueOnce(held.promise);
      const globalInit = clientInitData();
      window.location.pathname = '/price';
      const priceInit = initPriceData();
      const concurrentPriceInit = initPriceData();
      expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
      held.resolve({ isAuthenticated: false, ...(hasPlans && { subPlans: plans }) });
      await globalInit;
      await Promise.all([priceInit, concurrentPriceInit]);
      expect(mocks.getSystemInitData).toHaveBeenCalledTimes(hasPlans ? 1 : 2);
      expect(useSystemStore.getState().subPlans).toEqual(plans);
    }
  );

  it.each(['navigation', 'session'] as const)(
    'skips supplementation after %s changes while waiting',
    async (change) => {
      const held = deferResponse();
      mocks.getSystemInitData.mockReturnValueOnce(held.promise);
      const globalInit = clientInitData();
      const priceInit = initPriceData();
      if (change === 'navigation') window.location.pathname = '/login';
      else useUserStore.getState().invalidateAuthSession();
      held.resolve({ isAuthenticated: false });
      await globalInit;
      await priceInit;
      expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
    }
  );

  it('joins a new-session initialization instead of reusing previous-session plans', async () => {
    useSystemStore.getState().initStaticData(response, { authGeneration: 0 });
    useUserStore.getState().invalidateAuthSession();
    const held = deferResponse();
    mocks.getSystemInitData.mockReturnValueOnce(held.promise);
    const globalInit = clientInitData();
    const priceInit = initPriceData();
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
    held.resolve(response);
    await globalInit;
    await priceInit;
    expect(useSystemStore.getState().subPlansConfigGeneration).toBe(1);
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
  });
});
