import React from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getCheckPswExpired } from '@/web/support/user/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import PasswordChangeModal from './PasswordChangeModal';
import { shouldCheckPasswordExpiration } from '@/pageComponents/account/info/password';

/** 仅在确有存储密码且已过期时开启不可关闭的统一改密流程。 */
const ResetExpiredPswModal = () => {
  const { userInfo } = useUserStore();
  const { data: passwordExpired = false, runAsync: checkPasswordExpired } = useRequest(
    async () => {
      if (
        !shouldCheckPasswordExpiration({
          userId: userInfo?._id,
          passwordAvailable: userInfo?.passwordAvailable
        })
      ) {
        return false;
      }
      return getCheckPswExpired();
    },
    {
      manual: false,
      refreshDeps: [userInfo?._id, userInfo?.passwordAvailable]
    }
  );

  return passwordExpired ? (
    <PasswordChangeModal
      required
      showExpiredPrompt
      onSuccess={async () => {
        await checkPasswordExpired();
      }}
    />
  ) : null;
};

export default React.memo(ResetExpiredPswModal);
