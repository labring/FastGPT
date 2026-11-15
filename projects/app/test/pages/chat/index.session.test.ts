import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/web/common/i18n/utils', () => ({
  serviceSideProps: vi.fn().mockResolvedValue({})
}));

let getServerSideProps: typeof import('@/pages/chat/index').getServerSideProps;
beforeAll(async () => {
  // 只验证实际 SSR 入口的恢复决策，不装载聊天编辑器和窗口组件。
  for (const name of [
    '@/components/common/NextHead',
    '@/components/PageContainer',
    '@/pageComponents/chat/slider',
    '@/web/core/chat/context/useChatStore',
    '@/web/core/chat/context/chatContext',
    '@/web/core/chat/context/chatItemContext',
    '@/web/core/chat/context/chatRecordContext',
    '@/pageComponents/chat/ChatQuoteList',
    '@/pageComponents/login/LoginModal',
    '@/web/common/system/useSystemStore',
    '@/pageComponents/chat/ChatSetting',
    '@/pageComponents/chat/ChatWindow/AppChatWindow',
    '@/pageComponents/chat/ChatWindow/HomeChatWindow',
    '@/web/core/chat/context/chatPageContext',
    '@/pageComponents/chat/ChatAllApp',
    '@/web/support/user/useUserStore',
    '@/web/common/api/request',
    '@/web/support/user/auth',
    '@/web/core/ai/model/useUserModelStore'
  ]) {
    vi.doMock(name, () => ({
      default: () => null,
      useChatStore: vi.fn(),
      useSystemStore: vi.fn(),
      useUserStore: vi.fn(),
      ChatItemContext: {},
      ChatPageContext: {},
      ChatPageContextProvider: () => null,
      AUTH_ERROR_EVENT_NAME: 'fastgpt:auth-error',
      clearToken: vi.fn(),
      resetUserModelCatalogAfterLogin: vi.fn()
    }));
  }
  ({ getServerSideProps } = await import('@/pages/chat/index'));
});

describe('chat page session recovery bootstrap', () => {
  it.each([
    { cookies: { fastgpt_token: 'legacy' }, recover: true },
    { cookies: { fastgpt_session: 'user:device' }, recover: true },
    { cookies: {}, recover: false }
  ])(
    'recovers a known login after direct navigation or reload: $cookies',
    async ({ cookies, recover }) => {
      const result = await getServerSideProps({ query: {}, req: { cookies } });
      expect(result.props.shouldInitUserInfo).toBe(recover);
    }
  );
});
