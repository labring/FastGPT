import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  getTeamList,
  getTeamMembers,
  putSwitchTeam,
  putUpdateMember,
  delRemoveMember,
  delLeaveTeam
} from '@/web/support/user/team/api';
import { Box, useDisclosure } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { setToken } from '@/web/support/user/auth';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { FormDataType } from './EditModal';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { createContext } from 'use-context-selector';
import { TeamItemType } from '@fastgpt/global/support/user/team/type';
import TeamList from './TeamList';
import TeamCard from './TeamCard';
import { UserType } from '@fastgpt/global/support/user/type';

const EditModal = dynamic(() => import('./EditModal'));
const InviteModal = dynamic(() => import('./InviteModal'));
const TeamTagModal = dynamic(() => import('../TeamTagModal'));

export const TeamContext = createContext<{
  myTeams: TeamItemType[];
  members: Awaited<ReturnType<typeof getTeamMembers>>;
  userInfo: UserType;
  setEditTeamData: ReturnType<typeof useState<FormDataType>>[1];
  onSwitchTeam: ReturnType<typeof useRequest>['mutate'];
  refetchTeam: ReturnType<typeof useQuery>['refetch'];
  refetchMembers: ReturnType<typeof useQuery>['refetch'];
  openRemoveMember: ReturnType<typeof useConfirm>['openConfirm'];
  openLeaveConfirm: ReturnType<typeof useConfirm>['openConfirm'];
  onOpenInvite: ReturnType<typeof useDisclosure>['onOpen'];
  onOpenTeamTagsAsync: ReturnType<typeof useDisclosure>['onOpen'];
  onLeaveTeam: ReturnType<typeof useRequest>['mutate'];
  onRemoveMember: ReturnType<typeof useRequest>['mutate'];
}>({} as any);

const TeamManageModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { Loading } = useLoading();

  const { ConfirmModal: ConfirmRemoveMemberModal, openConfirm: openRemoveMember } = useConfirm();
  const { ConfirmModal: ConfirmLeaveTeamModal, openConfirm: openLeaveConfirm } = useConfirm({
    content: t('user.team.member.Confirm Leave')
  });

  const { userInfo, initUserInfo } = useUserStore();
  const [editTeamData, setEditTeamData] = useState<FormDataType>();
  const { isOpen: isOpenInvite, onOpen: onOpenInvite, onClose: onCloseInvite } = useDisclosure();
  const {
    isOpen: isOpenTeamTagsAsync,
    onOpen: onOpenTeamTagsAsync,
    onClose: onCloseTeamTagsAsync
  } = useDisclosure();

  const {
    data: myTeams = [],
    isFetching: isLoadingTeams,
    refetch: refetchTeam
  } = useQuery(['getTeams', userInfo?._id], () => getTeamList(TeamMemberStatusEnum.active));
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

  const { mutate: onLeaveTeam, isLoading: isLoadingLeaveTeam } = useRequest({
    mutationFn: async (teamId?: string) => {
      if (!teamId) return;
      // change to personal team
      // get members
      await onSwitchTeam(defaultTeam.teamId);

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
        members: members,
        userInfo: userInfo,
        onSwitchTeam: onSwitchTeam,
        setEditTeamData: setEditTeamData,
        refetchTeam: refetchTeam,
        refetchMembers: refetchMembers,
        openRemoveMember: openRemoveMember,
        openLeaveConfirm: openLeaveConfirm,
        onOpenInvite: onOpenInvite,
        onOpenTeamTagsAsync: onOpenTeamTagsAsync,
        onLeaveTeam: onLeaveTeam,
        onRemoveMember: onRemoveMember
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
              isSwitchTeam ||
              isLoadingTeams ||
              isLoadingUpdateMember ||
              isLoadingRemoveMember ||
              isLoadingLeaveTeam
            }
            fixed={false}
          />
        </Box>
      </MyModal>
      {!!editTeamData && (
        <EditModal
          defaultData={editTeamData}
          onClose={() => setEditTeamData(undefined)}
          onSuccess={() => {
            refetchTeam();
            initUserInfo();
          }}
        />
      )}
      {isOpenInvite && userInfo?.team?.teamId && (
        <InviteModal
          teamId={userInfo.team.teamId}
          onClose={onCloseInvite}
          onSuccess={refetchMembers}
        />
      )}
      {isOpenTeamTagsAsync && <TeamTagModal onClose={onCloseTeamTagsAsync} />}
      <ConfirmRemoveMemberModal />
      <ConfirmLeaveTeamModal />
    </TeamContext.Provider>
  ) : null;
};

export default React.memo(TeamManageModal);
