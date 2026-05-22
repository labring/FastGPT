import React, { useCallback } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

/**
 * 统一拦截 Skill 新建、导入、编辑等依赖虚拟机的操作。
 * 判断顺序固定为系统配置优先，再判断团队套餐，避免未配置场景误弹套餐升级入口。
 */
export const useSkillSandboxOperationGuard = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus, isTeamAdmin } = useUserStore();
  const { openConfirm, ConfirmModal } = useConfirm();
  const {
    isOpen: isOpenRecharge,
    onOpen: onOpenRecharge,
    onClose: onCloseRecharge
  } = useDisclosure();

  const showSandbox = !!feConfigs.show_agent_sandbox;
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus.standard.enableSandbox;

  const guardSkillSandboxOperation = useCallback(() => {
    if (!showSandbox) {
      openConfirm({
        title: t('skill:sandbox_operation_system_not_configured_title'),
        customContent: t('skill:sandbox_operation_system_not_configured_content'),
        confirmText: t('common:Close'),
        showCancel: false
      })();
      return false;
    }

    if (!enableSandbox) {
      const showUpgradeAction = isTeamAdmin;
      openConfirm({
        title: t('skill:sandbox_plan_not_supported_title'),
        customContent: t('skill:sandbox_operation_plan_not_supported_content'),
        onConfirm: showUpgradeAction ? onOpenRecharge : undefined,
        confirmText: showUpgradeAction ? t('skill:sandbox_upgrade_action') : t('common:Close'),
        cancelText: t('common:Close'),
        showCancel: showUpgradeAction
      })();
      return false;
    }

    return true;
  }, [enableSandbox, isTeamAdmin, onOpenRecharge, openConfirm, showSandbox, t]);

  const SkillSandboxOperationGuardModal = (
    <>
      <ConfirmModal />
      {isOpenRecharge && <RechargeModal onClose={onCloseRecharge} onPaySuccess={onCloseRecharge} />}
    </>
  );

  return {
    guardSkillSandboxOperation,
    SkillSandboxOperationGuardModal
  };
};
