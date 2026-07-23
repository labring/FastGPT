import { useCallback, useEffect, useState } from 'react';
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
import type { AccountVerificationMethod } from '@fastgpt/global/support/user/account/verification/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  authorizePasswordChange,
  createPasswordVerification,
  updatePassword
} from '@/web/support/user/account/password/api';
import { usePasswordChangeStore } from '@/web/support/user/account/password/store';
import { AccountVerificationPanel } from './AccountVerificationPanel';

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
  const storedAuthorization = usePasswordChangeStore((state) => state.authorization);
  const setStoredAuthorization = usePasswordChangeStore((state) => state.setAuthorization);
  const initialAuthorization =
    storedAuthorization?.required === required ? storedAuthorization : undefined;
  const [stage, setStage] = useState<Stage>(() => {
    if (initialAuthorization) {
      return {
        type: 'password',
        authorization: {
          status: 'authorized',
          token: initialAuthorization.token,
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
    if (initialAuthorization) setStoredAuthorization(undefined);
  }, [initialAuthorization, setStoredAuthorization]);

  const requestAuthorization = useCallback(async () => {
    try {
      const result = await authorizePasswordChange({ source: 'recentLogin' });
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
      toast({ status: 'error', title: t('account_info:password_verification_failed') });
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

  const closeFlow = () => {
    if (required) return;
    reset();
    setStoredAuthorization(undefined);
    onClose?.();
  };

  const submitNewPassword = async ({ newPassword }: FormType) => {
    if (stage.type !== 'password') return;
    setSubmitting(true);
    try {
      await updatePassword({
        newPassword,
        passwordChangeToken: stage.authorization.token
      });
      reset();
      setStoredAuthorization(undefined);
      await initUserInfo();
      toast({ status: 'success', title: t('account_info:password_set_success') });
      await onSuccess?.();
    } catch (error) {
      if (getErrResponse(error)?.statusText === UserErrEnum.passwordChangeAuthorizationInvalid) {
        reset();
        setStoredAuthorization(undefined);
        setStage({ type: 'authorizing' });
        return;
      }
      toast({ status: 'error', title: t('account_info:password_update_error') });
    } finally {
      setSubmitting(false);
    }
  };

  const title = (() => {
    if (stage.type === 'verification' || stage.type === 'unavailable') {
      return t('account_info:password_verification_title');
    }
    if (required || !userInfo?.hasPassword) return t('account_info:password_set_title');
    return userInfo?.hasPassword
      ? t('account_info:update_password')
      : t('account_info:password_set_title');
  })();

  const isWechatVerification = stage.type === 'verification' && stage.method === 'wechat';
  const modalWidth = isWechatVerification ? '560px' : '400px';

  return (
    <MyModal
      isOpen
      onClose={required ? undefined : closeFlow}
      closeOnOverlayClick={!required}
      isCentered
      w={modalWidth}
      maxW={['calc(100vw - 32px)', modalWidth]}
      borderRadius="10px"
      boxShadow="0 4px 10px rgba(19, 51, 107, 0.1), 0 0 1px rgba(19, 51, 107, 0.1)"
      overflow="hidden"
    >
      {stage.type === 'prompt' && (
        <VStack align="stretch" spacing={6} p={8}>
          <Text fontSize="20px" fontWeight="500" lineHeight="26px">
            {title}
          </Text>
          <Text fontSize="14px" lineHeight="20px">
            {t('account_info:password_expired_tip')}
          </Text>
          <Flex justify="flex-end">
            <Button
              h="32px"
              minH="32px"
              w="64px"
              px="14px"
              borderRadius="6px"
              fontSize="12px"
              lineHeight="16px"
              onClick={() => setStage({ type: 'authorizing' })}
            >
              {t('account_info:password_expired_action')}
            </Button>
          </Flex>
        </VStack>
      )}

      {stage.type === 'authorizing' && (
        <Box p={8}>
          <Text fontSize="20px" fontWeight="500" lineHeight="26px">
            {title}
          </Text>
          <Center minH="120px" mt={6}>
            <VStack spacing={3}>
              <Spinner color="primary.600" />
              <Text color="myGray.600" fontSize="sm">
                {t('account_info:password_authorizing')}
              </Text>
            </VStack>
          </Center>
        </Box>
      )}

      {stage.type === 'unavailable' && (
        <Box p={8}>
          <Text fontSize="20px" fontWeight="500" lineHeight="26px">
            {title}
          </Text>
          <Text mt={6} color="myGray.600" fontSize="14px" lineHeight="20px" textAlign="center">
            {t('account_info:password_verification_unavailable')}
          </Text>
          <Button mt={6} h="40px" w="100%" onClick={() => setStage({ type: 'authorizing' })}>
            {t('account_info:password_verification_retry')}
          </Button>
        </Box>
      )}

      {stage.type === 'verification' && (
        <Box p={8}>
          <VStack align="stretch" spacing={2}>
            <Text fontSize="20px" fontWeight="500" lineHeight="26px">
              {title}
            </Text>
            <Text fontSize="14px" lineHeight="20px">
              {t('account_info:password_verification_description')}
            </Text>
          </VStack>
          <Box mt={6}>
            <AccountVerificationPanel
              method={stage.method}
              username={userInfo?.username ?? ''}
              required={required}
              returnRoute={router.asPath}
              createVerification={createPasswordVerification}
              consumeVerification={consumeVerification}
              onAuthorized={handleAuthorized}
            />
          </Box>
        </Box>
      )}

      {stage.type === 'password' && (
        <Box p={8}>
          <Text fontSize="20px" fontWeight="500" lineHeight="26px">
            {title}
          </Text>
          <VStack align="stretch" spacing={6} mt={6}>
            <FormControl isInvalid={!!errors.newPassword}>
              <Input
                h="40px"
                type="password"
                bg="myGray.50"
                borderColor="myGray.200"
                borderRadius="8px"
                placeholder={t('account_info:password_new_placeholder')}
                aria-label={t('account_info:password_new_placeholder')}
                {...register('newPassword', {
                  required: t('account_info:password_new_placeholder'),
                  validate: (value) => checkPasswordRule(value) || t('login:password_tip')
                })}
              />
              {errors.newPassword?.message ? (
                <FormErrorMessage mt={2} fontSize="12px" lineHeight="16px">
                  {errors.newPassword.message}
                </FormErrorMessage>
              ) : (
                <Text mt={2} color="myGray.400" fontSize="12px" fontWeight="500" lineHeight="16px">
                  {t('account_info:password_tip')}
                </Text>
              )}
            </FormControl>
            <FormControl isInvalid={!!errors.confirmPassword}>
              <Input
                h="40px"
                type="password"
                bg="myGray.50"
                borderColor="myGray.200"
                borderRadius="8px"
                placeholder={t('account_info:password_confirm_placeholder')}
                aria-label={t('account_info:password_confirm_placeholder')}
                {...register('confirmPassword', {
                  required: t('account_info:password_confirm_placeholder'),
                  validate: (value) =>
                    value === getValues('newPassword') || t('user:password.not_match')
                })}
              />
              {errors.confirmPassword?.message && (
                <FormErrorMessage mt={2} fontSize="12px" lineHeight="16px">
                  {errors.confirmPassword.message}
                </FormErrorMessage>
              )}
            </FormControl>
            <Button
              h="40px"
              w="100%"
              borderRadius="8px"
              isLoading={submitting}
              onClick={handleSubmit(submitNewPassword)}
            >
              {t('account_info:password_confirm_action')}
            </Button>
          </VStack>
        </Box>
      )}
    </MyModal>
  );
};

export default PasswordChangeModal;
