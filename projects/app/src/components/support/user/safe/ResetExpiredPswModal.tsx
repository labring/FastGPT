import React from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getCheckPswExpired } from '@/web/support/user/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { accountCancellationActiveStatuses } from '@fastgpt/global/support/user/account/cancellation/constants';
import PasswordChangeModal from './PasswordChangeModal';

/** 仅在确有存储密码且已过期时开启不可关闭的统一改密流程；注销期间不触发改密。 */
const ResetExpiredPswModal = () => {
  const { userInfo } = useUserStore();
  const accountCancellationStatus = userInfo?.team?.accountCancellation?.status;
  const isAccountCancellationPending =
    accountCancellationStatus !== undefined &&
    accountCancellationActiveStatuses.includes(
      accountCancellationStatus as (typeof accountCancellationActiveStatuses)[number]
    );
  const { data: passwordExpired = false, runAsync: checkPasswordExpired } = useRequest(
    async () => {
      if (!userInfo?._id || isAccountCancellationPending) return false;
      return getCheckPswExpired();
    },
    {
      manual: false,
      refreshDeps: [userInfo?._id, isAccountCancellationPending]
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
