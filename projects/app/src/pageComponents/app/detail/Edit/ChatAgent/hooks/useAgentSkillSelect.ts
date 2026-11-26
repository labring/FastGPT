import { useCallback, useEffect } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { checkAgentSandboxIssues } from '@/web/core/workflow/check/resource';
import { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

type UseAgentSkillSelectProps = {
  showSandbox?: boolean;
  enableSandbox?: boolean;
  selectedAgentSkills: SelectedAgentSkillItemType[];
  useAgentSandbox: boolean;
  /** 用最新列表应用更新，异步选择多个技能时不覆盖期间已完成的修改。 */
  onUpdateSkills: (
    update: (skills: SelectedAgentSkillItemType[]) => SelectedAgentSkillItemType[],
    enableSandbox?: boolean
  ) => void;
  onUpdateSandbox: (checked: boolean) => void;
};

/**
 * 管理 ChatAgent 表单与工作流 Agent 节点中的 Skill 选择及 sandbox 开关联动。
 *
 * Skill 运行依赖 Agent sandbox：选择 Skill 时会自动打开 sandbox；系统未配置或套餐不可用时
 * 不允许开启 sandbox，但保留关闭入口，避免历史配置无法自助修复。
 */
export const useAgentSkillSelect = (props: UseAgentSkillSelectProps) => {
  const { showSandbox, enableSandbox } = props;
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

  const { selectedAgentSkills, useAgentSandbox, onUpdateSkills, onUpdateSandbox } = props;
  const hasSelectedAgentSkills = selectedAgentSkills.length > 0;
  const isAgentSkillSandboxUnavailable =
    checkAgentSandboxIssues({
      useAgentSandbox,
      hasSkills: hasSelectedAgentSkills,
      showSandbox,
      enableSandbox
    })[0]?.code === WorkflowCheckIssueCodeEnum.sandboxSkillUnavailable;

  const checkSkillSandboxAvailable = useCallback(() => {
    if (!showSandbox) {
      toast({
        status: 'warning',
        title: t('skill:sandbox_skill_system_not_configured_toast')
      });
      return false;
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
      return false;
    }
    return true;
  }, [enableSandbox, showSandbox, t, toast, openConfirm, isTeamAdmin, onOpenRecharge]);

  const openSkillSelect = useCallback(() => {
    if (checkSkillSandboxAvailable()) onOpenSkillSelect();
  }, [checkSkillSandboxAvailable, onOpenSkillSelect]);

  const onAddAgentSkill = useCallback(
    (skill: SelectedAgentSkillItemType) => {
      if (!checkSkillSandboxAvailable()) return false;

      onUpdateSkills(
        (skills) => [skill, ...skills.filter((item) => item.skillId !== skill.skillId)],
        true
      );
      if (!useAgentSandbox) {
        toast({
          status: 'success',
          title: t('skill:sandbox_auto_enabled_for_skill')
        });
      }
      return true;
    },
    [checkSkillSandboxAvailable, onUpdateSkills, t, toast, useAgentSandbox]
  );

  const onRemoveAgentSkill = useCallback(
    (skillId: string) => {
      onUpdateSkills((skills) => skills.filter((item) => item.skillId !== skillId));
    },
    [onUpdateSkills]
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
      if (!checked && showSandbox && enableSandbox && hasSelectedAgentSkills) {
        toast({
          status: 'warning',
          title: t('skill:sandbox_disable_blocked_toast')
        });
        return;
      }
      onUpdateSandbox(checked);
    },
    [enableSandbox, hasSelectedAgentSkills, onUpdateSandbox, showSandbox, t, toast]
  );

  // 套餐/系统支持时，Skill 仍自动保持 sandbox 开启；不支持时保留历史值，交给用户手动关闭。
  useEffect(() => {
    const sandboxAvailable = showSandbox && enableSandbox;

    if (sandboxAvailable && hasSelectedAgentSkills && !useAgentSandbox) {
      onUpdateSandbox(true);
    }
  }, [enableSandbox, hasSelectedAgentSkills, onUpdateSandbox, showSandbox, useAgentSandbox]);

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
