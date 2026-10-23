'use client';
import { useCallback, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getErrResponse } from '@fastgpt/global/common/error/utils';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import { activateAccount } from '@/web/support/user/account/password/api';
import PasswordForm, { type PasswordFormType } from './PasswordForm';

/** 未激活账号设置新密码的前端引导；验证规则由共享密码表单负责，其他 API 不受此弹窗限制。 */
const AccountActivationModal = ({ onFinish }: { onFinish: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { initUserInfo } = useUserStore();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<PasswordFormType>({
    defaultValues: { newPassword: '', confirmPassword: '' }
  });

  const submit = useCallback(
    async ({ newPassword }: PasswordFormType) => {
      setSubmitting(true);
      try {
        await activateAccount({ newPassword });
        form.reset();
        await initUserInfo();
        toast({ status: 'success', title: t('common:password_set_success') });
        onFinish();
      } catch (error) {
        const errorResponse = getErrResponse(error);
        // 其他标签页可能已完成激活；刷新状态并释放本地动作锁，避免用户被卡住。
        if (errorResponse?.statusText === UserErrEnum.passwordChangeAuthorizationInvalid) {
          form.reset();
          await initUserInfo();
          onFinish();
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
    },
    [form, initUserInfo, onFinish, t, toast]
  );

  return (
    <MyModal
      isOpen
      isCentered
      w="400px"
      maxW={['calc(100vw - 32px)', '400px']}
      borderRadius="semilg"
      boxShadow="3.5"
      overflow="hidden"
      closeOnOverlayClick={false}
    >
      <Box p={8}>
        <Text fontSize="lg" fontWeight="medium" lineHeight="26px">
          {t('common:account_activation_title')}
        </Text>
        <Text mt={2} color="myGray.500" fontSize="sm">
          {t('common:account_activation_description')}
        </Text>
        <PasswordForm form={form} submitting={submitting} onSubmit={form.handleSubmit(submit)} />
      </Box>
    </MyModal>
  );
};

export default AccountActivationModal;
