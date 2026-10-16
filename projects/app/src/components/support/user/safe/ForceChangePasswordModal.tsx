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
import { forceUpdatePassword } from '@/web/support/user/account/password/api';
import PasswordForm, { type PasswordFormType } from './PasswordForm';

/**
 * 不可关闭的强制改密弹窗：账号处于 mustChangePassword 状态时，登录后必须先改密。
 * 授权来自服务端的该标记，用户只需设置新密码。
 */
const ForceChangePasswordModal = ({ onFinish }: { onFinish: () => void }) => {
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
        await forceUpdatePassword({ newPassword });
        form.reset();
        // 必须刷新 userInfo：mustChangePassword 挂在 userInfo 上，
        // 不刷新会让编排锁释放后弹窗立即重新弹出。
        await initUserInfo();
        toast({ status: 'success', title: t('common:password_set_success') });
        onFinish();
      } catch (error) {
        const errorResponse = getErrResponse(error);
        // 标记已被别处清除（如另一个标签页刚改密成功）时，本弹窗不可关闭，
        // 只弹通用错误会把用户彻底卡死。这里刷新状态并释放编排锁。
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
          {t('common:update_password')}
        </Text>
        <PasswordForm form={form} submitting={submitting} onSubmit={form.handleSubmit(submit)} />
      </Box>
    </MyModal>
  );
};

export default ForceChangePasswordModal;
