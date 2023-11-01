import React, { useCallback, useMemo, useState } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  getTeamList,
  getTeamMembers,
  putSwitchTeam,
  putUpdateMember,
  delRemoveMember,
  delLeaveTeam
} from '@/web/support/user/team/api';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useTheme,
  useDisclosure,
  ModalBody,
  MenuButton
} from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import { TeamItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  TeamMemberRoleEnum,
  TeamMemberRoleMap,
  TeamMemberStatusEnum,
  TeamMemberStatusMap
} from '@fastgpt/global/support/user/team/constant';
import dynamic from 'next/dynamic';
import { useRequest } from '@/web/common/hooks/useRequest';
import { setToken } from '@/web/support/user/auth';
import { useLoading } from '@/web/common/hooks/useLoading';
import { FormDataType, defaultForm } from './EditModal';
import MyMenu from '@/components/MyMenu';
import { useConfirm } from '@/web/common/hooks/useConfirm';

const EditModal = dynamic(() => import('./EditModal'));
const InviteModal = dynamic(() => import('./InviteModal'));

const TeamManageModal = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { Loading } = useLoading();

  const personalTeam = useMemo(
    () => ({
      teamId: 'personal',
      teamName: t('user.team.Personal Team'),
      avatar: '/icon/logo.svg',
      balance: 999,
      teamMemberId: '',
      memberName: t('user.team.Personal Team'),
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active
    }),
    [t]
  );

  const { ConfirmModal: ConfirmRemoveMemberModal, openConfirm: openRemoveMember } = useConfirm();
  const { ConfirmModal: ConfirmLeaveTeamModal, openConfirm: openLeaveConfirm } = useConfirm({
    content: t('user.team.member.Confirm Leave')
  });

  const { userInfo, initUserInfo } = useUserStore();
  const [editTeamData, setEditTeamData] = useState<FormDataType>();
  const { isOpen: isOpenInvite, onOpen: onOpenInvite, onClose: onCloseInvite } = useDisclosure();

  const {
    data: myTeams = [],
    isLoading: isLoadingTeams,
    refetch: refetchTeam
  } = useQuery(['getTeams', userInfo?._id], () => getTeamList(TeamMemberStatusEnum.active));
  const formatTeams = useMemo<TeamItemType[]>(
    () => [personalTeam, ...myTeams],
    [myTeams, personalTeam]
  );

  /* current select team */
  const activeTeam = useMemo(() => {
    return userInfo?.team || personalTeam;
  }, [personalTeam, userInfo?.team]);

  const { mutate: onSwitchTeam, isLoading: isSwitchTeam } = useRequest({
    mutationFn: async (teamId: string) => {
      teamId = teamId === personalTeam.teamId ? '' : teamId;
      const token = await putSwitchTeam(teamId);
      setToken(token);
      return initUserInfo();
    },
    errorToast: t('user.team.Switch Team Failed')
  });

  // member action
  const { data: members = [], refetch: refetchMembers } = useQuery(
    ['getMembers', activeTeam.teamId],
    () => {
      if (activeTeam.teamId === personalTeam.teamId) {
        return [
          {
            userId: userInfo?._id || '',
            teamMemberId: personalTeam.teamId,
            teamId: personalTeam.teamId,
            memberUsername: userInfo?.username || '',
            avatar: userInfo?.avatar || '',
            role: 'owner',
            status: 'active'
          }
        ] as TeamMemberItemType[];
      }
      return getTeamMembers(activeTeam.teamId);
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
    }
  });
  const { mutate: onLeaveTeam, isLoading: isLoadingLeaveTeam } = useRequest({
    mutationFn: async (teamId: string) => {
      console.log(teamId);

      // change to personal team
      await onSwitchTeam(personalTeam.teamId);
      return delLeaveTeam(teamId);
    },
    onSuccess() {
      refetchTeam();
    },
    errorToast: t('user.team.Leave Team Failed')
  });

  return (
    <>
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
          {/* teams */}
          <Flex
            flexDirection={'column'}
            w={['auto', '270px']}
            h={['auto', '100%']}
            pt={3}
            px={5}
            mb={[2, 0]}
          >
            <Flex
              alignItems={'center'}
              py={2}
              h={'40px'}
              borderBottom={'1.5px solid rgba(0, 0, 0, 0.05)'}
            >
              <Box flex={['0 0 auto', 1]} fontWeight={'bold'} fontSize={['md', 'lg']}>
                {t('common.Team')}
              </Box>
              {myTeams.length < 1 && (
                <IconButton
                  variant={'ghost'}
                  border={'none'}
                  icon={
                    <MyIcon
                      name={'addCircle'}
                      w={['16px', '18px']}
                      color={'myBlue.600'}
                      cursor={'pointer'}
                    />
                  }
                  aria-label={''}
                  onClick={() => setEditTeamData(defaultForm)}
                />
              )}
            </Flex>
            <Box flex={['auto', '1 0 0']} overflow={'auto'}>
              {formatTeams.map((team) => (
                <Flex
                  key={team.teamId}
                  alignItems={'center'}
                  mt={3}
                  borderRadius={'md'}
                  p={3}
                  cursor={'default'}
                  gap={3}
                  {...(activeTeam.teamId === team.teamId
                    ? {
                        bg: 'myBlue.300'
                      }
                    : {
                        _hover: {
                          bg: 'myGray.100'
                        }
                      })}
                >
                  <Avatar src={team.avatar} w={['18px', '22px']} />
                  <Box flex={'1 0 0'} w={0} fontWeight={'bold'}>
                    {team.teamName}
                  </Box>
                  {activeTeam.teamId === team.teamId ? (
                    <MyIcon name={'common/tickFill'} w={'16px'} color={'myBlue.600'} />
                  ) : (
                    <Button size={'xs'} variant={'base'} onClick={() => onSwitchTeam(team.teamId)}>
                      {t('user.team.Check Team')}
                    </Button>
                  )}
                </Flex>
              ))}
            </Box>
          </Flex>
          {/* team card */}
          <Flex
            flexDirection={'column'}
            flex={'1'}
            h={['auto', '100%']}
            bg={'white'}
            minH={['50vh', 'auto']}
            borderRadius={['8px 8px 0 0', '8px 0 0 8px']}
          >
            <Flex
              alignItems={'center'}
              px={5}
              py={4}
              borderBottom={'1.5px solid'}
              borderBottomColor={'myGray.100'}
              mb={3}
            >
              <Box fontSize={['lg', 'xl']} fontWeight={'bold'}>
                {activeTeam.teamName}
              </Box>
              <MyIcon
                name="edit"
                w={'14px'}
                ml={2}
                cursor={'pointer'}
                _hover={{
                  color: 'myBlue.600'
                }}
                onClick={() => {
                  setEditTeamData({
                    id: activeTeam.teamId,
                    name: activeTeam.teamName,
                    avatar: activeTeam.avatar
                  });
                }}
              />
            </Flex>
            <Flex px={5} alignItems={'center'}>
              <MyIcon name="support/team/memberLight" w={'14px'} />
              <Box ml={1}>{t('user.team.Member')}</Box>
              <Box ml={2} bg={'myGray.100'} borderRadius={'20px'} px={3} fontSize={'xs'}>
                {members.length}
              </Box>
              {activeTeam.teamId !== personalTeam.teamId &&
                userInfo?.team?.role === TeamMemberRoleEnum.owner && (
                  <Button
                    variant={'base'}
                    size="sm"
                    borderRadius={'md'}
                    ml={3}
                    leftIcon={
                      <MyIcon name={'common/inviteLight'} w={'14px'} color={'myBlue.600'} />
                    }
                    onClick={onOpenInvite}
                  >
                    {t('user.team.Invite Member')}
                  </Button>
                )}
              <Box flex={1} />
              {activeTeam.teamId !== personalTeam.teamId &&
                userInfo?.team?.role !== TeamMemberRoleEnum.owner && (
                  <Button
                    variant={'base'}
                    size="sm"
                    borderRadius={'md'}
                    ml={3}
                    leftIcon={<MyIcon name={'loginoutLight'} w={'14px'} color={'myBlue.600'} />}
                    onClick={() => openLeaveConfirm(() => onLeaveTeam(activeTeam.teamId))()}
                  >
                    {t('user.team.Leave Team')}
                  </Button>
                )}
            </Flex>
            <Box mt={3} flex={'1 0 0'} overflow={'auto'}>
              <TableContainer overflow={'unset'}>
                <Table overflow={'unset'}>
                  <Thead bg={'myWhite.400'}>
                    <Tr>
                      <Th>{t('common.Username')}</Th>
                      <Th>{t('user.team.Role')}</Th>
                      <Th>{t('common.Status')}</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {members.map((item) => (
                      <Tr key={item.userId} overflow={'unset'}>
                        <Td display={'flex'} alignItems={'center'}>
                          <Avatar src={item.avatar} w={['18px', '22px']} />
                          <Box flex={'1 0 0'} w={0} ml={1} className={'textEllipsis'}>
                            {item.memberUsername}
                          </Box>
                        </Td>
                        <Td>{t(TeamMemberRoleMap[item.role].label)}</Td>
                        <Td color={TeamMemberStatusMap[item.status].color}>
                          {t(TeamMemberStatusMap[item.status].label)}
                        </Td>
                        <Td>
                          {userInfo?.team?.role === TeamMemberRoleEnum.owner &&
                            item.role !== TeamMemberRoleEnum.owner && (
                              <MyMenu
                                width={20}
                                Button={
                                  <MenuButton
                                    _hover={{
                                      bg: 'myWhite.600'
                                    }}
                                    px={2}
                                    py={1}
                                    lineHeight={1}
                                  >
                                    <MyIcon
                                      name={'edit'}
                                      cursor={'pointer'}
                                      w="14px"
                                      _hover={{ color: 'myBlue.600' }}
                                    />
                                  </MenuButton>
                                }
                                menuList={[
                                  {
                                    isActive: item.role === TeamMemberRoleEnum.visitor,
                                    child: t('user.team.Invite Role Visitor Tip'),
                                    onClick: () => {
                                      onUpdateMember({
                                        teamId: item.teamId,
                                        memberId: item.teamMemberId,
                                        role: TeamMemberRoleEnum.visitor
                                      });
                                    }
                                  },
                                  {
                                    isActive: item.role === TeamMemberRoleEnum.member,
                                    child: t('user.team.Invite Role Member Tip'),
                                    onClick: () => {
                                      onUpdateMember({
                                        teamId: item.teamId,
                                        memberId: item.teamMemberId,
                                        role: TeamMemberRoleEnum.member
                                      });
                                    }
                                  },
                                  ...(item.status === TeamMemberStatusEnum.reject
                                    ? [
                                        {
                                          child: t('user.team.Reinvite'),
                                          onClick: () => {
                                            onUpdateMember({
                                              teamId: item.teamId,
                                              memberId: item.teamMemberId,
                                              status: TeamMemberStatusEnum.waiting
                                            });
                                          }
                                        }
                                      ]
                                    : []),
                                  {
                                    child: t('user.team.Remove Member Tip'),
                                    onClick: () =>
                                      openRemoveMember(
                                        () =>
                                          onRemoveMember({
                                            teamId: item.teamId,
                                            memberId: item.teamMemberId
                                          }),
                                        undefined,
                                        t('user.team.Remove Member Confirm Tip', {
                                          username: item.memberUsername
                                        })
                                      )()
                                  }
                                ]}
                              />
                            )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            </Box>
          </Flex>
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
      {isOpenInvite && (
        <InviteModal
          teamId={activeTeam.teamId}
          onClose={onCloseInvite}
          onSuccess={refetchMembers}
        />
      )}
      <ConfirmRemoveMemberModal />
      <ConfirmLeaveTeamModal />
    </>
  );
};

export default React.memo(TeamManageModal);
