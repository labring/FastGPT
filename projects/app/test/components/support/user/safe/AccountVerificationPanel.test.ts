import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type ChakraProviderComponent = (typeof import('@chakra-ui/react'))['ChakraProvider'];
type AccountVerificationPanelComponent =
  (typeof import('@/components/support/user/safe/AccountVerificationPanel'))['AccountVerificationPanel'];

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  setLoginStore: vi.fn(),
  checkIsWecomTerminal: vi.fn()
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mocks.replace })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (!key.startsWith('common:')) throw new Error(`Unexpected i18n namespace: ${key}`);
      return key;
    }
  })
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('@fastgpt/global/support/user/login/constants', () => ({
  checkIsWecomTerminal: mocks.checkIsWecomTerminal
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: Object.assign(() => ({ feConfigs: {} }), {
    getState: () => ({ setLoginStore: mocks.setLoginStore })
  })
}));

vi.mock('@/components/support/user/safe/SendCodeAuthModal', () => ({
  default: ({
    onSendCode
  }: {
    onSendCode: (data: { username: string; captcha: string }) => Promise<void>;
  }) => {
    const ReactRuntime = (globalThis as any).React as typeof React;
    return ReactRuntime.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'send-code-modal-submit',
        onClick: () => {
          void onSendCode({ username: '13800138000', captcha: 'captcha-code' }).catch(() => {});
        }
      },
      'send-code'
    );
  }
}));

describe('AccountVerificationPanel', () => {
  let dom: JSDOM;
  let createRoot: typeof import('react-dom/client').createRoot;
  let ChakraProvider: ChakraProviderComponent;
  let AccountVerificationPanel: AccountVerificationPanelComponent;
  let container: HTMLDivElement;
  let root: Root;

  const flushEffects = async () => {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  };

  const changeInput = (input: HTMLInputElement, value: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!valueSetter) throw new Error('HTMLInputElement value setter is unavailable');

    act(() => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.example.com/account/info'
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
    // 生产构建会注入 JSX runtime，Vitest 直接转换该 TSX 时需显式提供 React。
    vi.stubGlobal('React', React);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    ({ createRoot } = await import('react-dom/client'));
    ({ ChakraProvider } = await import('@chakra-ui/react'));
    ({ AccountVerificationPanel } =
      await import('@/components/support/user/safe/AccountVerificationPanel'));
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkIsWecomTerminal.mockReturnValue(false);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('recreates one-time old-password material after a failed password attempt', async () => {
    const createVerification = vi
      .fn()
      .mockResolvedValueOnce({ method: 'oldPassword', preLoginCode: 'pre-login-code-1' })
      .mockResolvedValue({ method: 'oldPassword', preLoginCode: 'pre-login-code-2' });
    const authorization = {
      status: 'authorized' as const,
      token: 'password-change-token',
      expiredAt: '2026-07-22T08:05:00.000Z'
    };
    const consumeVerification = vi
      .fn()
      .mockRejectedValueOnce(new Error('Wrong password'))
      .mockResolvedValueOnce(authorization);
    const onAuthorized = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          undefined,
          React.createElement(AccountVerificationPanel, {
            method: 'oldPassword',
            username: 'local-user',
            required: false,
            returnRoute: '/account/info',
            createVerification,
            consumeVerification,
            onAuthorized
          })
        )
      );
    });
    await flushEffects();

    const accountInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="common:user.Account"]'
    );
    const firstInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="common:password_old_placeholder"]'
    );
    const firstButton = container.querySelector('button');
    if (!firstInput || !firstButton) throw new Error('Old password controls did not render');
    expect(accountInput?.value).toBe('local-user');
    expect(accountInput?.disabled).toBe(true);
    expect(document.activeElement).not.toBe(firstInput);

    changeInput(firstInput, 'Wrong-password-123');
    act(() => firstButton.click());
    await flushEffects();

    expect(consumeVerification).toHaveBeenNthCalledWith(1, {
      method: 'oldPassword',
      payload: {
        password: hashStr('Wrong-password-123'),
        preLoginCode: 'pre-login-code-1'
      }
    });
    expect(createVerification).toHaveBeenCalledTimes(2);

    const retryInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="common:password_old_placeholder"]'
    );
    const retryButton = container.querySelector('button');
    if (!retryInput || !retryButton) throw new Error('Retry controls did not render');
    expect(retryInput.value).toBe('');

    changeInput(retryInput, 'Correct-password-123');
    act(() => retryButton.click());
    await flushEffects();

    expect(consumeVerification).toHaveBeenNthCalledWith(2, {
      method: 'oldPassword',
      payload: {
        password: hashStr('Correct-password-123'),
        preLoginCode: 'pre-login-code-2'
      }
    });
    expect(onAuthorized).toHaveBeenCalledWith(authorization);
  });

  it('does not auto-submit a six-digit code and submits from the verify button', async () => {
    const createVerification = vi.fn();
    const authorization = {
      status: 'authorized' as const,
      token: 'password-change-token',
      expiredAt: '2026-07-22T08:05:00.000Z'
    };
    const consumeVerification = vi.fn().mockResolvedValue(authorization);
    const onAuthorized = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          undefined,
          React.createElement(AccountVerificationPanel, {
            method: 'code',
            username: '13800138000',
            required: false,
            returnRoute: '/account/info',
            createVerification,
            consumeVerification,
            onAuthorized
          })
        )
      );
    });
    await flushEffects();

    const codeInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="common:support.user.info.verification_code"]'
    );
    const verifyButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'common:password_verify'
    );
    if (!codeInput || !verifyButton) throw new Error('Verification code controls did not render');

    expect(verifyButton.disabled).toBe(true);

    changeInput(codeInput, '12345');
    await flushEffects();
    expect(consumeVerification).not.toHaveBeenCalled();
    expect(verifyButton.disabled).toBe(true);

    changeInput(codeInput, '123456');
    await flushEffects();
    expect(consumeVerification).not.toHaveBeenCalled();
    expect(verifyButton.disabled).toBe(false);

    act(() => verifyButton.click());
    await flushEffects();

    expect(consumeVerification).toHaveBeenCalledWith({
      method: 'code',
      payload: { code: '123456' }
    });
    expect(onAuthorized).toHaveBeenCalledWith(authorization);
  });

  it('keeps an invalid verification code and shows the code error', async () => {
    const consumeVerification = vi.fn().mockRejectedValue({
      statusText: UserErrEnum.invalidVerificationCode,
      message: 'common:error.code_error'
    });

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          undefined,
          React.createElement(AccountVerificationPanel, {
            method: 'code',
            username: '13800138000',
            required: false,
            returnRoute: '/account/info',
            createVerification: vi.fn(),
            consumeVerification,
            onAuthorized: vi.fn()
          })
        )
      );
    });
    await flushEffects();

    const codeInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="common:support.user.info.verification_code"]'
    );
    const verifyButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'common:password_verify'
    );
    if (!codeInput || !verifyButton) throw new Error('Verification code controls did not render');

    changeInput(codeInput, '123456');
    act(() => verifyButton.click());
    await flushEffects();

    expect(consumeVerification).toHaveBeenCalledWith({
      method: 'code',
      payload: { code: '123456' }
    });
    expect(codeInput.value).toBe('123456');
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'common:error.code_error'
    });
    expect(mocks.toast).not.toHaveBeenCalledWith({
      status: 'error',
      title: 'common:password_verification_failed'
    });
  });

  it('shows the rate-limit message when sending a verification code too frequently', async () => {
    const createVerification = vi.fn().mockRejectedValue({
      code: 503006,
      statusText: UserErrEnum.sendVerificationCodeTooFrequently,
      message: 'common:error.send_auth_code_too_frequently'
    });

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          undefined,
          React.createElement(AccountVerificationPanel, {
            method: 'code',
            username: '13800138000',
            required: false,
            returnRoute: '/account/info',
            createVerification,
            consumeVerification: vi.fn(),
            onAuthorized: vi.fn()
          })
        )
      );
    });
    await flushEffects();

    const openCaptchaButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'common:password_send_code'
    );
    if (!openCaptchaButton) throw new Error('Send-code button did not render');

    act(() => openCaptchaButton.click());
    await flushEffects();

    const sendCodeButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="send-code-modal-submit"]'
    );
    if (!sendCodeButton) throw new Error('Send-code modal did not render');

    act(() => sendCodeButton.click());
    await flushEffects();

    expect(createVerification).toHaveBeenCalledWith({
      method: 'code',
      payload: { captcha: 'captcha-code', googleToken: '' }
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'common:error.operation_too_frequently'
    });
    expect(mocks.toast).not.toHaveBeenCalledWith({
      status: 'error',
      title: 'common:password_verification_failed'
    });
  });

  it('passes the WeCom terminal flag when creating OAuth verification', async () => {
    mocks.checkIsWecomTerminal.mockReturnValue(true);
    const createVerification = vi.fn().mockResolvedValue({
      method: 'oauth/sso',
      state: 'oauth-state-value',
      url: 'https://sso.example.com/authorize'
    });

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          undefined,
          React.createElement(AccountVerificationPanel, {
            method: 'oauth/sso',
            username: 'wecom-user',
            required: true,
            returnRoute: '/account/info',
            createVerification,
            consumeVerification: vi.fn(),
            onAuthorized: vi.fn()
          })
        )
      );
    });
    await flushEffects();

    const oauthButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'common:password_oauth_start'
    );
    if (!oauthButton) throw new Error('OAuth verification button did not render');

    act(() => oauthButton.click());
    await flushEffects();

    expect(mocks.checkIsWecomTerminal).toHaveBeenCalledOnce();
    expect(createVerification).toHaveBeenCalledWith({
      method: 'oauth/sso',
      payload: {
        callbackUrl: 'https://fastgpt.example.com/login/provider',
        isWecomWorkTerminal: true
      }
    });
    expect(mocks.replace).toHaveBeenCalledWith('https://sso.example.com/authorize');
  });
});
