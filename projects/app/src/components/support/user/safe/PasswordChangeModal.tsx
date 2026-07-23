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
import { getErrResponse, getErrText } from '@fastgpt/global/common/error/utils';
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
      toast({ status: 'success', title: t('common:password_set_success') });
      await onSuccess?.();
    } catch (error) {
      const errorResponse = getErrResponse(error);
      if (errorResponse?.statusText === UserErrEnum.passwordChangeAuthorizationInvalid) {
        reset();
        setStoredAuthorization(undefined);
        setStage({ type: 'authorizing' });
        return;
      }
      const errorTitle =
        errorResponse?.statusText === UserErrEnum.newPasswordSameAsOld
          ? t(getErrText(error, t('common:user.Password has no change')) as any)
          : t('common:password_update_error');
      toast({ status: 'error', title: errorTitle });
    } finally {
      setSubmitting(false);
    }
  };

  const title = (() => {
    if (stage.type === 'verification' || stage.type === 'unavailable') {
      return t('common:password_verification_title');
    }
    if (required || !userInfo?.hasPassword) return t('common:password_set_title');
    return userInfo?.hasPassword ? t('common:update_password') : t('common:password_set_title');
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
          <Text fontSize="lg" fontWeight="medium" lineHeight="26px">
            {title}
          </Text>
          <VStack align="stretch" spacing={6} mt={6}>
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
