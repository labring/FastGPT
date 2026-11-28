import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  router: {
    pathname: '/login',
    query: {} as Record<string, string>,
    replace: vi.fn()
  },
  formValues: {
    username: 'manual@example.com',
    password: 'manual-password'
  },
  getPreLogin: vi.fn(),
  postLogin: vi.fn(),
  verifyLoginVerificationCode: vi.fn(),
  submitCodeVerification: undefined as ((code: string) => Promise<string>) | undefined,
  onModalClose: undefined as (() => void) | undefined,
  toast: vi.fn()
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams
}));

vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' }
  })
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    register: (name: string) => ({ name }),
    handleSubmit: (callback: (data: { username: string; password: string }) => unknown) => () =>
      callback({ ...mocks.formValues }),
    formState: { errors: {} }
  })
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (
    service: (...args: any[]) => Promise<any>,
    options?: { onError?: (error: any) => void }
  ) => ({
    loading: false,
    runAsync: async (...args: any[]) => {
      try {
        return await service(...args);
      } catch (error) {
        options?.onError?.(error);
        return undefined;
      }
    }
  })
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: {
      isPlus: true,
      login_method: ['email'],
      find_password_method: ['email']
    }
  })
}));

vi.mock('@/web/support/user/api', () => ({
  getPreLogin: mocks.getPreLogin,
  postLogin: mocks.postLogin,
  getLoginVerificationCaptcha: vi.fn(),
  sendLoginVerificationCode: vi.fn(),
  verifyLoginVerificationCode: mocks.verifyLoginVerificationCode
}));

vi.mock('@/pageComponents/login/LoginForm/FormLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children)
}));

vi.mock('@/pageComponents/login/LoginForm/PolicyTip', () => ({
  default: () => null
}));

vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: () => null
}));

vi.mock('@/components/support/user/safe/AccountVerificationPanel', () => ({
  AccountVerificationPanel: ({
    submitCodeVerification
  }: {
    submitCodeVerification: (code: string) => Promise<string>;
  }) => {
    mocks.submitCodeVerification = submitCodeVerification;
    return React.createElement('div', { 'data-testid': 'verification-panel' });
  }
}));

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children, onKeyDown, onClick }: any) =>
    React.createElement('div', { onKeyDown, onClick }, children),
  Button: ({ children, type, onClick }: any) =>
    React.createElement('button', { type, onClick }, children),
  Flex: ({ children }: any) => React.createElement('div', null, children),
  FormControl: ({ children }: any) => React.createElement('div', null, children),
  Input: ({ name, type }: any) => React.createElement('input', { name, type }),
  Modal: ({
    isOpen,
    onClose,
    children
  }: {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    mocks.onModalClose = onClose;
    return React.createElement('div', { 'data-testid': 'verification-modal' }, children);
  },
  ModalOverlay: () => null,
  ModalContent: ({ children }: any) => React.createElement('div', null, children),
  Portal: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  VStack: ({ children }: any) => React.createElement('div', null, children)
}));

const LoginForm = (await import('@/pageComponents/login/LoginForm/LoginForm')).default;

describe('LoginForm auto-login submission attribution', () => {
  let root: Root;
  let container: HTMLDivElement;

  const flushMicrotasks = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const clickManualSubmit = async () => {
    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    await flushMicrotasks();
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/login'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams('u=auto%40example.com&p=secret');
    mocks.router.query = { u: 'auto@example.com', p: 'secret' };
    mocks.formValues = { username: 'manual@example.com', password: 'manual-password' };
    mocks.submitCodeVerification = undefined;
    mocks.onModalClose = undefined;
    mocks.getPreLogin.mockResolvedValue({ code: 'pre-code' });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('marks direct auto-login and 2FA-completed auto-login with skipLastLoginMethod=true', async () => {
    const loginSuccess = vi.fn().mockResolvedValue(undefined);
    mocks.postLogin.mockResolvedValueOnce({
      user: { _id: 'u-direct' },
      token: 'tok-direct'
    });

    await act(async () => {
      root.render(React.createElement(LoginForm, { setPageType: vi.fn(), loginSuccess }));
    });
    await flushMicrotasks();

    expect(loginSuccess).toHaveBeenCalledWith(
      { user: { _id: 'u-direct' }, token: 'tok-direct' },
      { skipLastLoginMethod: true }
    );

    loginSuccess.mockClear();
    await act(async () => root.unmount());
    root = createRoot(container);

    mocks.postLogin.mockResolvedValueOnce({
      status: 'verification_required',
      challenge: 'chal-1',
      maskedTarget: 'a***@example.com',
      expiredAt: new Date(Date.now() + 60_000).toISOString()
    });
    mocks.verifyLoginVerificationCode.mockResolvedValueOnce({
      user: { _id: 'u-2fa' },
      token: 'tok-2fa'
    });

    await act(async () => {
      root.render(React.createElement(LoginForm, { setPageType: vi.fn(), loginSuccess }));
    });
    await flushMicrotasks();

    await act(async () => {
      await mocks.submitCodeVerification?.('123456');
    });

    expect(loginSuccess).toHaveBeenCalledWith(
      { user: { _id: 'u-2fa' }, token: 'tok-2fa' },
      { skipLastLoginMethod: true }
    );
  });

  it('records last login method when user exits auto-login 2FA and submits manually in place', async () => {
    const loginSuccess = vi.fn().mockResolvedValue(undefined);
    mocks.postLogin
      .mockResolvedValueOnce({
        status: 'verification_required',
        challenge: 'chal-2',
        maskedTarget: 'a***@example.com',
        expiredAt: new Date(Date.now() + 60_000).toISOString()
      })
      .mockResolvedValueOnce({
        user: { _id: 'u-manual' },
        token: 'tok-manual'
      });

    await act(async () => {
      root.render(React.createElement(LoginForm, { setPageType: vi.fn(), loginSuccess }));
    });
    await flushMicrotasks();

    await act(async () => {
      mocks.onModalClose?.();
    });

    await clickManualSubmit();

    expect(loginSuccess).toHaveBeenCalledWith(
      { user: { _id: 'u-manual' }, token: 'tok-manual' },
      { skipLastLoginMethod: false }
    );
  });

  it('records last login method when auto-login fails with password error and user retries manually', async () => {
    const loginSuccess = vi.fn().mockResolvedValue(undefined);
    mocks.postLogin
      .mockRejectedValueOnce({ statusText: UserErrEnum.account_psw_error })
      .mockResolvedValueOnce({
        user: { _id: 'u-retry' },
        token: 'tok-retry'
      });

    await act(async () => {
      root.render(React.createElement(LoginForm, { setPageType: vi.fn(), loginSuccess }));
    });
    await flushMicrotasks();
    expect(mocks.router.replace).toHaveBeenCalledOnce();

    await clickManualSubmit();

    expect(loginSuccess).toHaveBeenCalledWith(
      { user: { _id: 'u-retry' }, token: 'tok-retry' },
      { skipLastLoginMethod: false }
    );
  });
});
