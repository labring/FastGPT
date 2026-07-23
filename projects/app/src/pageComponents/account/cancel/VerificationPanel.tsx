import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import type {
  AccountVerificationMethod,
  OAuthAccountVerificationProvider
} from '@fastgpt/global/support/user/account/verification/type';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import { resolveAccountCancellationByUsername } from '@fastgpt/global/support/user/account/cancellation';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type {
  CreateAccountCancellationVerificationResponse,
  SubmitAccountCancellationResponse
} from '@fastgpt/global/openapi/support/user/account/cancellation/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SendCodeAuthModal from '@/components/support/user/safe/SendCodeAuthModal';
import { getClientToken } from '@/web/support/user/hooks/useSendCode';
import {
  createAccountCancellationVerification,
  submitAccountCancellation
} from '@/web/support/user/account/cancellation/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  isAccountVerificationCodeError,
  isAccountVerificationRateLimitError
} from '@/web/support/user/account/verification/error';

const getCapabilities = (feConfigs: FastGPTFeConfigsType) => ({
  ...(feConfigs.accountVerification?.accountCancellation ?? {
    emailCode: feConfigs.login_method?.includes('email') ?? false,
    phoneCode: feConfigs.login_method?.includes('phone') ?? false,
    accountCancellation: feConfigs.accountCancellation?.enabled === true,
    wechat: !!feConfigs.oauth?.wechat,
    oauth: {
      github: !!feConfigs.oauth?.github,
      google: !!feConfigs.oauth?.google,
      microsoft: !!feConfigs.oauth?.microsoft,
      wecom: !!feConfigs.oauth?.wecom,
      sso: !!feConfigs.sso?.url
    }
  })
});

const isOAuthMethod = (
  method: AccountVerificationMethod
): method is Extract<AccountVerificationMethod, `oauth/${string}`> => method.startsWith('oauth/');

/** 按统一 resolver 只渲染一种非密码验证方式，并承接各方式的加载与失败状态。 */
export const VerificationPanel = ({
  onSubmitted
}: {
  onSubmitted: (result: Extract<SubmitAccountCancellationResponse, { status: 'pending' }>) => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const { isOpen: isCaptchaOpen, onOpen: onOpenCaptcha, onClose: onCloseCaptcha } = useDisclosure();
  const [code, setCode] = useState('');
  const [codeCountDown, setCodeCountDown] = useState(0);
  const [hasSentCode, setHasSentCode] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [wechatQR, setWechatQR] =
    useState<Extract<CreateAccountCancellationVerificationResponse, { method: 'wechat' }>>();
  const [wechatNow, setWechatNow] = useState(() => Date.now());
  const [wechatCreating, setWechatCreating] = useState(false);
  const [wechatLoadFailed, setWechatLoadFailed] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const wechatCreateRequested = useRef(false);
  const wechatPolling = useRef(false);

  const username = userInfo?.username;
  const method = useMemo(() => {
    if (!username) return;
    const result = resolveAccountCancellationByUsername({
      username,
      capabilities: getCapabilities(feConfigs)
    });
    return result.status === 'supported' ? result.method : undefined;
  }, [feConfigs, username]);

  const wechatExpired =
    !!wechatQR?.expiredAt && new Date(wechatQR.expiredAt).getTime() <= wechatNow;

  useEffect(() => {
    if (codeCountDown <= 0) return;
    const timer = window.setTimeout(() => setCodeCountDown(codeCountDown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCountDown]);

  useEffect(() => {
    if (!wechatQR?.expiredAt) return;
    const timer = window.setInterval(() => setWechatNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [wechatQR?.expiredAt]);

  const showVerificationFailure = useCallback(
    (error?: unknown) => {
      toast({
        status: 'error',
        title: isAccountVerificationCodeError(error)
          ? t('common:error.code_error')
          : isAccountVerificationRateLimitError(error)
            ? t('common:error.operation_too_frequently')
            : t('account_info:account_cancellation_verification_failed', '身份验证失败，请重试')
      });
    },
    [t, toast]
  );

  const createWechatVerification = useCallback(async () => {
    if (method !== 'wechat') return;
    setWechatCreating(true);
    setWechatLoadFailed(false);
    try {
      const result = await createAccountCancellationVerification({ method, payload: {} });
      if (result.method !== 'wechat') return;
      setWechatQR(result);
      setWechatNow(Date.now());
    } catch (error) {
      setWechatLoadFailed(true);
      showVerificationFailure(error);
    } finally {
      setWechatCreating(false);
    }
  }, [method, showVerificationFailure]);

  useEffect(() => {
    if (method !== 'wechat' || wechatCreateRequested.current) return;
    wechatCreateRequested.current = true;
    void createWechatVerification();
  }, [createWechatVerification, method]);

  useEffect(() => {
    if (!wechatQR || wechatExpired) return;
    let disposed = false;

    const pollVerification = async () => {
      if (wechatPolling.current) return;
      wechatPolling.current = true;
      try {
        const result = await submitAccountCancellation({
          method: 'wechat',
          payload: { code: wechatQR.code }
        });
        if (!disposed && result.status === 'pending') {
          onSubmitted(result);
        }
      } catch {
        // 未扫码和 Provider 短暂异常都可能落入轮询失败，二维码有效期内继续等待。
      } finally {
        wechatPolling.current = false;
      }
    };

    void pollVerification();
    const timer = window.setInterval(() => void pollVerification(), 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [onSubmitted, wechatExpired, wechatQR]);

  const sendCode = async ({ captcha }: { username: string; captcha: string }) => {
    if (method !== 'code') return;
    setCodeSending(true);
    try {
      const googleToken = await getClientToken(feConfigs.googleClientVerKey);
      const result = await createAccountCancellationVerification({
        method,
        payload: { captcha, googleToken }
      });
      if (result.method !== 'code') return;
      setHasSentCode(true);
      setCodeCountDown(60);
      toast({
        status: 'success',
        title: t('account_info:account_cancellation_code_sent', '验证码已发送')
      });
    } catch (error) {
      toast({
        status: 'error',
        title: isAccountVerificationCodeError(error)
          ? t('common:error.code_error')
          : isAccountVerificationRateLimitError(error)
            ? t('common:error.operation_too_frequently')
            : t('account_info:account_cancellation_code_send_failed', '验证码发送失败，请重试')
      });
    } finally {
      setCodeSending(false);
    }
  };

  const submitCode = async () => {
    if (method !== 'code' || !code.trim()) return;
    setCodeSubmitting(true);
    try {
      const result = await submitAccountCancellation({ method, payload: { code: code.trim() } });
      if (result.status !== 'pending') return;
      onSubmitted(result);
    } catch (error) {
      showVerificationFailure(error);
    } finally {
      setCodeSubmitting(false);
    }
  };

  const submitOAuth = async () => {
    if (!method || !isOAuthMethod(method)) return;
    setOauthSubmitting(true);
    try {
      const callbackUrl = `${window.location.origin}/login/provider`;
      const result = await createAccountCancellationVerification({
        method,
        payload: {
          callbackUrl,
          isWecomWorkTerminal: checkIsWecomTerminal()
        }
      });
      if (result.method !== method) return;
      const provider = method.slice('oauth/'.length) as OAuthAccountVerificationProvider;
      useSystemStore.getState().setLoginStore({
        provider,
        lastRoute: '/account/cancel?confirmed=1',
        state: result.state,
        callbackUrl,
        flow: 'accountCancellation'
      });
      await router.replace(result.url);
    } catch {
      setOauthSubmitting(false);
      showVerificationFailure();
    }
  };

  if (!method || !username) {
    return (
      <VStack w="100%" align="stretch" spacing={8}>
        <Text fontSize="20px" fontWeight="500" lineHeight="30px" textAlign="center">
          {t('account_info:account_cancellation_title', '注销账号')}
        </Text>
        <Text color="myGray.600" fontSize="sm" textAlign="center">
          {t(
            'account_info:account_cancellation_unavailable_desc',
            '当前账号没有可用的非密码验证方式。'
          )}
        </Text>
      </VStack>
    );
  }

  const oauthProvider = isOAuthMethod(method)
    ? method.slice('oauth/'.length).toLowerCase()
    : undefined;
  const oauthProviderLabel = (() => {
    if (oauthProvider === 'github') return 'GitHub';
    if (oauthProvider === 'google') return 'Google';
    if (oauthProvider === 'microsoft') return 'Microsoft';
    if (oauthProvider === 'wecom') return 'WeCom';
    if (oauthProvider === 'sso') return feConfigs.sso?.title ?? 'SSO';
    return '';
  })();

  return (
    <VStack w="100%" align="stretch" spacing={0}>
      <Text fontSize="20px" fontWeight="500" lineHeight="30px" textAlign="center">
        {t('account_info:account_cancellation_title', '注销账号')}
      </Text>

      {method === 'code' && (
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
              isDisabled={codeSubmitting}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t('user:password.verification_code', '验证码')}
              aria-label={t('user:password.verification_code', '验证码')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitCode();
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
                isDisabled={codeSending || codeSubmitting || codeCountDown > 0}
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
            isLoading={codeSubmitting}
            loadingText={t('account_info:account_cancellation_verifying', '验证中')}
            isDisabled={!code.trim()}
            onClick={() => void submitCode()}
          >
            {t('account_info:account_cancellation_confirm', '确认注销')}
          </Button>
          {isCaptchaOpen && (
            <SendCodeAuthModal
              username={username}
              onClose={onCloseCaptcha}
              onSending={codeSending}
              onSendCode={sendCode}
            />
          )}
        </Box>
      )}

      {method === 'wechat' && (
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
            {wechatCreating ? (
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
                  {wechatLoadFailed
                    ? t(
                        'account_info:account_cancellation_wechat_load_failed',
                        '二维码加载失败，请重试。'
                      )
                    : t(
                        'account_info:account_cancellation_wechat_expired',
                        '二维码已过期，请重新获取。'
                      )}
                </Text>
                <Button
                  size="sm"
                  onClick={() => {
                    wechatCreateRequested.current = true;
                    void createWechatVerification();
                  }}
                >
                  {t('account_info:account_cancellation_wechat_refresh', '重新获取二维码')}
                </Button>
              </VStack>
            )}
          </Center>
        </VStack>
      )}

      {isOAuthMethod(method) && (
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
            isLoading={oauthSubmitting}
            loadingText={t('account_info:account_cancellation_verifying', '验证中')}
            onClick={() => void submitOAuth()}
          >
            {t('account_info:account_cancellation_oauth_start', '前往 {{provider}} 验证', {
              provider: oauthProviderLabel
            })}
          </Button>
        </Box>
      )}
    </VStack>
  );
};
