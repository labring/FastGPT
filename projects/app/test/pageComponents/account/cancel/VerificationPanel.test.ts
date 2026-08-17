import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type ChakraProviderComponent = (typeof import('@chakra-ui/react'))['ChakraProvider'];
type VerificationPanelComponent =
  (typeof import('@/pageComponents/account/cancel/VerificationPanel'))['VerificationPanel'];

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  setLoginStore: vi.fn(),
  checkIsWecomTerminal: vi.fn(),
  createAccountCancellationVerification: vi.fn(),
  submitAccountCancellation: vi.fn()
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mocks.replace })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('@fastgpt/global/support/user/login/constants', () => ({
  checkIsWecomTerminal: mocks.checkIsWecomTerminal
}));

vi.mock('@/web/support/user/account/cancellation/api', () => ({
  createAccountCancellationVerification: mocks.createAccountCancellationVerification,
  submitAccountCancellation: mocks.submitAccountCancellation
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: Object.assign(
    () => ({
      feConfigs: {
        sso: { title: 'Corporate SSO' },
        accountVerification: {
          accountCancellation: {
            emailCode: false,
            phoneCode: false,
            accountCancellation: true,
            wechat: false,
            oauth: {
              github: false,
              google: false,
              microsoft: false,
              wecom: false,
              sso: true
            }
          }
        }
      }
    }),
    {
      getState: () => ({ setLoginStore: mocks.setLoginStore })
    }
  )
}));

vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { username: 'wecom-user' } })
}));

vi.mock('@/components/support/user/safe/SendCodeAuthModal', () => ({
  default: () => null
}));

describe('Account cancellation VerificationPanel', () => {
  let dom: JSDOM;
  let createRoot: typeof import('react-dom/client').createRoot;
  let ChakraProvider: ChakraProviderComponent;
  let VerificationPanel: VerificationPanelComponent;
  let container: HTMLDivElement;
  let root: Root;

  const flushEffects = async () => {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  };

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.example.com/account/cancel'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(Date.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => dom.window.clearTimeout(handle));
    vi.stubGlobal('React', React);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    ({ createRoot } = await import('react-dom/client'));
    ({ ChakraProvider } = await import('@chakra-ui/react'));
    ({ VerificationPanel } = await import('@/pageComponents/account/cancel/VerificationPanel'));
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkIsWecomTerminal.mockReturnValue(true);
    mocks.createAccountCancellationVerification.mockResolvedValue({
      method: 'oauth/sso',
      state: 'oauth-state-value',
      url: 'https://sso.example.com/authorize'
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('passes the WeCom terminal flag when creating OAuth verification', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          undefined,
          React.createElement(VerificationPanel, { onSubmitted: vi.fn() })
        )
      );
    });
    await flushEffects();

    const oauthButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'account_info:account_cancellation_oauth_start'
    );
    if (!oauthButton) throw new Error('OAuth verification button did not render');

    act(() => oauthButton.click());
    await flushEffects();

    expect(mocks.checkIsWecomTerminal).toHaveBeenCalledOnce();
    expect(mocks.createAccountCancellationVerification).toHaveBeenCalledWith({
      method: 'oauth/sso',
      payload: {
        callbackUrl: 'https://fastgpt.example.com/login/provider',
        isWecomWorkTerminal: true
      }
    });
    expect(mocks.replace).toHaveBeenCalledWith('https://sso.example.com/authorize');
  });
});
