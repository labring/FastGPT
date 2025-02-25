import React, { ReactNode, useState } from 'react';
import { createContext } from 'use-context-selector';
import type { EditTeamFormDataType } from './EditInfoModal';
import dynamic from 'next/dynamic';
import { getTeamList, getTeamMembers, putSwitchTeam } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { TeamTmbItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { getGroupList } from '@/web/support/user/team/group/api';
import { MemberGroupListType } from '@fastgpt/global/support/permission/memberGroup/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getOrgList } from '@/web/support/user/team/org/api';
import { OrgType } from '@fastgpt/global/support/user/team/org/type';

const EditInfoModal = dynamic(() => import('./EditInfoModal'));

type TeamModalContextType = {
  myTeams: TeamTmbItemType[];
  members: TeamMemberItemType[];
  groups: MemberGroupListType;
  orgs: OrgType[];
  isLoading: boolean;
  onSwitchTeam: (teamId: string) => void;
  setEditTeamData: React.Dispatch<React.SetStateAction<EditTeamFormDataType | undefined>>;

  refetchMembers: () => void;
  refetchTeams: () => void;
  refetchGroups: () => void;
  refetchOrgs: () => void;
  teamSize: number;
  MemberScrollData: ReturnType<typeof useScrollPagination>['ScrollData'];
};

export const TeamContext = createContext<TeamModalContextType>({
  myTeams: [],
  groups: [],
  members: [],
  orgs: [],
  isLoading: false,
  onSwitchTeam: function (_teamId: string): void {
    throw new Error('Function not implemented.');
  },
  setEditTeamData: function (_value: React.SetStateAction<EditTeamFormDataType | undefined>): void {
    throw new Error('Function not implemented.');
  },
  refetchTeams: function (): void {
    throw new Error('Function not implemented.');
  },
  refetchMembers: function (): void {
    throw new Error('Function not implemented.');
  },
  refetchGroups: function (): void {
    throw new Error('Function not implemented.');
  },
  refetchOrgs: function (): void {
    throw new Error('Function not implemented.');
  },
  teamSize: 0,
  MemberScrollData: () => <></>
});

export const TeamModalContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [editTeamData, setEditTeamData] = useState<EditTeamFormDataType>();
  const { userInfo, initUserInfo } = useUserStore();

  const {
    data: myTeams = [],
    loading: isLoadingTeams,
    refresh: refetchTeams
  } = useRequest2(() => getTeamList(TeamMemberStatusEnum.active), {
    manual: false,
    refreshDeps: [userInfo?._id]
  });

  const {
    data: orgs = [],
    loading: isLoadingOrgs,
    refresh: refetchOrgs
  } = useRequest2(getOrgList, {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });

  // member action
  const {
    data: members = [],
    isLoading: loadingMembers,
    refreshList: refetchMembers,
    total: memberTotal,
    ScrollData: MemberScrollData
  } = useScrollPagination(getTeamMembers, {
    pageSize: 1000,
    params: {
      withLeaved: true
    }
  });

  const { runAsync: onSwitchTeam, loading: isSwitchingTeam } = useRequest2(
    async (teamId: string) => {
      await putSwitchTeam(teamId);
      return initUserInfo();
    },
    {
      errorToast: t('common:user.team.Switch Team Failed')
    }
  );

  const {
    data: groups = [],
    loading: isLoadingGroups,
    refresh: refetchGroups
  } = useRequest2(getGroupList, {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });

  const isLoading =
    isLoadingTeams || isSwitchingTeam || loadingMembers || isLoadingGroups || isLoadingOrgs;

  const contextValue = {
    myTeams,
    refetchTeams,
    isLoading,
    onSwitchTeam,
    orgs,
    refetchOrgs,

    // create | update team
    setEditTeamData,
    members,
    refetchMembers,
    groups,
    refetchGroups,
    teamSize: memberTotal,
    MemberScrollData
  };

  return (
    <TeamContext.Provider value={contextValue}>
      {userInfo?.team?.permission && (
        <>
          {children}
          {!!editTeamData && (
            <EditInfoModal
              defaultData={editTeamData}
              onClose={() => setEditTeamData(undefined)}
              onSuccess={() => {
                refetchTeams();
                initUserInfo();
              }}
            />
          )}
        </>
      )}
    </TeamContext.Provider>
  );
};

export default TeamModalContextProvider;
