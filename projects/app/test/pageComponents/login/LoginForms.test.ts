import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleSubmit: vi.fn(),
  submit: vi.fn(),
  register: vi.fn(() => ({ name: 'field' })),
  isPlus: true,
  loginMethods: ['email'] as Array<'email' | 'phone'>,
  requesting: false,
  useSendCode: vi.fn()
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: vi.fn(),
  useRef: () => ({ current: undefined }),
  useCallback: (callback: unknown) => callback
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams()
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ query: {}, pathname: '/login', replace: vi.fn() })
}));

vi.mock('ahooks', () => ({
  useMount: vi.fn()
}));

vi.mock('@/pageComponents/login/LoginForm/FormLayout', () => ({ default: 'form-layout' }));
vi.mock('@/pageComponents/login/LoginForm/PolicyTip', () => ({ default: 'policy-tip' }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: 'icon' }));
vi.mock('@/components/support/user/safe/AccountVerificationPanel', () => ({
  AccountVerificationPanel: 'verification-panel'
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    register: mocks.register,
    handleSubmit: mocks.handleSubmit,
    getValues: vi.fn(),
    watch: vi.fn(),
    formState: { errors: {} }
  }),
  useWatch: vi.fn(() => '')
}));

vi.mock('@chakra-ui/react', () => ({
  Box: 'box',
  Button: 'button',
  Flex: 'flex',
  FormControl: 'form-control',
  Input: 'input'
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn(), loading: mocks.requesting })
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: {
      isPlus: mocks.isPlus,
      systemTitle: 'FastGPT',
      find_password_method: ['email']
    }
  })
}));

vi.mock('@/web/common/system/utils', () => ({
  getLoginMethods: () => (mocks.isPlus ? mocks.loginMethods : [])
}));

vi.mock('@/web/support/user/hooks/useSendCode', () => ({
  useSendCode: (params: unknown) => {
    mocks.useSendCode(params);
    return {
      SendCodeBox: 'send-code-box',
      openCodeAuthModal: false
    };
  }
}));

vi.mock('@/web/support/user/api', () => ({
  postFindPassword: vi.fn(),
  postLoginByCode: vi.fn()
}));

vi.mock('@/web/support/marketing/utils', () => ({
  getBdVId: vi.fn(),
  getFastGPTSem: vi.fn(),
  getMsclkid: vi.fn(),
  onFastGPTLoginSuccess: vi.fn()
}));

vi.stubGlobal('React', await import('react'));

const CodeLoginForm = (await import('@/pageComponents/login/LoginForm/CodeLoginForm')).default;
const ForgetPasswordForm = (await import('@/pageComponents/login/ForgetPasswordForm')).default;
const LoginForm = (await import('@/pageComponents/login/LoginForm/LoginForm')).default;

const findElement = (
  node: ReactNode,
  predicate: (element: ReactElement) => boolean
): ReactElement => {
  if (!node || typeof node !== 'object') throw new Error('Unable to find element');

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (predicate(element)) return element;

  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];
  for (const child of children) {
    try {
      return findElement(child, predicate);
    } catch {}
  }

  throw new Error('Unable to find element');
};

const forms = [
  ['login', LoginForm],
  ['code login', CodeLoginForm],
  ['password recovery', ForgetPasswordForm]
] as const;

describe.each(forms)('%s form Enter submission', (_name, Form) => {
  const renderForm = () =>
    Form({
      setPageType: vi.fn(),
      loginSuccess: vi.fn()
    });

  const getKeyDownHandler = () => {
    const form = renderForm();
    return findElement(
      form,
      (element) => element.type === 'box' && typeof element.props.onKeyDown === 'function'
    ).props.onKeyDown;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPlus = true;
    mocks.loginMethods = ['email'];
    mocks.requesting = false;
    mocks.handleSubmit.mockReturnValue(mocks.submit);
  });

  it('submits for an ordinary Enter key', () => {
    getKeyDownHandler()({
      key: 'Enter',
      shiftKey: false,
      keyCode: 13,
      nativeEvent: { isComposing: false }
    });

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(2);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an active IME composition', { keyCode: 13, nativeEvent: { isComposing: true } }],
    ['the IME fallback key code', { keyCode: 229, nativeEvent: { isComposing: false } }]
  ])('does not submit for %s', (_case, event) => {
    getKeyDownHandler()({
      key: 'Enter',
      shiftKey: false,
      ...event
    });

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('submits only after the IME candidate has been confirmed', () => {
    const onKeyDown = getKeyDownHandler();
    onKeyDown({
      key: 'Enter',
      shiftKey: false,
      keyCode: 229,
      nativeEvent: { isComposing: true }
    });
    expect(mocks.submit).not.toHaveBeenCalled();

    onKeyDown({
      key: 'Enter',
      shiftKey: false,
      keyCode: 13,
      nativeEvent: { isComposing: false }
    });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Shift+Enter', { key: 'Enter', shiftKey: true }],
    ['another key', { key: 'a', shiftKey: false }]
  ])('does not submit for %s', (_case, event) => {
    getKeyDownHandler()({
      ...event,
      keyCode: 13,
      nativeEvent: { isComposing: false }
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('does not submit again while a request is pending', () => {
    mocks.requesting = true;
    getKeyDownHandler()({
      key: 'Enter',
      shiftKey: false,
      keyCode: 13,
      nativeEvent: { isComposing: false }
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});

describe('code login method validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPlus = true;
    mocks.loginMethods = ['email'];
    mocks.handleSubmit.mockReturnValue(mocks.submit);
  });

  it('uses the enabled code-login methods for both the field and login send-code guard', () => {
    CodeLoginForm({
      setPageType: vi.fn(),
      loginSuccess: vi.fn()
    });

    const usernameOptions = mocks.register.mock.calls.find(([field]) => field === 'username')?.[1];
    const validateField = usernameOptions?.validate;
    const sendCodeParams = mocks.useSendCode.mock.calls[0]?.[0];
    const validateBeforeSend = sendCodeParams?.validateBeforeSend;

    expect(sendCodeParams).toMatchObject({
      type: 'login',
      purpose: 'login'
    });
    expect(validateField('user@example.com')).toBe(true);
    expect(validateField('13800138000')).toBe('common:error.registration_method_not_supported');
    expect(validateField('invalid-account')).toBe('user:password.email_phone_error');
    expect(validateBeforeSend('user@example.com')).toBe(true);
    expect(validateBeforeSend('13800138000')).toBe(
      'common:error.registration_method_not_supported'
    );
    expect(validateBeforeSend('invalid-account')).toBe('user:password.email_phone_error');
  });

  it('does not render the standalone registration link and uses fixed community placeholders when not Plus', () => {
    const rendered = LoginForm({
      setPageType: vi.fn(),
      loginSuccess: vi.fn()
    });
    const commercialJson = JSON.stringify(rendered);
    expect(commercialJson).not.toContain('login:register');
    expect(commercialJson).toContain(
      'common:support.user.login.Username/common:support.user.login.Email'
    );

    mocks.isPlus = false;
    const communityJson = JSON.stringify(
      LoginForm({
        setPageType: vi.fn(),
        loginSuccess: vi.fn()
      })
    );
    expect(communityJson).toContain('login:use_root_login');
    expect(communityJson).toContain('login:root_password_placeholder');
  });
});

describe('password recovery send-code guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleSubmit.mockReturnValue(mocks.submit);
  });

  it('blocks non email/phone accounts before requesting the auth code', () => {
    ForgetPasswordForm({
      setPageType: vi.fn(),
      loginSuccess: vi.fn()
    });

    const validateBeforeSend = mocks.useSendCode.mock.calls[0]?.[0]?.validateBeforeSend;

    expect(validateBeforeSend('user@example.com')).toBe(true);
    expect(validateBeforeSend('13800138000')).toBe(true);
    expect(validateBeforeSend('invalid-account')).toBe('user:password.email_phone_error');
  });
});
