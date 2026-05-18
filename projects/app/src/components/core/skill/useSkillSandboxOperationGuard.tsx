import React, { useCallback, useState } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import ConfirmWarningModal from '@/components/common/Modal/ConfirmWarningModal';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';

type SkillSandboxOperationWarningType = 'system' | 'plan';
export type SkillSandboxPlanWarningType = 'switch' | 'skill' | 'operation';

/**
 * 统一展示 Skill/Agent 虚拟机套餐不可用提示，并在团队管理员场景提供升级入口。
 */
export const SkillSandboxPlanWarningModal = React.memo(function SkillSandboxPlanWarningModal({
  warningType,
  onClose
}: {
  warningType?: SkillSandboxPlanWarningType;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isTeamAdmin } = useUserStore();
  const {
    isOpen: isOpenRecharge,
    onOpen: onOpenRecharge,
    onClose: onCloseRecharge
  } = useDisclosure();

  const showUpgradeAction = !!warningType && isTeamAdmin;

  return (
    <>
      <ConfirmWarningModal
        isOpen={!!warningType}
        title={t('skill:sandbox_plan_not_supported_title')}
        content={
          warningType === 'skill'
            ? t('skill:sandbox_skill_plan_not_supported_content')
            : warningType === 'operation'
              ? t('skill:sandbox_operation_plan_not_supported_content')
              : t('skill:sandbox_plan_not_supported_content')
        }
        onClose={onClose}
        onConfirm={showUpgradeAction ? onOpenRecharge : undefined}
        confirmText={showUpgradeAction ? t('skill:sandbox_upgrade_action') : t('common:Close')}
        cancelText={t('common:Close')}
        showCancel={showUpgradeAction}
      />
      {isOpenRecharge && (
        <RechargeModal
          onClose={onCloseRecharge}
          onPaySuccess={() => {
            onCloseRecharge();
            onClose();
          }}
        />
      )}
    </>
  );
});

/**
 * 统一拦截 Skill 新建、导入、编辑等依赖虚拟机的操作。
 * 判断顺序固定为系统配置优先，再判断团队套餐，避免未配置场景误弹套餐升级入口。
 */
export const useSkillSandboxOperationGuard = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const [warningType, setWarningType] = useState<SkillSandboxOperationWarningType>();

  const showSandbox = !!feConfigs.show_agent_sandbox;
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus.standard.enableSandbox;

  const guardSkillSandboxOperation = useCallback(() => {
    if (!showSandbox) {
      setWarningType('system');
      return false;
    }

    if (!enableSandbox) {
      setWarningType('plan');
      return false;
    }

    return true;
  }, [enableSandbox, showSandbox]);

  const closeWarning = useCallback(() => {
    setWarningType(undefined);
  }, []);

  const SkillSandboxOperationGuardModal = (
    <>
      <ConfirmWarningModal
        isOpen={warningType === 'system'}
        title={t('skill:sandbox_operation_system_not_configured_title')}
        content={t('skill:sandbox_operation_system_not_configured_content')}
        onClose={closeWarning}
        onConfirm={undefined}
        confirmText={t('common:Close')}
        showCancel={false}
      />
      <SkillSandboxPlanWarningModal
        warningType={warningType === 'plan' ? 'operation' : undefined}
        onClose={closeWarning}
      />
    </>
  );

  return {
    guardSkillSandboxOperation,
    SkillSandboxOperationGuardModal
  };
};
