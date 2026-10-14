import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  feConfigs: { isPlus: true } as { isPlus: boolean; show_enterprise_auth?: boolean },
  authGeneration: 1,
  configGeneration: undefined as number | undefined,
  pendingMemberName: false,
  completedMemberNames: 0
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: mocks.feConfigs,
    authenticatedConfigGeneration: mocks.configGeneration
  })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    authGeneration: mocks.authGeneration,
    userInfo: {
      _id: 'user-1',
      team: {
        teamId: 'team-1',
        isSetMemberName: !mocks.pendingMemberName,
        permission: { isOwner: true, hasManagePer: true }
      }
    },
    enterpriseAuthNoticeReadTeamIds: [],
    setEnterpriseAuthNoticeRead: vi.fn()
  })
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/dashboard/agent', asPath: '/dashboard/agent', push: vi.fn() })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (_key: unknown, _request: unknown, options: { enabled: boolean }) => ({
    data: options.enabled ? { status: 'unverified', enabled: true, canManage: true } : undefined,
    isFetched: options.enabled,
    isError: false
  })
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: () => React.createElement('div', { 'data-enterprise-notice': true }, 'notice')
}));
vi.mock('next/dynamic', () => ({
  default: (loader: () => unknown) => {
    if (String(loader).includes('EnterpriseAuthNoticeModal')) {
      return function EnterpriseNotice(props: { enabled?: boolean; onFinish?: () => void }) {
        return React.createElement(EnterpriseAuthNoticeModal, props);
      };
    }
    const isMemberName = String(loader).includes('ForceMemberNameModal');
    // 其他动作没有待处理内容，模拟正常完成；编排器和认证提示执行真实逻辑。
    return function CompletedAction({
      onFinish,
      onSuccess
    }: {
      onFinish?: () => void;
      onSuccess?: () => void;
    }) {
      React.useEffect(() => {
        if (isMemberName) mocks.completedMemberNames += 1;
        onFinish?.();
        onSuccess?.();
      }, [onFinish, onSuccess]);
      return null;
    };
  }
}));

import EnterpriseAuthNoticeModal from '@/components/support/user/inform/EnterpriseAuthNoticeModal';
import PostLoginActionOrchestrator from '@/components/Layout/PostLoginActionOrchestrator';

describe('PostLoginActionOrchestrator authenticated configuration readiness', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://app.example.com/dashboard/agent'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.feConfigs = { isPlus: true };
    mocks.authGeneration = 1;
    mocks.configGeneration = undefined;
    mocks.pendingMemberName = false;
    mocks.completedMemberNames = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    window.close();
    vi.unstubAllGlobals();
  });
  const render = () =>
    act(async () =>
      root.render(
        React.createElement(PostLoginActionOrchestrator, {
          importantInforms: [],
          importantInformQueryError: false,
          unreadQueryFetched: true,
          refetchImportantInforms: async () => ({ isError: false })
        })
      )
    );

  it('shows the enterprise notice when the current session configuration is already ready', async () => {
    mocks.feConfigs = { isPlus: true, show_enterprise_auth: true };
    mocks.configGeneration = 1;
    await render();
    expect(container.querySelector('[data-enterprise-notice]')).not.toBeNull();
  });

  it.each([undefined, 0])(
    'waits for current configuration when the cached generation is %s',
    async (configGeneration) => {
      mocks.configGeneration = configGeneration;
      if (configGeneration !== undefined) mocks.feConfigs.show_enterprise_auth = true;
      await render();
      expect(container.querySelector('[data-enterprise-notice]')).toBeNull();

      mocks.feConfigs = { isPlus: true, show_enterprise_auth: true };
      mocks.configGeneration = 1;
      await render();
      expect(container.querySelector('[data-enterprise-notice]')).not.toBeNull();
    }
  );

  it('allows mandatory member-name completion before private configuration is ready', async () => {
    mocks.pendingMemberName = true;
    await render();
    expect(mocks.completedMemberNames).toBe(1);
    expect(container.querySelector('[data-enterprise-notice]')).toBeNull();
  });
});
