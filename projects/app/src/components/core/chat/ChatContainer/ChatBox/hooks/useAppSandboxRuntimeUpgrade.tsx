import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { SandboxRuntimeStatusResponse } from '@fastgpt/global/core/ai/sandbox/type';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { ChatSourceTarget } from '@/web/core/chat/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import SandboxRuntimeUpgradeModal from '@/components/core/ai/SandboxRuntimeUpgradeModal';
import { useSandboxRuntimeUpgrade } from '@/components/core/ai/useSandboxRuntimeUpgrade';
import {
  getSandboxRuntimeStatus,
  upgradeSandboxRuntime
} from '@/pageComponents/chat/SandboxEditor/api';

/** 把 App Chat 目标和弹窗文案适配到共享 runtime 升级控制器。 */
export const useAppSandboxRuntimeUpgrade = ({
  sourceTarget,
  chatId,
  outLinkAuthData
}: {
  sourceTarget?: ChatSourceTarget;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  const { t } = useTranslation();
  const [openTargetKey, setOpenTargetKey] = useState<string>();
  const pendingRetryRef = useRef<{ targetKey: string; retry: () => void }>();
  const targetKey = useMemo(
    () =>
      [
        sourceTarget?.sourceType,
        sourceTarget?.sourceId,
        chatId,
        outLinkAuthData?.shareId,
        outLinkAuthData?.outLinkUid
      ].join(':'),
    [
      sourceTarget?.sourceType,
      sourceTarget?.sourceId,
      chatId,
      outLinkAuthData?.shareId,
      outLinkAuthData?.outLinkUid
    ]
  );
  const isAppTarget = sourceTarget?.sourceType === ChatSourceTypeEnum.app;

  useLayoutEffect(() => {
    pendingRetryRef.current = undefined;
  }, [targetKey]);

  const getRequestBody = useMemoizedFn(() => {
    if (!sourceTarget || sourceTarget.sourceType !== ChatSourceTypeEnum.app) return;
    if (outLinkAuthData?.shareId && outLinkAuthData.outLinkUid) {
      return { chatId, outLinkAuthData };
    }
    return { chatId, appId: sourceTarget.sourceId };
  });
  const requestRuntimeStatus = useMemoizedFn(() => {
    const body = getRequestBody();
    return body
      ? getSandboxRuntimeStatus(body)
      : Promise.reject(new Error('App sandbox runtime target is unavailable'));
  });
  const requestRuntimeUpgrade = useMemoizedFn(() => {
    const body = getRequestBody();
    return body
      ? upgradeSandboxRuntime(body)
      : Promise.reject(new Error('App sandbox runtime target is unavailable'));
  });

  const {
    runtimeStatus,
    upgradeRuntime,
    cancelRuntimeUpgrade,
    applyRuntimeStatus: applySharedRuntimeStatus
  } = useSandboxRuntimeUpgrade({
    targetKey,
    getStatus: requestRuntimeStatus,
    upgrade: requestRuntimeUpgrade,
    getErrorMessage: (error) => getErrText(error, t('skill:sandbox_runtime_upgrade_failed')),
    onReady: ({ upgraded }) => {
      setOpenTargetKey(undefined);
      const pendingRetry = pendingRetryRef.current;
      pendingRetryRef.current = undefined;
      if (upgraded && pendingRetry?.targetKey === targetKey) pendingRetry.retry();
    }
  });

  const closeRuntimeUpgrade = useMemoizedFn(() => {
    pendingRetryRef.current = undefined;
    setOpenTargetKey(undefined);
    cancelRuntimeUpgrade();
  });

  const handleRuntimeStatus = useMemoizedFn(
    (status: SandboxRuntimeStatusResponse, retryPendingPrompt?: () => void) => {
      if (!isAppTarget) return;
      if (status.status === 'readyToInit') {
        pendingRetryRef.current = undefined;
      } else if (retryPendingPrompt) {
        pendingRetryRef.current = { targetKey, retry: retryPendingPrompt };
      }
      setOpenTargetKey(status.status === 'readyToInit' ? undefined : targetKey);
      void applySharedRuntimeStatus(status);
    }
  );

  const isUpgrading = runtimeStatus?.status === 'upgrading';
  const RuntimeUpgradeModal = (
    <SandboxRuntimeUpgradeModal
      isOpen={openTargetKey === targetKey && !!runtimeStatus}
      isUpgrading={isUpgrading}
      title={
        isUpgrading
          ? t('skill:sandbox_runtime_upgrade_in_progress')
          : t('skill:sandbox_runtime_upgrade_required')
      }
      description={t('skill:sandbox_runtime_upgrade_desc')}
      confirmText={t('skill:sandbox_runtime_upgrade_confirm')}
      secondaryText={t('common:Close')}
      error={runtimeStatus?.lastError}
      onUpgrade={() => void upgradeRuntime()}
      onClose={closeRuntimeUpgrade}
    />
  );

  return {
    handleSandboxRuntimeStatus: handleRuntimeStatus,
    RuntimeUpgradeModal
  };
};
