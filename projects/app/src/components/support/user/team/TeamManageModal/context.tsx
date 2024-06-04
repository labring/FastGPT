import React, { ReactNode, useState } from 'react';
import { createContext } from 'use-context-selector';
import type { EditTeamFormDataType } from './components/EditInfoModal';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { getTeamList, getTeamMembers, putSwitchTeam } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { TeamTmbItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';

const EditInfoModal = dynamic(() => import('./components/EditInfoModal'));

type TeamModalContextType = {
  myTeams: TeamTmbItemType[];
  refetchTeams: () => void;
  isLoading: boolean;
  onSwitchTeam: (teamId: string) => void;

  setEditTeamData: React.Dispatch<React.SetStateAction<EditTeamFormDataType | undefined>>;
  members: TeamMemberItemType[];
  refetchMembers: () => void;
};

export const TeamModalContext = createContext<TeamModalContextType>({
  myTeams: [],
  isLoading: false,
  onSwitchTeam: function (teamId: string): void {
    throw new Error('Function not implemented.');
  },
  setEditTeamData: function (value: React.SetStateAction<EditTeamFormDataType | undefined>): void {
    throw new Error('Function not implemented.');
  },
  members: [],
  refetchTeams: function (): void {
    throw new Error('Function not implemented.');
  },
  refetchMembers: function (): void {
    throw new Error('Function not implemented.');
  }
});

export const TeamModalContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [editTeamData, setEditTeamData] = useState<EditTeamFormDataType>();
  const { userInfo, initUserInfo } = useUserStore();

  const {
    data: myTeams = [],
    isFetching: isLoadingTeams,
    refetch: refetchTeams
  } = useQuery(['getTeams', userInfo?._id], () => getTeamList(TeamMemberStatusEnum.active));

  // member action
  const {
    data: members = [],
    refetch: refetchMembers,
    isLoading: loadingMembers
  } = useQuery(['getMembers', userInfo?.team?.teamId], () => {
    if (!userInfo?.team?.teamId) return [];
    return getTeamMembers();
  });

  const { mutate: onSwitchTeam, isLoading: isSwitchingTeam } = useRequest({
    mutationFn: async (teamId: string) => {
      await putSwitchTeam(teamId);
      return initUserInfo();
    },
    errorToast: t('user.team.Switch Team Failed')
  });

  const isLoading = isLoadingTeams || isSwitchingTeam || loadingMembers;

  const contextValue = {
    myTeams,
    refetchTeams,
    isLoading,
    onSwitchTeam,

    // create | update team
    setEditTeamData,
    members,
    refetchMembers
  };

  return (
    <TeamModalContext.Provider value={contextValue}>
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
    </TeamModalContext.Provider>
  );
};
