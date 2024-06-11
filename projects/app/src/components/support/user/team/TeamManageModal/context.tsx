import React, { ReactNode, useCallback, useState } from 'react';
import { createContext } from 'use-context-selector';
import type { EditTeamFormDataType } from './components/EditInfoModal';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import {
  delMemberPermission,
  getTeamList,
  getTeamMembers,
  putSwitchTeam,
  updateMemberPermission
} from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { TeamTmbItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import CollaboratorContextProvider from '@/components/support/permission/MemberManager/context';
import { TeamPermissionList } from '@fastgpt/global/support/permission/user/constant';
import {
  CollaboratorItemType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';

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
    runAsync: refetchMembers,
    loading: loadingMembers
  } = useRequest2(
    () => {
      if (!userInfo?.team?.teamId) return Promise.resolve([]);
      return getTeamMembers();
    },
    {
      manual: false,
      refreshDeps: [userInfo?.team?.teamId]
    }
  );

  const onGetClbList = useCallback(() => {
    return refetchMembers().then((res) =>
      res.map<CollaboratorItemType>((member) => ({
        teamId: member.teamId,
        tmbId: member.tmbId,
        permission: member.permission,
        name: member.memberName,
        avatar: member.avatar
      }))
    );
  }, [refetchMembers]);
  const { runAsync: onUpdatePer, loading: isUpdatingPer } = useRequest2(
    (props: UpdateClbPermissionProps) => {
      return updateMemberPermission(props);
    }
  );

  const { mutate: onSwitchTeam, isLoading: isSwitchingTeam } = useRequest({
    mutationFn: async (teamId: string) => {
      await putSwitchTeam(teamId);
      return initUserInfo();
    },
    errorToast: t('user.team.Switch Team Failed')
  });

  const isLoading = isLoadingTeams || isSwitchingTeam || loadingMembers || isUpdatingPer;

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
      {userInfo?.team?.permission && (
        <CollaboratorContextProvider
          permission={userInfo?.team?.permission}
          permissionList={TeamPermissionList}
          onGetCollaboratorList={onGetClbList}
          onUpdateCollaborators={onUpdatePer}
          onDelOneCollaborator={delMemberPermission}
        >
          {() => (
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
        </CollaboratorContextProvider>
      )}
    </TeamModalContext.Provider>
  );
};
