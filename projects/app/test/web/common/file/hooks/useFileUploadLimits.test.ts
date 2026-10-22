import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileUploadLimits } from '@/web/common/file/hooks/useFileUploadLimits';

const mocks = vi.hoisted(() => ({
  teamPlan: {} as Record<string, unknown>,
  plans: {} as Record<string, unknown>,
  initTeamPlanStatus: vi.fn()
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: { limit: { uploadFileMaxSize: 1000, uploadFileMaxAmount: 1000 } },
    subPlans: { standard: mocks.plans }
  })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    teamPlanStatus: { standard: mocks.teamPlan },
    initTeamPlanStatus: mocks.initTeamPlanStatus
  })
}));

/** 运行真实 Hook 与套餐继承规则，只替换 Store 数据来源。 */
const readLimits = () => {
  let result!: ReturnType<typeof useFileUploadLimits>;
  const Harness = () => {
    result = useFileUploadLimits();
    return null;
  };
  renderToStaticMarkup(React.createElement(Harness));
  return result;
};

describe('useFileUploadLimits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.teamPlan = { currentSubLevel: 'basic', maxUploadFileSize: 0, maxUploadFileCount: 0 };
    mocks.plans = { basic: { maxUploadFileSize: 50, maxUploadFileCount: 10 } };
  });

  it('uses the current plan when cached team fields are zero, without requesting a refresh', () => {
    expect(readLimits()).toEqual({ maxUploadFileSize: 50, maxUploadFileCount: 10 });
    expect(mocks.initTeamPlanStatus).not.toHaveBeenCalled();
  });

  it('uses the environment when both team and plan are unset', () => {
    mocks.plans = { basic: { maxUploadFileSize: 0, maxUploadFileCount: 0 } };
    expect(readLimits()).toEqual({ maxUploadFileSize: 1000, maxUploadFileCount: 1000 });
  });

  it('retains positive team overrides when the public plan changes', () => {
    mocks.teamPlan = { ...mocks.teamPlan, maxUploadFileSize: 20, maxUploadFileCount: 2 };
    mocks.plans = { basic: { maxUploadFileSize: 100, maxUploadFileCount: 30 } };
    expect(readLimits()).toEqual({ maxUploadFileSize: 20, maxUploadFileCount: 2 });
  });

  it.each([{}, { maxUploadFileSize: 0, maxUploadFileCount: 0 }])(
    'inherits the advanced plan for a custom plan with unset upload overrides: %j',
    (custom) => {
      mocks.teamPlan = { currentSubLevel: 'custom' };
      mocks.plans = { custom, advanced: { maxUploadFileSize: 100, maxUploadFileCount: 20 } };
      expect(readLimits()).toEqual({ maxUploadFileSize: 100, maxUploadFileCount: 20 });
    }
  );
});
