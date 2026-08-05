import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerificationCodeTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';
import { sendAuthCode } from '@/web/support/user/api';

const mocks = vi.hoisted(() => ({
  setCodeCountDown: vi.fn()
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: () => [0, mocks.setCodeCountDown],
  useMemo: (fn: () => unknown) => fn()
}));

vi.mock('@/web/support/user/api', () => ({
  sendAuthCode: vi.fn()
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: (params: { username: string; captcha: string }) => Promise<void>) => ({
    runAsync: request,
    loading: false
  })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}));

vi.mock('@chakra-ui/react', () => ({
  Box: 'box',
  useDisclosure: () => ({
    isOpen: false,
    onOpen: vi.fn(),
    onClose: vi.fn()
  })
}));

vi.mock('ahooks', () => ({
  useMemoizedFn: (fn: unknown) => fn
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

vi.mock('@/components/support/user/safe/SendCodeAuthModal', () => ({ default: 'modal' }));

vi.stubGlobal('React', await import('react'));

const { useSendCode } = await import('@/web/support/user/hooks/useSendCode');

describe('useSendCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not include the username validator in the API payload', async () => {
    const validateBeforeSend = vi.fn(() => true as const);
    const { sendCode } = useSendCode({
      type: VerificationCodeTypeEnum.register,
      purpose: 'register',
      validateBeforeSend
    });

    await sendCode({ username: 'user@example.com', captcha: 'captcha' });

    expect(sendAuthCode).toHaveBeenCalledWith({
      username: 'user@example.com',
      type: VerificationCodeTypeEnum.register,
      purpose: 'register',
      captcha: 'captcha',
      lang: 'en'
    });
  });
});
