import React, { type ReactNode, useCallback, useState } from 'react';
import { createContext } from 'use-context-selector';
import type { EditTeamFormDataType } from './EditInfoModal';
import dynamic from 'next/dynamic';
import {
  getTeamList,
  getTeamMemberCount,
  getTeamMembers,
  putSwitchTeam
} from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { TeamTmbItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';

const EditInfoModal = dynamic(() => import('./EditInfoModal'));

type TeamModalContextType = {
  myTeams: TeamTmbItemType[];
  isLoading: boolean;
  onSwitchTeam: (teamId: string) => void;
  setEditTeamData: React.Dispatch<React.SetStateAction<EditTeamFormDataType | undefined>>;

  refetchTeamSize: () => void;
  refetchTeams: () => void;
  teamSize: number;
};

export const TeamContext = createContext<TeamModalContextType>({
  myTeams: [],
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
  refetchTeamSize: function (): void {
    throw new Error('Function not implemented.');
  },
  teamSize: 0
});

export const TeamModalContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();

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

  const { data: teamMemberCountData, refresh: refetchTeamSize } = useRequest2(getTeamMemberCount, {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });

  const { runAsync: onSwitchTeam, loading: isSwitchingTeam } = useRequest2(
    async (teamId: string) => {
      await putSwitchTeam(teamId);
      return initUserInfo();
    },
    {
      onSuccess: () => {
        router.reload();
      },
      errorToast: t('common:user.team.Switch Team Failed')
    }
  );

  const isLoading = isLoadingTeams || isSwitchingTeam;

  const contextValue = {
    myTeams,
    refetchTeams,
    isLoading,
    onSwitchTeam,

    // create | update team
    setEditTeamData,
    teamSize: teamMemberCountData?.count || 0,
    refetchTeamSize
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
