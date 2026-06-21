import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
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
 * Skill 运行依赖 Agent sandbox：选择 Skill 时会自动打开 sandbox；系统未配置或套餐不可用时
 * 不允许开启 sandbox，但保留关闭入口，避免历史配置无法自助修复。
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
          toast({
            status: 'warning',
            title: t('app:sandbox_free_not_support')
          });
          return;
        }
      }
      if (!checked && enableSandbox && hasSelectedAgentSkills) {
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
    [enableSandbox, hasSelectedAgentSkills, setAppForm, showSandbox, t, toast]
  );

  // 套餐/系统支持时，Skill 仍自动保持 sandbox 开启；不支持时保留历史值，交给用户手动关闭。
  useEffect(() => {
    const sandboxAvailable = showSandbox && enableSandbox;

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
