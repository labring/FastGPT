import { useEffect, useRef } from 'react';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { bindAgentSkillAssociateListener } from '@/web/core/skill/agentSkillAssociateBridge';

/**
 * Agent 编辑页 hook：监听 Dashboard 跨页回传并自动关联 skill。
 */
export const useAgentSkillPendingAssociate = ({
  appId,
  onAddSkill
}: {
  appId?: string;
  onAddSkill: (skill: SelectedAgentSkillItemType) => boolean | void;
}) => {
  const onAddSkillRef = useRef(onAddSkill);

  useEffect(() => {
    onAddSkillRef.current = onAddSkill;
  }, [onAddSkill]);

  useEffect(() => {
    if (!appId) return;

    return bindAgentSkillAssociateListener(appId, (skill) => onAddSkillRef.current(skill));
  }, [appId]);
};
