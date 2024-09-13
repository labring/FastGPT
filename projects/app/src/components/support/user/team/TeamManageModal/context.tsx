import React, { ReactNode, useCallback, useState } from 'react';
import { createContext } from 'use-context-selector';
import type { EditTeamFormDataType } from './components/EditInfoModal';
import dynamic from 'next/dynamic';
import {
  delMemberPermission,
  getTeamClbs,
  getTeamList,
  putSwitchTeam,
  updateMemberPermission
} from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { TeamTmbItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import CollaboratorContextProvider from '@/components/support/permission/MemberManager/context';
import { TeamPermissionList } from '@fastgpt/global/support/permission/user/constant';
import {
  CollaboratorItemType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import { getGroupList } from '@/web/support/user/team/group/api';
import { MemberGroupListType } from '@fastgpt/global/support/permission/memberGroup/type';
import { ResourcePermissionType } from '@fastgpt/global/support/permission/type';

const EditInfoModal = dynamic(() => import('./components/EditInfoModal'));

type TeamModalContextType = {
  myTeams: TeamTmbItemType[];
  members: TeamMemberItemType[];
  clbs: ResourcePermissionType[];
  groups: MemberGroupListType;
  isLoading: boolean;
  onSwitchTeam: (teamId: string) => void;
  setEditTeamData: React.Dispatch<React.SetStateAction<EditTeamFormDataType | undefined>>;

  refetchMembers: () => void;
  refetchTeams: () => void;
  refetchGroups: () => void;
  refetchClbs: () => void;
};

export const TeamModalContext = createContext<TeamModalContextType>({
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
  clbs: [],
  refetchClbs: function (): void {
    throw new Error('Function not implemented.');
  }
});

export const TeamModalContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [editTeamData, setEditTeamData] = useState<EditTeamFormDataType>();
  const { userInfo, initUserInfo, loadAndGetTeamMembers } = useUserStore();

  const {
    runAsync: refetchClbs,
    loading: isLoadingClbs,
    data: clbs = []
  } = useRequest2(getTeamClbs, {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });

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

  const onGetClbList = useCallback(
    () =>
      refetchMembers().then((res) =>
        res.map<CollaboratorItemType>((member) => ({
          teamId: member.teamId,
          tmbId: member.tmbId,
          permission: member.permission,
          name: member.memberName,
          avatar: member.avatar
        }))
      ),
    [refetchMembers]
  );

  const { runAsync: onUpdatePer, loading: isUpdatingPer } = useRequest2(
    (props: UpdateClbPermissionProps) => updateMemberPermission(props)
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
  } = useRequest2(() => getGroupList(), {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });

  const isLoading =
    isLoadingTeams ||
    isSwitchingTeam ||
    loadingMembers ||
    isUpdatingPer ||
    isLoadingGroups ||
    isLoadingClbs;

  const contextValue = {
    myTeams,
    refetchTeams,
    isLoading,
    onSwitchTeam,

    // create | update team
    setEditTeamData,
    members,
    refetchMembers,
    groups,
    refetchGroups,
    clbs,
    refetchClbs
  };

  return (
    <TeamModalContext.Provider value={contextValue}>
      {userInfo?.team?.permission && (
        <CollaboratorContextProvider
          permission={userInfo?.team?.permission}
          permissionList={TeamPermissionList}
          onGetCollaboratorList={onGetClbList}
          onUpdateCollaborators={onUpdatePer}
          onDelOneCollaborator={(tmbId) => delMemberPermission({ tmbId })}
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
