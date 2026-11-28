import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { Box, Button, Text } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getErrResponse } from '@fastgpt/global/common/error/utils';
import type {
  PasswordAuthorizationResponse,
  SensitiveAccountVerificationBody
} from '@fastgpt/global/openapi/support/user/account/password/api';
import {
  OAuthAccountVerificationProviderSchema,
  type AccountVerificationMethod,
  type OAuthAccountVerificationMethod
} from '@fastgpt/global/support/user/account/verification/type';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import type { OAuthEnum } from '@fastgpt/global/support/user/constant';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  authorizePasswordChange,
  createPasswordVerification,
  updatePassword,
  updateRootPassword
} from '@/web/support/user/account/password/api';
import { usePasswordChangeStore } from '@/web/support/user/account/password/store';
import {
  AccountVerificationPanel,
  type VerificationSubmitResult,
  type WechatVerificationMaterial
} from './AccountVerificationPanel';
import PasswordForm, { type PasswordFormType } from './PasswordForm';

type Authorization = Extract<PasswordAuthorizationResponse, { status: 'authorized' }>;
type Stage =
  | { type: 'prompt' }
  | { type: 'authorizing' }
  | { type: 'verification'; method: AccountVerificationMethod }
  | { type: 'password'; authorization?: Authorization }
  | { type: 'unavailable' };

const isOAuthMethod = (
  method: AccountVerificationMethod
): method is OAuthAccountVerificationMethod => method.startsWith('oauth/');

type Props = {
  required?: boolean;
  showExpiredPrompt?: boolean;
  onClose?: () => void;
  onSuccess?: () => void | Promise<void>;
};

/** 统一承接设置、修改和过期重置密码的短期授权状态机。 */
const PasswordChangeModal = ({
  required = false,
  showExpiredPrompt = false,
  onClose,
  onSuccess
}: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { userInfo, initUserInfo } = useUserStore();
  const isPlus = useSystemStore((state) => state.feConfigs?.isPlus) === true;
  const storedSession = usePasswordChangeStore((state) => state.session);
  const setStoredSession = usePasswordChangeStore((state) => state.setSession);
  const initialAuthorization = storedSession?.required === required ? storedSession : undefined;
  const [stage, setStage] = useState<Stage>(() => {
    if (initialAuthorization) {
      return {
        type: 'password',
        authorization: {
          status: 'authorized',
          sessionId: initialAuthorization.sessionId,
          expiredAt: initialAuthorization.expiredAt
        }
      };
    }
    if (showExpiredPrompt) return { type: 'prompt' };
    return isPlus ? { type: 'authorizing' } : { type: 'password' };
  });
  const [submitting, setSubmitting] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const form = useForm<PasswordFormType>({
    defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' }
  });

  useEffect(() => {
    if (initialAuthorization) setStoredSession(undefined);
  }, [initialAuthorization, setStoredSession]);

  const requestAuthorization = useCallback(async () => {
    try {
      const result = await authorizePasswordChange({ source: 'verificationMethod' });
      if (result.status === 'authorized') {
        setVerificationLoading(false);
        setStage({ type: 'password', authorization: result });
        return;
      }
      if (result.status === 'verificationRequired') {
        // oldPassword 验证进入面板后会立即创建校验上下文，先衔接 loading 避免两段加载间闪烁。
        setVerificationLoading(result.method === 'oldPassword');
        setStage({ type: 'verification', method: result.method });
        return;
      }
      setVerificationLoading(false);
      setStage({ type: 'unavailable' });
    } catch {
      setVerificationLoading(false);
      setStage({ type: 'unavailable' });
      toast({ status: 'error', title: t('common:password_verification_failed') });
    }
  }, [t, toast]);

  useEffect(() => {
    if (stage.type !== 'authorizing') return;

    const timer = window.setTimeout(() => void requestAuthorization(), 0);
    return () => window.clearTimeout(timer);
  }, [requestAuthorization, stage.type]);

  const consumeVerification = useCallback(
    (verification: SensitiveAccountVerificationBody) =>
      authorizePasswordChange({ source: 'accountVerification', verification }),
    []
  );

  const handleAuthorized = useCallback((authorization: Authorization) => {
    setVerificationLoading(false);
    setStage({ type: 'password', authorization });
  }, []);

  const createCodeVerification = useCallback(async (captcha: string) => {
    const result = await createPasswordVerification({ method: 'code', payload: { captcha } });
    if (result.method !== 'code') throw new Error('Verification method mismatch');
  }, []);

  const submitPasswordVerification = useCallback(
    async (verification: SensitiveAccountVerificationBody): Promise<VerificationSubmitResult> => {
      const result = await consumeVerification(verification);
      if (result.status === 'authorized') {
        handleAuthorized(result);
        return 'verified';
      }
      if (result.status === 'verificationPending') return 'pending';
      if (result.status === 'verificationExpired') return 'expired';
      throw new Error('Password verification is unavailable');
    },
    [consumeVerification, handleAuthorized]
  );

  const createOldPasswordVerification = useCallback(async () => {
    const result = await createPasswordVerification({ method: 'oldPassword', payload: {} });
    if (result.method !== 'oldPassword') throw new Error('Verification method mismatch');
  }, []);

  const createWechatVerification = useCallback(async (): Promise<WechatVerificationMaterial> => {
    const result = await createPasswordVerification({ method: 'wechat', payload: {} });
    if (result.method !== 'wechat') throw new Error('Verification method mismatch');
    return result;
  }, []);

  const startOAuthVerification = useCallback(async () => {
    const callbackUrl = `${window.location.origin}/login/provider`;
    const method: OAuthAccountVerificationMethod =
      stage.type === 'verification' && isOAuthMethod(stage.method) ? stage.method : 'oauth/sso';
    const result = await createPasswordVerification({
      method,
      payload: {
        callbackUrl,
        isWecomWorkTerminal: checkIsWecomTerminal()
      }
    });
    if (!('url' in result) || !('state' in result)) throw new Error('Verification method mismatch');
    const provider = OAuthAccountVerificationProviderSchema.parse(
      result.method.slice('oauth/'.length)
    );
    useSystemStore.getState().setLoginStore({
      provider: provider as OAuthEnum,
      lastRoute: router.asPath,
      state: result.state,
      flow: 'passwordChange',
      passwordChangeRequired: required
    });
    return { url: result.url };
  }, [required, router.asPath, stage]);

  const submitCodeVerification = useCallback(
    (code: string) => submitPasswordVerification({ method: 'code', payload: { code } }),
    [submitPasswordVerification]
  );

  const submitOldPasswordVerification = useCallback(
    ({ password }: { password: string }) =>
      submitPasswordVerification({
        method: 'oldPassword',
        payload: { password }
      }),
    [submitPasswordVerification]
  );

  const submitWechatVerification = useCallback(
    (code: string) => submitPasswordVerification({ method: 'wechat', payload: { code } }),
    [submitPasswordVerification]
  );

  const closeFlow = () => {
    if (required) return;
    form.reset();
    setStoredSession(undefined);
    onClose?.();
  };

  const submitNewPassword = async ({ oldPassword, newPassword }: PasswordFormType) => {
    if (stage.type !== 'password') return;
    setSubmitting(true);
    try {
      if (isPlus) {
        if (!stage.authorization) {
          throw new Error('Password change authorization is required');
        }
        await updatePassword({
          newPassword,
          passwordChangeSession: stage.authorization.sessionId
        });
      } else {
        await updateRootPassword({
          oldPassword,
          newPassword
        });
      }
      form.reset();
      setStoredSession(undefined);
      await initUserInfo();
      toast({ status: 'success', title: t('common:password_set_success') });
      await onSuccess?.();
    } catch (error) {
      const errorResponse = getErrResponse(error);
      if (errorResponse?.statusText === UserErrEnum.passwordChangeAuthorizationInvalid) {
        form.reset();
        setStoredSession(undefined);
        toast({
          status: 'error',
          title: t('common:password_verification_expired', '身份认证已过期，请重新验证')
        });
        setStage(isPlus ? { type: 'authorizing' } : { type: 'unavailable' });
        return;
      }
      const errorTitle = (() => {
        if (errorResponse?.statusText === UserErrEnum.newPasswordSameAsOld) {
          return t('common:user.Password has no change');
        }
        // 旧密码错误只可能发生在开源版：商业版由一次性改密 Session 证明身份。
        if (errorResponse?.statusText === UserErrEnum.oldPasswordError) {
          return t('common:user.Old password is error');
        }
        return t('common:password_update_error');
      })();
      toast({ status: 'error', title: errorTitle });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordEnterKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (
      submitting ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229 ||
      event.key.toLowerCase() !== 'enter'
    ) {
      return;
    }
    form.handleSubmit(submitNewPassword)();
  };

  const title = (() => {
    if (stage.type === 'verification' || stage.type === 'unavailable') {
      return t('common:password_verification_title');
    }
    if (required || !userInfo?.hasPassword) return t('common:password_set_title');
    return t('common:update_password');
  })();

  const isWechatVerification = stage.type === 'verification' && stage.method === 'wechat';
  const isModalLoading =
    stage.type === 'authorizing' || (stage.type === 'verification' && verificationLoading);
  const bodyStyles = stage.type === 'password' ? { pt: 0 } : undefined;

  return (
    <MyModal
      isOpen
      title={title}
      onClose={required ? undefined : closeFlow}
      closeOnOverlayClick={!required && stage.type !== 'password'}
      closeOnEsc={!required}
      isCentered
      isLoading={isModalLoading}
      size={isWechatVerification ? 'md' : 'sm'}
      borderRadius="semilg"
      bodyStyles={bodyStyles}
      footer={
        stage.type === 'prompt' ? (
          <Button
            h={8}
            minH={8}
            w={16}
            px={3.5}
            borderRadius="sm"
            fontSize="mini"
            lineHeight={4}
            onClick={() => setStage(isPlus ? { type: 'authorizing' } : { type: 'password' })}
          >
            {t('common:password_expired_action')}
          </Button>
        ) : undefined
      }
    >
      {stage.type === 'prompt' && (
        <Text fontSize="sm" lineHeight="20px">
          {t('common:password_expired_tip')}
        </Text>
      )}

      {stage.type === 'authorizing' && <Box minH="120px" />}

      {stage.type === 'unavailable' && (
        <>
          <Text color="myGray.600" fontSize="sm" lineHeight="20px" textAlign="center">
            {t('common:password_verification_unavailable')}
          </Text>
          <Button
            mt={6}
            h={10}
            w="100%"
            onClick={() => setStage(isPlus ? { type: 'authorizing' } : { type: 'password' })}
          >
            {t('common:password_verification_retry')}
          </Button>
        </>
      )}

      {stage.type === 'verification' && (
        <AccountVerificationPanel
          method={stage.method}
          username={userInfo?.username ?? ''}
          purpose="changePassword"
          createCodeVerification={createCodeVerification}
          submitCodeVerification={submitCodeVerification}
          createOldPasswordVerification={createOldPasswordVerification}
          submitOldPasswordVerification={submitOldPasswordVerification}
          createWechatVerification={createWechatVerification}
          submitWechatVerification={submitWechatVerification}
          startOAuthVerification={startOAuthVerification}
          onLoadingChange={setVerificationLoading}
          tip={!userInfo?.hasPassword ? t('common:password_set_login_tip') : undefined}
        />
      )}

      {stage.type === 'password' && (
        <PasswordForm
          form={form}
          submitting={submitting}
          onSubmit={form.handleSubmit(submitNewPassword)}
          onKeyDown={handlePasswordEnterKeyDown}
          showOldPassword={!stage.authorization && !!userInfo?.hasPassword}
        />
      )}
    </MyModal>
  );
};

export default PasswordChangeModal;
