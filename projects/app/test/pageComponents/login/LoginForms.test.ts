import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleSubmit: vi.fn(),
  submit: vi.fn(),
  register: vi.fn(() => ({ name: 'field' })),
  registerMethods: ['email'] as Array<'email' | 'phone'>,
  useSendCode: vi.fn()
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    register: mocks.register,
    handleSubmit: mocks.handleSubmit,
    getValues: vi.fn(),
    watch: vi.fn(),
    formState: { errors: {} }
  })
}));

vi.mock('@chakra-ui/react', () => ({
  Box: 'box',
  Button: 'button',
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
  useRequest: () => ({ runAsync: vi.fn(), loading: false })
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: {
      systemTitle: 'FastGPT',
      find_password_method: ['email']
    }
  })
}));

vi.mock('@/web/common/system/utils', () => ({
  getRegisterMethods: () => mocks.registerMethods
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
  postRegister: vi.fn()
}));

vi.mock('@/web/support/marketing/utils', () => ({
  getBdVId: vi.fn(),
  getFastGPTSem: vi.fn(),
  getMsclkid: vi.fn(),
  onFastGPTLoginSuccess: vi.fn()
}));

vi.stubGlobal('React', await import('react'));

const RegisterForm = (await import('@/pageComponents/login/RegisterForm')).default;
const ForgetPasswordForm = (await import('@/pageComponents/login/ForgetPasswordForm')).default;

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
  ['registration', RegisterForm],
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
    mocks.registerMethods = ['email'];
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
});

describe('registration method validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerMethods = ['email'];
    mocks.handleSubmit.mockReturnValue(mocks.submit);
  });

  it('uses the enabled registration methods for both the field and send-code guard', () => {
    RegisterForm({
      setPageType: vi.fn(),
      loginSuccess: vi.fn()
    });

    const usernameOptions = mocks.register.mock.calls.find(([field]) => field === 'username')?.[1];
    const validateField = usernameOptions?.validate;
    const validateBeforeSend = mocks.useSendCode.mock.calls[0]?.[0]?.validateBeforeSend;

    expect(validateField('user@example.com')).toBe(true);
    expect(validateField('13800138000')).toBe('common:error.registration_method_not_supported');
    expect(validateField('invalid-account')).toBe('user:password.email_phone_error');
    expect(validateBeforeSend('user@example.com')).toBe(true);
    expect(validateBeforeSend('13800138000')).toBe(
      'common:error.registration_method_not_supported'
    );
    expect(validateBeforeSend('invalid-account')).toBe('user:password.email_phone_error');
  });
});
