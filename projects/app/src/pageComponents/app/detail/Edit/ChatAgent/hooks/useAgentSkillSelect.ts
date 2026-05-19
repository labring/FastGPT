import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import { useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type {
  AppFormEditFormType,
  SelectedAgentSkillItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { checkAgentSkillSandboxUnavailable } from '../utils';
import type { SkillSandboxPlanWarningType } from '@/components/core/skill/useSkillSandboxOperationGuard';
import { useSelectedAgentSkillStatus } from '../../FormComponent/ToolSelector/hooks/useSelectedAgentSkillStatus';

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
  const [sandboxPlanWarning, setSandboxPlanWarning] = useState<SkillSandboxPlanWarningType>();
  const hasShownSandboxUnavailableWarningRef = useRef(false);
  const closeSandboxPlanWarning = useCallback(() => {
    setSandboxPlanWarning(undefined);
  }, []);
  const {
    isOpen: isOpenSkillSelect,
    onOpen: onOpenSkillSelect,
    onClose: onCloseSkillSelect
  } = useDisclosure();

  const selectedAgentSkills = appForm.selectedAgentSkills || [];
  const selectedAgentSkillStatus = useSelectedAgentSkillStatus(selectedAgentSkills);
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
      setSandboxPlanWarning('skill');
      return;
    }
    onOpenSkillSelect();
  }, [enableSandbox, onOpenSkillSelect, showSandbox, t, toast]);

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
      if (!showSandbox) {
        toast({
          status: 'warning',
          title: t('skill:sandbox_system_not_configured_toast')
        });
        return;
      }
      if (!enableSandbox) {
        setSandboxPlanWarning('switch');
        return;
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
    [enableSandbox, hasSelectedAgentSkills, setAppForm, showSandbox, t, toast]
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
    selectedAgentSkillStatus,
    isAgentSkillSandboxUnavailable,
    isOpenSkillSelect,
    onCloseSkillSelect,
    openSkillSelect,
    onAddAgentSkill,
    onRemoveAgentSkill,
    onChangeAgentSandbox,
    sandboxPlanWarning,
    closeSandboxPlanWarning
  };
};
