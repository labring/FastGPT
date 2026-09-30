import React from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getCheckPswExpired } from '@/web/support/user/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { accountCancellationActiveStatuses } from '@fastgpt/global/support/user/account/cancellation/constants';
import PasswordChangeModal from './PasswordChangeModal';
import { shouldCheckPasswordExpiration } from '@/pageComponents/account/info/password';

type Props = {
  enabled?: boolean;
  onFinish?: () => void;
};

/** 仅在确有存储密码且已过期时开启不可关闭的统一改密流程；完成后回查状态并通知登录后动作编排器。 */
const ResetExpiredPswModal = ({ enabled = true, onFinish }: Props) => {
  const { userInfo } = useUserStore();
  const accountCancellationStatus = userInfo?.team?.accountCancellation?.status;
  const isAccountCancellationPending =
    accountCancellationStatus !== undefined &&
    accountCancellationActiveStatuses.includes(
      accountCancellationStatus as (typeof accountCancellationActiveStatuses)[number]
    );
  const { data: passwordExpired = false, runAsync: checkPasswordExpired } = useRequest(
    async () => {
      if (!enabled || isAccountCancellationPending) return false;
      // passwordAvailable === false 表示当前部署禁止该账号使用平台密码（如受限 SSO 账号），
      // 此时不应发起过期检查，否则会弹出用户无法完成的强制改密流程。
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
      onSuccess(res) {
        if (enabled && !res) onFinish?.();
      },
      onError() {
        if (enabled) onFinish?.();
      },
      // passwordAvailable 由 userInfo 下发，策略变化后需要重新判断是否发起过期检查
      refreshDeps: [
        enabled,
        userInfo?._id,
        userInfo?.passwordAvailable,
        isAccountCancellationPending
      ]
    }
  );

  return enabled && passwordExpired ? (
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
