import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Center,
  Image,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
  Text,
  VStack,
  useDisclosure
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { AccountVerificationMethod } from '@fastgpt/global/support/user/account/verification/type';
import { OAuthAccountVerificationProviderSchema } from '@fastgpt/global/support/user/account/verification/type';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import type {
  CreatePasswordVerificationBody,
  CreatePasswordVerificationResponse,
  PasswordAuthorizationResponse,
  SensitiveAccountVerificationBody
} from '@fastgpt/global/openapi/support/user/account/password/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SendCodeAuthModal from './SendCodeAuthModal';
import { getClientToken } from '@/web/support/user/hooks/useSendCode';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  isAccountVerificationCodeError,
  isAccountVerificationRateLimitError
} from '@/web/support/user/account/verification/error';

type AuthorizedPasswordChange = Extract<PasswordAuthorizationResponse, { status: 'authorized' }>;

type Props = {
  method: AccountVerificationMethod;
  username: string;
  required: boolean;
  returnRoute: string;
  createVerification: (
    body: CreatePasswordVerificationBody
  ) => Promise<CreatePasswordVerificationResponse>;
  consumeVerification: (
    verification: SensitiveAccountVerificationBody
  ) => Promise<PasswordAuthorizationResponse>;
  onAuthorized: (authorization: AuthorizedPasswordChange) => void;
};

const isOAuthMethod = (
  method: AccountVerificationMethod
): method is Extract<AccountVerificationMethod, `oauth/${string}`> => method.startsWith('oauth/');

/** 渲染服务端指定的唯一账号验证方式，并统一处理材料创建、消费和 Provider 跳转。 */
export const AccountVerificationPanel = ({
  method,
  username,
  required,
  returnRoute,
  createVerification,
  consumeVerification,
  onAuthorized
}: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { isOpen: isCaptchaOpen, onOpen: onOpenCaptcha, onClose: onCloseCaptcha } = useDisclosure();
  const [code, setCode] = useState('');
  const [codeCountDown, setCodeCountDown] = useState(0);
  const [codeSending, setCodeSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [preLoginCode, setPreLoginCode] = useState<string>();
  const [wechatQR, setWechatQR] =
    useState<Extract<CreatePasswordVerificationResponse, { method: 'wechat' }>>();
  const [wechatNow, setWechatNow] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const createRequested = useRef(false);
  const wechatPolling = useRef(false);

  const showVerificationFailure = useCallback(
    (error?: unknown) => {
      toast({
        status: 'error',
        title: isAccountVerificationCodeError(error)
          ? t('common:error.code_error')
          : isAccountVerificationRateLimitError(error)
            ? t('common:error.operation_too_frequently')
            : t('common:password_verification_failed')
      });
    },
    [t, toast]
  );

  const submitVerification = useCallback(
    async (verification: SensitiveAccountVerificationBody) => {
      const result = await consumeVerification(verification);
      if (result.status === 'authorized') {
        onAuthorized(result);
        return true;
      }
      return result.status === 'verificationPending' ? false : Promise.reject();
    },
    [consumeVerification, onAuthorized]
  );

  const createBoundVerification = useCallback(async () => {
    if (method !== 'oldPassword' && method !== 'wechat') return;
    setCreating(true);
    setCreateFailed(false);
    try {
      const result = await createVerification({ method, payload: {} });
      if (result.method === 'oldPassword') {
        setPreLoginCode(result.preLoginCode);
      } else if (result.method === 'wechat') {
        setWechatQR(result);
        setWechatNow(Date.now());
      }
    } catch (error) {
      setCreateFailed(true);
      showVerificationFailure(error);
    } finally {
      setCreating(false);
    }
  }, [createVerification, method, showVerificationFailure]);

  useEffect(() => {
    if ((method !== 'oldPassword' && method !== 'wechat') || createRequested.current) return;
    createRequested.current = true;
    void createBoundVerification();
  }, [createBoundVerification, method]);

  useEffect(() => {
    if (codeCountDown <= 0) return;
    const timer = window.setTimeout(() => setCodeCountDown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCountDown]);

  const wechatExpired =
    !!wechatQR?.expiredAt && new Date(wechatQR.expiredAt).getTime() <= wechatNow;

  useEffect(() => {
    if (!wechatQR?.expiredAt) return;
    const timer = window.setInterval(() => setWechatNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [wechatQR?.expiredAt]);

  useEffect(() => {
    if (!wechatQR || wechatExpired) return;
    let disposed = false;

    const pollVerification = async () => {
      if (wechatPolling.current) return;
      wechatPolling.current = true;
      try {
        const authorized = await submitVerification({
          method: 'wechat',
          payload: { code: wechatQR.code }
        });
        if (authorized) disposed = true;
      } catch (error) {
        disposed = true;
        setWechatQR(undefined);
        setCreateFailed(true);
        showVerificationFailure(error);
      } finally {
        wechatPolling.current = false;
      }
    };

    void pollVerification();
    const timer = window.setInterval(() => {
      if (!disposed) void pollVerification();
    }, 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [showVerificationFailure, submitVerification, wechatExpired, wechatQR]);

  const sendCode = async ({ captcha }: { username: string; captcha: string }) => {
    if (method !== 'code') return;
    setCodeSending(true);
    try {
      const googleToken = await getClientToken(feConfigs.googleClientVerKey);
      const result = await createVerification({
        method,
        payload: { captcha, googleToken }
      });
      if (result.method !== 'code') throw new Error('Verification method mismatch');
      setCodeCountDown(60);
      toast({ status: 'success', title: t('common:password_code_sent') });
    } catch (error) {
      showVerificationFailure(error);
      throw new Error('Failed to send verification code');
    } finally {
      setCodeSending(false);
    }
  };

  const submitCode = useCallback(
    async (verificationCode: string) => {
      if (method !== 'code' || verificationCode.length !== 6 || submitting) return;
      setSubmitting(true);
      try {
        await submitVerification({ method, payload: { code: verificationCode } });
      } catch (error) {
        showVerificationFailure(error);
      } finally {
        setSubmitting(false);
      }
    },
    [method, showVerificationFailure, submitVerification, submitting]
  );

  const submitOldPassword = async () => {
    if (method !== 'oldPassword' || !oldPassword || !preLoginCode) return;
    setSubmitting(true);
    try {
      await submitVerification({
        method,
        payload: { password: hashStr(oldPassword), preLoginCode }
      });
    } catch (error) {
      // 预登录材料在密码校验前即被一次性消费，失败后必须重新创建才能再次尝试。
      setOldPassword('');
      setPreLoginCode(undefined);
      showVerificationFailure(error);
      void createBoundVerification();
    } finally {
      setSubmitting(false);
    }
  };

  const submitOAuth = async () => {
    if (!isOAuthMethod(method)) return;
    setSubmitting(true);
    try {
      const callbackUrl = `${window.location.origin}/login/provider`;
      const result = await createVerification({
        method,
        payload: {
          callbackUrl,
          isWecomWorkTerminal: checkIsWecomTerminal()
        }
      });
      if (result.method !== method) throw new Error('Verification method mismatch');
      const provider = OAuthAccountVerificationProviderSchema.parse(method.slice('oauth/'.length));
      useSystemStore.getState().setLoginStore({
        provider,
        lastRoute: returnRoute,
        state: result.state,
        callbackUrl,
        flow: 'passwordChange',
        passwordChangeRequired: required
      });
      await router.replace(result.url);
    } catch (error) {
      setSubmitting(false);
      showVerificationFailure(error);
    }
  };

  const retryCreate = () => {
    createRequested.current = true;
    void createBoundVerification();
  };

  if (method === 'code') {
    return (
      <VStack align="stretch" spacing={6}>
        <Input
          h={10}
          value={username}
          isDisabled
          bg="myGray.25"
          borderColor="myGray.100"
          _disabled={{ opacity: 1, color: 'myGray.400', cursor: 'default' }}
          aria-label={t('common:user.Account')}
        />
        <InputGroup>
          <Input
            h={10}
            pr="120px"
            value={code}
            isDisabled={submitting}
            inputMode="numeric"
            maxLength={6}
            bg="myGray.50"
            borderColor="myGray.200"
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-label={t('common:support.user.info.verification_code')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitCode(code.trim());
            }}
          />
          <InputRightElement h={10} w="120px" justifyContent="flex-end" pr={3}>
            <Button
              h="18px"
              minW={0}
              p={0}
              variant="unstyled"
              color={codeCountDown > 0 ? 'myGray.400' : 'primary.700'}
              fontSize="mini"
              isDisabled={codeSending || submitting || codeCountDown > 0}
              onClick={onOpenCaptcha}
            >
              {codeSending
                ? t('common:password_code_sending')
                : codeCountDown > 0
                  ? t('common:password_code_countdown', { seconds: codeCountDown })
                  : t('common:password_send_code')}
            </Button>
          </InputRightElement>
        </InputGroup>
        <Button
          h={10}
          w="100%"
          isLoading={submitting}
          isDisabled={code.trim().length !== 6}
          onClick={() => void submitCode(code.trim())}
        >
          {t('common:password_verify')}
        </Button>
        {isCaptchaOpen && (
          <SendCodeAuthModal
            username={username}
            onClose={onCloseCaptcha}
            onSending={codeSending}
            onSendCode={sendCode}
          />
        )}
      </VStack>
    );
  }

  if (method === 'oldPassword') {
    return (
      <VStack align="stretch" spacing={6}>
        <Input
          h={10}
          value={username}
          isDisabled
          bg="myGray.25"
          borderColor="myGray.100"
          _disabled={{ opacity: 1, color: 'myGray.400', cursor: 'default' }}
          aria-label={t('common:user.Account')}
        />
        <VStack align="stretch" spacing={6}>
          {creating ? (
            <Center h="104px">
              <Spinner color="primary.600" />
            </Center>
          ) : createFailed || !preLoginCode ? (
            <Center h="104px">
              <Button w="100%" onClick={retryCreate}>
                {t('common:password_verification_retry')}
              </Button>
            </Center>
          ) : (
            <>
              <Input
                h={10}
                type="password"
                value={oldPassword}
                bg="myGray.50"
                borderColor="myGray.200"
                onChange={(event) => setOldPassword(event.target.value)}
                placeholder={t('common:password_old_placeholder')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitOldPassword();
                }}
              />
              <Button
                h={10}
                w="100%"
                isLoading={submitting}
                isDisabled={!oldPassword}
                onClick={() => void submitOldPassword()}
              >
                {t('common:password_verify')}
              </Button>
            </>
          )}
        </VStack>
      </VStack>
    );
  }

  if (method === 'wechat') {
    return (
      <VStack w={['100%', '380px']} mx="auto" spacing={6}>
        <Text color="myGray.600" fontSize="md" fontWeight="medium" lineHeight={6}>
          {t('common:password_wechat_scan')}
        </Text>
        <Center
          w="226px"
          h="226px"
          overflow="hidden"
          bg="#fbfbfb"
          borderWidth="1px"
          borderColor="borderColor.low"
          borderRadius="md"
          p={1}
        >
          {creating ? (
            <Spinner color="primary.600" />
          ) : wechatQR && !wechatExpired ? (
            <Image
              src={wechatQR.codeUrl}
              alt={t('common:password_wechat_qr')}
              w="100%"
              h="100%"
              objectFit="contain"
            />
          ) : (
            <VStack spacing={3} px={4}>
              <Text color="myGray.600" fontSize="sm" textAlign="center">
                {t(
                  createFailed
                    ? 'common:password_wechat_load_failed'
                    : 'common:password_wechat_expired'
                )}
              </Text>
              <Button size="sm" onClick={retryCreate}>
                {t('common:password_verification_retry')}
              </Button>
            </VStack>
          )}
        </Center>
      </VStack>
    );
  }

  const provider = method.slice('oauth/'.length).toLowerCase();
  const providerLabel = (() => {
    if (provider === 'github') return 'GitHub';
    if (provider === 'google') return 'Google';
    if (provider === 'microsoft') return 'Microsoft';
    if (provider === 'wecom') return 'WeCom';
    return feConfigs.sso?.title ?? 'SSO';
  })();

  return (
    <Box>
      <Input
        h={10}
        value={username}
        isDisabled
        bg="myGray.25"
        borderColor="myGray.100"
        _disabled={{ opacity: 1, color: 'myGray.400', cursor: 'default' }}
        aria-label={t('common:user.Account')}
      />
      <Button mt={6} h={10} w="100%" isLoading={submitting} onClick={() => void submitOAuth()}>
        {t('common:password_oauth_start', { provider: providerLabel })}
      </Button>
    </Box>
  );
};
