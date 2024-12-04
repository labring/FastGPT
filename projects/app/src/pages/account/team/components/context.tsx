import React, { ReactNode, useState } from 'react';
import { createContext } from 'use-context-selector';
import type { EditTeamFormDataType } from './EditInfoModal';
import dynamic from 'next/dynamic';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { TeamTmbItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { getGroupList } from '@/web/support/user/team/group/api';
import { MemberGroupListType } from '@fastgpt/global/support/permission/memberGroup/type';

const EditInfoModal = dynamic(() => import('./EditInfoModal'));

type TeamModalContextType = {
  myTeams: TeamTmbItemType[];
  members: TeamMemberItemType[];
  groups: MemberGroupListType;
  isLoading: boolean;
  onSwitchTeam: (teamId: string) => void;
  setEditTeamData: React.Dispatch<React.SetStateAction<EditTeamFormDataType | undefined>>;

  refetchMembers: () => void;
  refetchTeams: () => void;
  refetchGroups: () => void;
  searchKey: string;
  setSearchKey: React.Dispatch<React.SetStateAction<string>>;
  teamSize: number;
};

export const TeamContext = createContext<TeamModalContextType>({
  myTeams: [],
  groups: [],
  members: [],
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

  searchKey: '',
  setSearchKey: function (_value: React.SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  teamSize: 0
});

export const TeamModalContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [editTeamData, setEditTeamData] = useState<EditTeamFormDataType>();
  const { userInfo, initUserInfo, loadAndGetTeamMembers } = useUserStore();
  const [searchKey, setSearchKey] = useState('');

  const {
    data: myTeams = [],
    loading: isLoadingTeams,
    refresh: refetchTeams
  } = useRequest2(() => getTeamList(TeamMemberStatusEnum.active), {
    manual: false,
    refreshDeps: [userInfo?._id]
  });

  // member action
  const {
    data: members = [],
    runAsync: refetchMembers,
    loading: loadingMembers
  } = useRequest2(
    () => {
      if (!userInfo?.team?.teamId) return Promise.resolve([]);
      return loadAndGetTeamMembers(true);
    },
    {
      manual: false,
      refreshDeps: [userInfo?.team?.teamId]
    }
  );

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

  const isLoading = isLoadingTeams || isSwitchingTeam || loadingMembers || isLoadingGroups;

  const contextValue = {
    myTeams,
    refetchTeams,
    isLoading,
    onSwitchTeam,
    searchKey,
    setSearchKey,

    // create | update team
    setEditTeamData,
    members,
    refetchMembers,
    groups,
    refetchGroups,
    teamSize: members.length
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
