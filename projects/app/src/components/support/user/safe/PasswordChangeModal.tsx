import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import {
  Box,
  Button,
  Center,
  Flex,
  FormControl,
  FormErrorMessage,
  Input,
  Spinner,
  Text,
  VStack
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getErrResponse } from '@fastgpt/global/common/error/utils';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';
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
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  authorizePasswordChange,
  createPasswordVerification,
  updatePassword
} from '@/web/support/user/account/password/api';
import { usePasswordChangeStore } from '@/web/support/user/account/password/store';
import {
  AccountVerificationPanel,
  type VerificationSubmitResult,
  type WechatVerificationMaterial
} from './AccountVerificationPanel';

type Authorization = Extract<PasswordAuthorizationResponse, { status: 'authorized' }>;
type Stage =
  | { type: 'prompt' }
  | { type: 'authorizing' }
  | { type: 'verification'; method: AccountVerificationMethod }
  | { type: 'password'; authorization: Authorization }
  | { type: 'unavailable' };

type FormType = {
  newPassword: string;
  confirmPassword: string;
};

const isOAuthMethod = (
  method: AccountVerificationMethod
): method is OAuthAccountVerificationMethod => method.startsWith('oauth/');

type Props = {
  required?: boolean;
  showExpiredPrompt?: boolean;
  onClose?: () => void;
  onSuccess?: () => void | Promise<void>;
};

const invalidInputStyles = {
  borderColor: 'red.500',
  _focus: {
    borderColor: 'red.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-red-500)'
  },
  _focusVisible: {
    borderColor: 'red.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-red-500)'
  }
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
    return showExpiredPrompt ? { type: 'prompt' } : { type: 'authorizing' };
  });
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors }
  } = useForm<FormType>({
    defaultValues: { newPassword: '', confirmPassword: '' }
  });

  useEffect(() => {
    if (initialAuthorization) setStoredSession(undefined);
  }, [initialAuthorization, setStoredSession]);

  const requestAuthorization = useCallback(async () => {
    try {
      const result = await authorizePasswordChange({ source: 'verificationMethod' });
      if (result.status === 'authorized') {
        setStage({ type: 'password', authorization: result });
        return;
      }
      if (result.status === 'verificationRequired') {
        setStage({ type: 'verification', method: result.method });
        return;
      }
      setStage({ type: 'unavailable' });
    } catch {
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
    return result.preLoginCode;
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
    ({ password, preLoginCode }: { password: string; preLoginCode: string }) =>
      submitPasswordVerification({
        method: 'oldPassword',
        payload: { password, preLoginCode }
      }),
    [submitPasswordVerification]
  );

  const submitWechatVerification = useCallback(
    (code: string) => submitPasswordVerification({ method: 'wechat', payload: { code } }),
    [submitPasswordVerification]
  );

  const closeFlow = () => {
    if (required) return;
    reset();
    setStoredSession(undefined);
    onClose?.();
  };

  const submitNewPassword = async ({ newPassword }: FormType) => {
    if (stage.type !== 'password') return;
    setSubmitting(true);
    try {
      await updatePassword({
        newPassword,
        passwordChangeSession: stage.authorization.sessionId
      });
      reset();
      setStoredSession(undefined);
      await initUserInfo();
      toast({ status: 'success', title: t('common:password_set_success') });
      await onSuccess?.();
    } catch (error) {
      const errorResponse = getErrResponse(error);
      if (errorResponse?.statusText === UserErrEnum.passwordChangeAuthorizationInvalid) {
        reset();
        setStoredSession(undefined);
        setStage({ type: 'authorizing' });
        return;
      }
      const errorTitle =
        errorResponse?.statusText === UserErrEnum.newPasswordSameAsOld
          ? t('common:user.Password has no change')
          : t('common:password_update_error');
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
    handleSubmit(submitNewPassword)();
  };

  const title = (() => {
    if (stage.type === 'verification' || stage.type === 'unavailable') {
      return t('common:password_verification_title');
    }
    if (required || !userInfo?.hasPassword) return t('common:password_set_title');
    return t('common:update_password');
  })();

  const isWechatVerification = stage.type === 'verification' && stage.method === 'wechat';
  const modalWidth = isWechatVerification ? '560px' : '400px';

  return (
    <MyModal
      isOpen
      onClose={required ? undefined : closeFlow}
      closeOnOverlayClick={!required && stage.type !== 'password'}
      isCentered
      w={modalWidth}
      maxW={['calc(100vw - 32px)', modalWidth]}
      borderRadius="semilg"
      boxShadow="3.5"
      overflow="hidden"
    >
      {stage.type === 'prompt' && (
        <VStack align="stretch" spacing={6} p={8}>
          <Text fontSize="lg" fontWeight="medium" lineHeight="26px">
            {title}
          </Text>
          <Text fontSize="sm" lineHeight="20px">
            {t('common:password_expired_tip')}
          </Text>
          <Flex justify="flex-end">
            <Button
              h={8}
              minH={8}
              w={16}
              px={3.5}
              borderRadius="sm"
              fontSize="mini"
              lineHeight={4}
              onClick={() => setStage({ type: 'authorizing' })}
            >
              {t('common:password_expired_action')}
            </Button>
          </Flex>
        </VStack>
      )}

      {stage.type === 'authorizing' && (
        <Box p={8}>
          <Text fontSize="lg" fontWeight="medium" lineHeight="26px">
            {title}
          </Text>
          <Center minH="120px" mt={6}>
            <VStack spacing={3}>
              <Spinner color="primary.600" />
              <Text color="myGray.600" fontSize="sm">
                {t('common:password_authorizing')}
              </Text>
            </VStack>
          </Center>
        </Box>
      )}

      {stage.type === 'unavailable' && (
        <Box p={8}>
          <Text fontSize="lg" fontWeight="medium" lineHeight="26px">
            {title}
          </Text>
          <Text mt={6} color="myGray.600" fontSize="sm" lineHeight="20px" textAlign="center">
            {t('common:password_verification_unavailable')}
          </Text>
          <Button mt={6} h={10} w="100%" onClick={() => setStage({ type: 'authorizing' })}>
            {t('common:password_verification_retry')}
          </Button>
        </Box>
      )}

      {stage.type === 'verification' && (
        <Box p={8}>
          <VStack align="stretch" spacing={2}>
            <Text fontSize="lg" fontWeight="medium" lineHeight="26px">
              {title}
            </Text>
            <Text fontSize="sm" lineHeight="20px">
              {t('common:password_verification_description')}
            </Text>
          </VStack>
          <Box mt={6}>
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
            />
          </Box>
        </Box>
      )}

      {stage.type === 'password' && (
        <Box p={8}>
          <Text fontSize="lg" fontWeight="medium" lineHeight="26px">
            {title}
          </Text>
          <VStack align="stretch" spacing={6} mt={6} onKeyDown={handlePasswordEnterKeyDown}>
            <FormControl isInvalid={!!errors.newPassword}>
              <Input
                size="lg"
                type="password"
                bg="myGray.50"
                _invalid={invalidInputStyles}
                placeholder={t('common:password_new_placeholder')}
                aria-label={t('common:password_new_placeholder')}
                {...register('newPassword', {
                  required: t('common:password_new_placeholder'),
                  validate: (value) => checkPasswordRule(value) || t('common:password_tip')
                })}
              />
              <Text
                mt={2}
                color={errors.newPassword ? 'red.500' : 'myGray.400'}
                fontSize="mini"
                fontWeight="medium"
                lineHeight={4}
              >
                {t('common:password_tip')}
              </Text>
            </FormControl>
            <FormControl isInvalid={!!errors.confirmPassword}>
              <Input
                size="lg"
                type="password"
                bg="myGray.50"
                _invalid={invalidInputStyles}
                placeholder={t('common:password_confirm_placeholder')}
                aria-label={t('common:password_confirm_placeholder')}
                {...register('confirmPassword', {
                  required: t('common:password_confirm_placeholder'),
                  validate: (value) =>
                    value === getValues('newPassword') || t('common:password_not_match')
                })}
              />
              {errors.confirmPassword?.message && (
                <FormErrorMessage mt={2} fontSize="mini" lineHeight={4}>
                  {errors.confirmPassword.message}
                </FormErrorMessage>
              )}
            </FormControl>
            <Button
              size="lg"
              w="100%"
              fontSize="sm"
              isLoading={submitting}
              onClick={handleSubmit(submitNewPassword)}
            >
              {t('common:password_confirm_action')}
            </Button>
          </VStack>
        </Box>
      )}
    </MyModal>
  );
};

export default PasswordChangeModal;
