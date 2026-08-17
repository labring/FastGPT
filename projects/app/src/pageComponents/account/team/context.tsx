import React, { type ReactNode, useCallback, useState } from 'react';
import { createContext } from 'use-context-selector';
import type { EditTeamFormDataType } from './EditInfoModal';
import dynamic from 'next/dynamic';
import { getTeamList, getTeamMemberCount, putSwitchTeam } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useRouter } from 'next/router';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { accountCancellationActiveStatuses } from '@fastgpt/global/support/user/account/cancellation/constants';

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
  const { t } = useClientTranslation();
  const router = useRouter();

  const [editTeamData, setEditTeamData] = useState<EditTeamFormDataType>();
  const { userInfo, initUserInfo } = useUserStore();
  const { resetChatCache } = useChatStore();

  const {
    data: myTeams = [],
    loading: isLoadingTeams,
    refresh: refetchTeams
  } = useRequest(() => getTeamList(TeamMemberStatusEnum.active), {
    manual: false,
    refreshDeps: [userInfo?._id]
  });

  const { data: teamMemberCountData, refresh: refetchTeamSize } = useRequest(getTeamMemberCount, {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });

  const { runAsync: onSwitchTeam, loading: isSwitchingTeam } = useRequest(
    async (teamId: string) => {
      const targetTeam = myTeams.find((team) => team.teamId === teamId);
      await putSwitchTeam(teamId);
      resetChatCache();
      const isAccountCancellationPending = accountCancellationActiveStatuses.includes(
        targetTeam?.accountCancellation
          ?.status as (typeof accountCancellationActiveStatuses)[number]
      );
      if (isAccountCancellationPending) {
        await router.replace('/account/cancel');
      } else if (router.pathname === '/account/cancel') {
        await router.replace('/account/info');
      } else {
        await router.reload();
      }
      return isAccountCancellationPending;
    },
    {
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
