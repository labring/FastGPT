import React, { type ReactNode, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import type { AgentSkillDetailType } from '@fastgpt/global/core/agentSkills/type';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSkillDetail } from '@/web/core/skill/api';
import { SkillPermission } from '@fastgpt/global/support/permission/agentSkill/controller';

export enum TabEnum {
  config = 'config',
  preview = 'preview'
}

type SkillDetailContextType = {
  skillId: string;
  skillDetail: AgentSkillDetailType | undefined;
  isFetchingSkillDetail: boolean;
  refreshSkillDetail: () => void;
  currentTab: TabEnum;
  setCurrentTab: (tab: TabEnum) => void;
};

export const SkillDetailContext = createContext<SkillDetailContextType>({
  skillId: '',
  skillDetail: undefined,
  isFetchingSkillDetail: false,
  refreshSkillDetail: () => {},
  currentTab: TabEnum.config,
  setCurrentTab: () => {}
});

const SkillDetailContextProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const { skillId = '' } = router.query as { skillId: string };

  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.config);

  // Skill detail fetch
  const {
    data: skillDetail,
    loading: isFetchingSkillDetail,
    run: refreshSkillDetail
  } = useRequest(
    async () => {
      if (!skillId) return undefined;
      const res = await getSkillDetail({ skillId });
      const detail: AgentSkillDetailType = {
        ...res,
        type: AgentSkillTypeEnum.skill,
        config: res.config ?? {},
        teamId: res.teamId ?? '',
        tmbId: res.tmbId ?? '',
        currentVersion: 0,
        versionCount: 0,
        createTime: new Date(res.createTime),
        updateTime: new Date(res.updateTime),
        appCount: res.appCount ?? 0,
        permission: new SkillPermission({
          role: res.permission?.role ?? 0,
          isOwner: !!res.permission?.isOwner
        })
      };
      return detail;
    },
    {
      manual: false,
      refreshDeps: [skillId]
    }
  );

  const contextValue: SkillDetailContextType = useMemo(
    () => ({
      skillId,
      skillDetail,
      isFetchingSkillDetail,
      refreshSkillDetail,
      currentTab,
      setCurrentTab
    }),
    [skillId, skillDetail, isFetchingSkillDetail, refreshSkillDetail, currentTab]
  );

  return <SkillDetailContext.Provider value={contextValue}>{children}</SkillDetailContext.Provider>;
};

export default SkillDetailContextProvider;
