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
import type {
  AccountVerificationMethod,
  CaptchaVerificationPurpose
} from '@fastgpt/global/support/user/account/verification/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SendCodeAuthModal from './SendCodeAuthModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  isAccountVerificationCodeError,
  isAccountVerificationRateLimitError,
  isRetryableAccountVerificationPollingError
} from '@/web/support/user/account/verification/error';

export type WechatVerificationMaterial = {
  code: string;
  codeUrl: string;
  expiredAt?: string;
};

export type VerificationSubmitResult = 'verified' | 'pending' | 'expired';

type Props = {
  method: AccountVerificationMethod;
  username: string;
  purpose: CaptchaVerificationPurpose;
  createCodeVerification: (captcha: string) => Promise<void>;
  submitCodeVerification: (code: string) => Promise<VerificationSubmitResult>;
  createOldPasswordVerification?: () => Promise<string>;
  submitOldPasswordVerification?: (params: {
    password: string;
    preLoginCode: string;
  }) => Promise<VerificationSubmitResult>;
  createWechatVerification?: () => Promise<WechatVerificationMaterial>;
  submitWechatVerification?: (code: string) => Promise<VerificationSubmitResult>;
  startOAuthVerification?: () => Promise<{ url: string }>;
};

const isOAuthMethod = (
  method: AccountVerificationMethod
): method is Extract<AccountVerificationMethod, `oauth/${string}`> => method.startsWith('oauth/');

/**
 * 渲染账号验证方式并承接验证交互；业务 API 和验证成功后的动作由调用方通过适配器提供。
 * `pending` 仅表示当前轮询仍需继续，`expired` 表示二维码等一次性材料需要重新创建。
 */
export const AccountVerificationPanel = ({
  method,
  username,
  purpose,
  createCodeVerification,
  submitCodeVerification,
  createOldPasswordVerification,
  submitOldPasswordVerification,
  createWechatVerification,
  submitWechatVerification,
  startOAuthVerification
}: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { isOpen: isCaptchaOpen, onOpen: onOpenCaptcha, onClose: onCloseCaptcha } = useDisclosure();
  const [code, setCode] = useState('');
  const [codeCountDown, setCodeCountDown] = useState(0);
  const [hasSentCode, setHasSentCode] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [preLoginCode, setPreLoginCode] = useState<string>();
  const [wechatQR, setWechatQR] = useState<WechatVerificationMaterial>();
  const [wechatNow, setWechatNow] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const createRequested = useRef(false);
  const wechatPolling = useRef(false);
  const isAccountCancellation = purpose === 'unsubscribe';

  const getVerificationErrorTitle = useCallback(
    (error: unknown, fallback: string) =>
      isAccountVerificationCodeError(error)
        ? t('common:error.code_error')
        : isAccountVerificationRateLimitError(error)
          ? t('common:error.operation_too_frequently')
          : fallback,
    [t]
  );

  const showVerificationFailure = useCallback(
    (error?: unknown) => {
      toast({
        status: 'error',
        title: getVerificationErrorTitle(
          error,
          isAccountCancellation
            ? t('account_info:account_cancellation_verification_failed', '身份验证失败，请重试')
            : t('common:password_verification_failed')
        )
      });
    },
    [getVerificationErrorTitle, isAccountCancellation, t, toast]
  );

  const handleResult = useCallback((result: VerificationSubmitResult) => result === 'verified', []);

  const createBoundVerification = useCallback(async () => {
    if (method !== 'oldPassword' && method !== 'wechat') return;
    setCreating(true);
    setCreateFailed(false);
    try {
      if (method === 'oldPassword') {
        if (!createOldPasswordVerification)
          throw new Error('Old password verification is unavailable');
        setPreLoginCode(await createOldPasswordVerification());
      } else {
        if (!createWechatVerification) throw new Error('WeChat verification is unavailable');
        setWechatQR(await createWechatVerification());
        setWechatNow(Date.now());
      }
    } catch (error) {
      setCreateFailed(true);
      showVerificationFailure(error);
    } finally {
      setCreating(false);
    }
  }, [createOldPasswordVerification, createWechatVerification, method, showVerificationFailure]);

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
    if (!wechatQR || wechatExpired || !submitWechatVerification) return;
    let disposed = false;

    const pollVerification = async () => {
      if (wechatPolling.current) return;
      wechatPolling.current = true;
      try {
        const result = await submitWechatVerification(wechatQR.code);
        if (disposed) return;
        if (result === 'verified') {
          handleResult(result);
          disposed = true;
        } else if (result === 'expired') {
          setWechatQR(undefined);
          void createBoundVerification();
        }
      } catch (error) {
        if (!disposed && !isRetryableAccountVerificationPollingError(error)) {
          setWechatQR(undefined);
          setCreateFailed(true);
          showVerificationFailure(error);
          disposed = true;
        }
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
  }, [
    createBoundVerification,
    handleResult,
    showVerificationFailure,
    submitWechatVerification,
    wechatExpired,
    wechatQR
  ]);

  const sendCode = async ({ captcha }: { username: string; captcha: string }) => {
    if (method !== 'code') return;
    setCodeSending(true);
    try {
      await createCodeVerification(captcha);
      setHasSentCode(true);
      setCodeCountDown(60);
      toast({
        status: 'success',
        title: isAccountCancellation
          ? t('account_info:account_cancellation_code_sent', '验证码已发送')
          : t('common:password_code_sent')
      });
    } catch (error) {
      if (isAccountCancellation) {
        toast({
          status: 'error',
          title: getVerificationErrorTitle(
            error,
            t('account_info:account_cancellation_code_send_failed', '验证码发送失败，请重试')
          )
        });
      } else {
        showVerificationFailure(error);
      }
      throw error;
    } finally {
      setCodeSending(false);
    }
  };

  const submitCode = useCallback(
    async (verificationCode: string) => {
      if (
        method !== 'code' ||
        !verificationCode ||
        (!isAccountCancellation && verificationCode.length !== 6) ||
        submitting
      )
        return;
      setSubmitting(true);
      try {
        handleResult(await submitCodeVerification(verificationCode));
      } catch (error) {
        showVerificationFailure(error);
      } finally {
        setSubmitting(false);
      }
    },
    [
      handleResult,
      isAccountCancellation,
      method,
      showVerificationFailure,
      submitCodeVerification,
      submitting
    ]
  );

  const submitOldPassword = async () => {
    if (method !== 'oldPassword' || !oldPassword || !preLoginCode || !submitOldPasswordVerification)
      return;
    setSubmitting(true);
    try {
      handleResult(
        await submitOldPasswordVerification({
          password: hashStr(oldPassword),
          preLoginCode
        })
      );
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
    if (!isOAuthMethod(method) || !startOAuthVerification) return;
    setSubmitting(true);
    try {
      const result = await startOAuthVerification();
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

  if (isAccountCancellation) {
    const title = (
      <Text fontSize="20px" fontWeight="500" lineHeight="30px" textAlign="center">
        {t('account_info:account_cancellation_title', '注销账号')}
      </Text>
    );

    if (method === 'code') {
      return (
        <VStack w="100%" align="stretch" spacing={0}>
          {title}
          <Box pt={9}>
            <Input
              h="40px"
              value={username}
              isDisabled
              bg="myGray.25"
              borderColor="myGray.100"
              _disabled={{ opacity: 1, color: 'myGray.400', cursor: 'default' }}
              aria-label={t('account_info:account_cancellation_account', '注销账号')}
            />
            <InputGroup mt={6}>
              <Input
                h="40px"
                pr="120px"
                value={code}
                isDisabled={submitting}
                onChange={(event) => setCode(event.target.value)}
                placeholder={t('user:password.verification_code', '验证码')}
                aria-label={t('user:password.verification_code', '验证码')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitCode(code.trim());
                }}
              />
              <InputRightElement h="40px" w="120px" justifyContent="flex-end" pr={3}>
                <Button
                  h="18px"
                  minW={0}
                  p={0}
                  variant="unstyled"
                  color={codeCountDown > 0 ? 'myGray.400' : 'primary.700'}
                  fontSize="12px"
                  fontWeight="500"
                  lineHeight="18px"
                  isDisabled={codeSending || submitting || codeCountDown > 0}
                  onClick={onOpenCaptcha}
                >
                  {codeSending
                    ? t('account_info:account_cancellation_code_sending', '发送中')
                    : codeCountDown > 0
                      ? t(
                          'account_info:account_cancellation_code_countdown',
                          '重新获取（{{seconds}}）',
                          { seconds: codeCountDown }
                        )
                      : hasSentCode
                        ? t('account_info:account_cancellation_code_resend', '重新获取')
                        : t('account_info:account_cancellation_send_code', '获取验证码')}
                </Button>
              </InputRightElement>
            </InputGroup>
            <Button
              mt={12}
              w="100%"
              h="40px"
              isLoading={submitting}
              loadingText={t('account_info:account_cancellation_verifying', '验证中')}
              isDisabled={!code.trim()}
              onClick={() => void submitCode(code.trim())}
            >
              {t('account_info:account_cancellation_confirm', '确认注销')}
            </Button>
            {isCaptchaOpen && (
              <SendCodeAuthModal
                username={username}
                purpose={purpose}
                onClose={onCloseCaptcha}
                onSending={codeSending}
                onSendCode={sendCode}
              />
            )}
          </Box>
        </VStack>
      );
    }

    if (method === 'wechat') {
      return (
        <VStack w="100%" align="stretch" spacing={0}>
          {title}
          <VStack pt={9} spacing={6}>
            <Text color="myGray.600" fontSize="16px" fontWeight="500" lineHeight="24px">
              {t('account_info:account_cancellation_wechat_scan', '微信扫码登录')}
            </Text>
            <Center
              position="relative"
              w="226px"
              h="226px"
              overflow="hidden"
              bg="#fbfbfb"
              borderWidth="1px"
              borderColor="borderColor.low"
              borderRadius="md"
              p="4px"
            >
              {creating ? (
                <Spinner color="primary.600" />
              ) : wechatQR && !wechatExpired ? (
                <Image
                  src={wechatQR.codeUrl}
                  alt={t('account_info:account_cancellation_wechat_qr', '微信二维码')}
                  w="100%"
                  h="100%"
                  objectFit="contain"
                />
              ) : (
                <VStack spacing={3} px={4}>
                  <Text color="myGray.600" fontSize="sm" textAlign="center">
                    {createFailed
                      ? t(
                          'account_info:account_cancellation_wechat_load_failed',
                          '二维码加载失败，请重试。'
                        )
                      : t(
                          'account_info:account_cancellation_wechat_expired',
                          '二维码已过期，请重新获取。'
                        )}
                  </Text>
                  <Button size="sm" onClick={retryCreate}>
                    {t('account_info:account_cancellation_wechat_refresh', '重新获取二维码')}
                  </Button>
                </VStack>
              )}
            </Center>
          </VStack>
        </VStack>
      );
    }

    const cancellationProvider = method.slice('oauth/'.length).toLowerCase();
    const cancellationProviderLabel = (() => {
      if (cancellationProvider === 'github') return 'GitHub';
      if (cancellationProvider === 'google') return 'Google';
      if (cancellationProvider === 'microsoft') return 'Microsoft';
      if (cancellationProvider === 'wecom') return 'WeCom';
      return feConfigs.sso?.title ?? 'SSO';
    })();

    return (
      <VStack w="100%" align="stretch" spacing={0}>
        {title}
        <Box pt={9}>
          <Input
            h="40px"
            value={username}
            isDisabled
            bg="myGray.25"
            borderColor="myGray.100"
            _disabled={{ opacity: 1, color: 'myGray.400', cursor: 'default' }}
            aria-label={t('account_info:account_cancellation_account', '注销账号')}
          />
          <Button
            mt={12}
            w="100%"
            h="40px"
            isLoading={submitting}
            loadingText={t('account_info:account_cancellation_verifying', '验证中')}
            onClick={() => void submitOAuth()}
          >
            {t('account_info:account_cancellation_oauth_start', '前往 {{provider}} 验证', {
              provider: cancellationProviderLabel
            })}
          </Button>
        </Box>
      </VStack>
    );
  }

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
            purpose={purpose}
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
