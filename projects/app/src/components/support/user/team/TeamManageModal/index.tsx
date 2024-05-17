import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  getTeamMembers,
  putUpdateMember,
  delRemoveMember,
  getTeamList,
  delLeaveTeam,
  putSwitchTeam
} from '@/web/support/user/team/api';
import { Box, useDisclosure } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { createContext } from 'use-context-selector';
import TeamList from './TeamList';
import TeamCard from './TeamCard';
import { FormDataType } from './EditModal';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { setToken } from '@/web/support/user/auth';

const InviteModal = dynamic(() => import('./InviteModal'));
const TeamTagModal = dynamic(() => import('../TeamTagModal'));

export const TeamContext = createContext<{
  editTeamData?: FormDataType;
  setEditTeamData: React.Dispatch<React.SetStateAction<any>>;
  members: Awaited<ReturnType<typeof getTeamMembers>>;
  myTeams: Awaited<ReturnType<typeof getTeamList>>;
  refetchTeam: ReturnType<typeof useQuery>['refetch'];
  onSwitchTeam: ReturnType<typeof useRequest>['mutate'];
  refetchMembers: ReturnType<typeof useQuery>['refetch'];
  openRemoveMember: ReturnType<typeof useConfirm>['openConfirm'];
  onOpenInvite: ReturnType<typeof useDisclosure>['onOpen'];
  onOpenTeamTagsAsync: ReturnType<typeof useDisclosure>['onOpen'];
  onRemoveMember: ReturnType<typeof useRequest>['mutate'];
  onLeaveTeam: ReturnType<typeof useRequest>['mutate'];
}>({} as any);

const TeamManageModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { Loading } = useLoading();

  const { ConfirmModal: ConfirmRemoveMemberModal, openConfirm: openRemoveMember } = useConfirm();

  const { userInfo, initUserInfo } = useUserStore();

  const {
    data: myTeams = [],
    isFetching: isLoadingTeams,
    refetch: refetchTeam
  } = useQuery(['getTeams', userInfo?._id], () => getTeamList(TeamMemberStatusEnum.active));

  const [editTeamData, setEditTeamData] = useState<FormDataType>();
  const { isOpen: isOpenInvite, onOpen: onOpenInvite, onClose: onCloseInvite } = useDisclosure();
  const {
    isOpen: isOpenTeamTagsAsync,
    onOpen: onOpenTeamTagsAsync,
    onClose: onCloseTeamTagsAsync
  } = useDisclosure();

  // member action
  const { data: members = [], refetch: refetchMembers } = useQuery(
    ['getMembers', userInfo?.team?.teamId],
    () => {
      if (!userInfo?.team?.teamId) return [];
      return getTeamMembers(userInfo.team.teamId);
    }
  );

  const { mutate: onUpdateMember, isLoading: isLoadingUpdateMember } = useRequest({
    mutationFn: putUpdateMember,
    onSuccess() {
      refetchMembers();
    }
  });

  const { mutate: onRemoveMember, isLoading: isLoadingRemoveMember } = useRequest({
    mutationFn: delRemoveMember,
    onSuccess() {
      refetchMembers();
    },
    successToast: t('user.team.Remove Member Success'),
    errorToast: t('user.team.Remove Member Failed')
  });

  const defaultTeam = useMemo(
    () => myTeams.find((item) => item.defaultTeam) || myTeams[0],
    [myTeams]
  );

  const { mutate: onSwitchTeam, isLoading: isSwitchTeam } = useRequest({
    mutationFn: async (teamId: string) => {
      const token = await putSwitchTeam(teamId);
      token && setToken(token);
      return initUserInfo();
    },
    errorToast: t('user.team.Switch Team Failed')
  });

  const { mutate: onLeaveTeam, isLoading: isLoadingLeaveTeam } = useRequest({
    mutationFn: async (teamId?: string) => {
      if (!teamId) return;
      // change to personal team
      // get members
      onSwitchTeam(defaultTeam.teamId);
      return delLeaveTeam(teamId);
    },
    onSuccess() {
      refetchTeam();
    },
    errorToast: t('user.team.Leave Team Failed')
  });

  return !!userInfo?.team ? (
    <TeamContext.Provider
      value={{
        myTeams: myTeams,
        refetchTeam: refetchTeam,
        onSwitchTeam: onSwitchTeam,
        members: members,
        refetchMembers: refetchMembers,
        openRemoveMember: openRemoveMember,
        onOpenInvite: onOpenInvite,
        onOpenTeamTagsAsync: onOpenTeamTagsAsync,
        onRemoveMember: onRemoveMember,
        editTeamData: editTeamData,
        setEditTeamData: setEditTeamData,
        onLeaveTeam: onLeaveTeam
      }}
    >
      <MyModal
        isOpen
        onClose={onClose}
        maxW={['90vw', '1000px']}
        w={'100%'}
        h={'550px'}
        isCentered
        bg={'myWhite.600'}
        overflow={'hidden'}
      >
        <Box display={['block', 'flex']} flex={1} position={'relative'} overflow={'auto'}>
          <TeamList />
          <TeamCard />
          <Loading
            loading={
              isLoadingUpdateMember ||
              isLoadingRemoveMember ||
              isLoadingTeams ||
              isLoadingLeaveTeam ||
              isSwitchTeam
            }
            fixed={false}
          />
        </Box>
      </MyModal>
      {isOpenInvite && userInfo?.team?.teamId && (
        <InviteModal
          teamId={userInfo.team.teamId}
          onClose={onCloseInvite}
          onSuccess={refetchMembers}
        />
      )}
      {isOpenTeamTagsAsync && <TeamTagModal onClose={onCloseTeamTagsAsync} />}
      <ConfirmRemoveMemberModal />
    </TeamContext.Provider>
  ) : null;
};

export default React.memo(TeamManageModal);
