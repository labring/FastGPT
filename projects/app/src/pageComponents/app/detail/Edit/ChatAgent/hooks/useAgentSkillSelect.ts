import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type {
  AppFormEditFormType,
  SelectedAgentSkillItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { checkAgentSkillSandboxUnavailable } from '../utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

/**
 * 管理 ChatAgent 表单中的 Skill 选择与 sandbox 开关联动。
 *
 * Skill 运行依赖 Agent sandbox：选择 Skill 时会自动打开 sandbox；已有 Skill 时不允许手动关闭
 * sandbox；系统未配置或套餐不可用时统一给出提示，避免表单保存出无法运行的组合状态。
 */
export const useAgentSkillSelect = ({
  appForm,
  setAppForm,
  showSandbox,
  enableSandbox
}: {
  appForm: AppFormEditFormType;
  setAppForm: Dispatch<SetStateAction<AppFormEditFormType>>;
  showSandbox?: boolean;
  enableSandbox?: boolean;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isTeamAdmin } = useUserStore();
  const { openConfirm, ConfirmModal } = useConfirm();
  const {
    isOpen: isOpenRecharge,
    onOpen: onOpenRecharge,
    onClose: onCloseRecharge
  } = useDisclosure();
  const hasShownSandboxUnavailableWarningRef = useRef(false);
  const {
    isOpen: isOpenSkillSelect,
    onOpen: onOpenSkillSelect,
    onClose: onCloseSkillSelect
  } = useDisclosure();

  const selectedAgentSkills = appForm.selectedAgentSkills || [];
  const hasSelectedAgentSkills = selectedAgentSkills.length > 0;
  const isAgentSkillSandboxUnavailable = checkAgentSkillSandboxUnavailable({
    appForm,
    showSandbox,
    enableSandbox
  });

  const openSkillSelect = useCallback(() => {
    if (!showSandbox) {
      toast({
        status: 'warning',
        title: t('skill:sandbox_skill_system_not_configured_toast')
      });
      return;
    }
    if (!enableSandbox) {
      openConfirm({
        title: t('skill:sandbox_plan_not_supported_title'),
        customContent: t('skill:sandbox_skill_plan_not_supported_content'),
        onConfirm: isTeamAdmin ? onOpenRecharge : undefined,
        confirmText: isTeamAdmin ? t('skill:sandbox_upgrade_action') : t('common:Close'),
        cancelText: t('common:Close'),
        showCancel: isTeamAdmin
      })();
      return;
    }
    onOpenSkillSelect();
  }, [
    enableSandbox,
    onOpenSkillSelect,
    showSandbox,
    t,
    toast,
    openConfirm,
    isTeamAdmin,
    onOpenRecharge
  ]);

  const onAddAgentSkill = useCallback(
    (skill: SelectedAgentSkillItemType) => {
      setAppForm((state) => ({
        ...state,
        selectedAgentSkills: [skill, ...(state.selectedAgentSkills || [])],
        aiSettings: {
          ...state.aiSettings,
          useAgentSandbox: true
        }
      }));
      if (!appForm.aiSettings.useAgentSandbox) {
        toast({
          status: 'success',
          title: t('skill:sandbox_auto_enabled_for_skill')
        });
      }
    },
    [appForm.aiSettings.useAgentSandbox, setAppForm, t, toast]
  );

  const onRemoveAgentSkill = useCallback(
    (skillId: string) => {
      setAppForm((state) => ({
        ...state,
        selectedAgentSkills:
          state.selectedAgentSkills?.filter((item) => item.skillId !== skillId) || []
      }));
    },
    [setAppForm]
  );

  const onChangeAgentSandbox = useCallback(
    (checked: boolean) => {
      if (checked) {
        if (!showSandbox) {
          toast({
            status: 'warning',
            title: t('skill:sandbox_system_not_configured_toast')
          });
          return;
        }
        if (!enableSandbox) {
          openConfirm({
            title: t('skill:sandbox_plan_not_supported_title'),
            customContent: t('skill:sandbox_plan_not_supported_content'),
            onConfirm: isTeamAdmin ? onOpenRecharge : undefined,
            confirmText: isTeamAdmin ? t('skill:sandbox_upgrade_action') : t('common:Close'),
            cancelText: t('common:Close'),
            showCancel: isTeamAdmin
          })();
          return;
        }
      }
      if (!checked && hasSelectedAgentSkills) {
        toast({
          status: 'warning',
          title: t('skill:sandbox_disable_blocked_toast')
        });
        return;
      }
      setAppForm((state) => ({
        ...state,
        aiSettings: {
          ...state.aiSettings,
          useAgentSandbox: checked
        }
      }));
    },
    [
      enableSandbox,
      hasSelectedAgentSkills,
      setAppForm,
      showSandbox,
      t,
      toast,
      openConfirm,
      isTeamAdmin,
      onOpenRecharge
    ]
  );

  // 按系统/套餐能力同步修复历史 Skill 与虚拟机开关状态。
  useEffect(() => {
    const sandboxAvailable = showSandbox && enableSandbox;

    if (!sandboxAvailable && appForm.aiSettings.useAgentSandbox) {
      setAppForm((state) => ({
        ...state,
        aiSettings: {
          ...state.aiSettings,
          useAgentSandbox: false
        }
      }));

      if (hasSelectedAgentSkills && !hasShownSandboxUnavailableWarningRef.current) {
        hasShownSandboxUnavailableWarningRef.current = true;
        openSkillSelect();
      }
      return;
    }

    if (sandboxAvailable && hasSelectedAgentSkills && !appForm.aiSettings.useAgentSandbox) {
      setAppForm((state) => ({
        ...state,
        aiSettings: {
          ...state.aiSettings,
          useAgentSandbox: true
        }
      }));
    }
  }, [
    appForm.aiSettings.useAgentSandbox,
    enableSandbox,
    hasSelectedAgentSkills,
    openSkillSelect,
    setAppForm,
    showSandbox
  ]);

  return {
    selectedAgentSkills,
    isAgentSkillSandboxUnavailable,
    isOpenSkillSelect,
    onCloseSkillSelect,
    openSkillSelect,
    onAddAgentSkill,
    onRemoveAgentSkill,
    onChangeAgentSandbox,
    ConfirmModal,
    isOpenRecharge,
    onCloseRecharge
  };
};
