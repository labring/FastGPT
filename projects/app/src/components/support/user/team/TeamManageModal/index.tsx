import React, { useMemo, useState } from 'react';
import MyModal from '@/components/MyModal';
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
  MenuButton
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
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
import { useToast } from '@/web/common/hooks/useToast';

const EditModal = dynamic(() => import('./EditModal'));
const InviteModal = dynamic(() => import('./InviteModal'));

const TeamManageModal = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const { toast } = useToast();

  const { ConfirmModal: ConfirmRemoveMemberModal, openConfirm: openRemoveMember } = useConfirm();
  const { ConfirmModal: ConfirmLeaveTeamModal, openConfirm: openLeaveConfirm } = useConfirm({
    content: t('user.team.member.Confirm Leave')
  });

  const { userInfo, initUserInfo } = useUserStore();
  const [editTeamData, setEditTeamData] = useState<FormDataType>();
  const { isOpen: isOpenInvite, onOpen: onOpenInvite, onClose: onCloseInvite } = useDisclosure();

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
      setToken(token);
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
      await onSwitchTeam(defaultTeam.teamId);
      return delLeaveTeam(teamId);
    },
    onSuccess() {
      refetchTeam();
    },
    errorToast: t('user.team.Leave Team Failed')
  });

  return !!userInfo?.team ? (
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
                      name={'common/addCircleLight'}
                      w={['16px', '18px']}
                      color={'primary.500'}
                      cursor={'pointer'}
                    />
                  }
                  aria-label={''}
                  onClick={() => setEditTeamData(defaultForm)}
                />
              )}
            </Flex>
            <Box flex={['auto', '1 0 0']} overflow={'auto'}>
              {myTeams.map((team) => (
                <Flex
                  key={team.teamId}
                  alignItems={'center'}
                  mt={3}
                  borderRadius={'md'}
                  p={3}
                  cursor={'default'}
                  gap={3}
                  {...(userInfo?.team?.teamId === team.teamId
                    ? {
                        bg: 'primary.200'
                      }
                    : {
                        _hover: {
                          bg: 'myGray.100'
                        }
                      })}
                >
                  <Avatar src={team.avatar} w={['18px', '22px']} />
                  <Box
                    flex={'1 0 0'}
                    w={0}
                    {...(team.role === TeamMemberRoleEnum.owner
                      ? {
                          fontWeight: 'bold'
                        }
                      : {})}
                  >
                    {team.teamName}
                  </Box>
                  {userInfo?.team?.teamId === team.teamId ? (
                    <MyIcon name={'common/tickFill'} w={'16px'} color={'primary.500'} />
                  ) : (
                    <Button
                      size={'xs'}
                      variant={'whitePrimary'}
                      onClick={() => onSwitchTeam(team.teamId)}
                    >
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
                {userInfo.team.teamName}
              </Box>
              {userInfo.team.role === TeamMemberRoleEnum.owner && (
                <MyIcon
                  name="edit"
                  w={'14px'}
                  ml={2}
                  cursor={'pointer'}
                  _hover={{
                    color: 'primary.500'
                  }}
                  onClick={() => {
                    if (!userInfo?.team) return;
                    setEditTeamData({
                      id: userInfo.team.teamId,
                      name: userInfo.team.teamName,
                      avatar: userInfo.team.avatar
                    });
                  }}
                />
              )}
            </Flex>
            <Flex px={5} alignItems={'center'}>
              <MyIcon name="support/team/memberLight" w={'14px'} />
              <Box ml={1}>{t('user.team.Member')}</Box>
              <Box ml={2} bg={'myGray.100'} borderRadius={'20px'} px={3} fontSize={'xs'}>
                {members.length}
              </Box>
              {userInfo.team.role === TeamMemberRoleEnum.owner && (
                <Button
                  variant={'whitePrimary'}
                  size="sm"
                  borderRadius={'md'}
                  ml={3}
                  leftIcon={<MyIcon name={'common/inviteLight'} w={'14px'} color={'primary.500'} />}
                  onClick={() => {
                    if (userInfo.team.maxSize <= members.length) {
                      toast({
                        status: 'warning',
                        title: t('user.team.Over Max Member Tip', { max: userInfo.team.maxSize })
                      });
                    } else {
                      onOpenInvite();
                    }
                  }}
                >
                  {t('user.team.Invite Member')}
                </Button>
              )}
              <Box flex={1} />
              {userInfo.team.role !== TeamMemberRoleEnum.owner && (
                <Button
                  variant={'whitePrimary'}
                  size="sm"
                  borderRadius={'md'}
                  ml={3}
                  leftIcon={
                    <MyIcon
                      name={'support/account/loginoutLight'}
                      w={'14px'}
                      color={'primary.500'}
                    />
                  }
                  onClick={() => {
                    openLeaveConfirm(() => onLeaveTeam(userInfo?.team?.teamId))();
                  }}
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
                            {item.memberName}
                          </Box>
                        </Td>
                        <Td>{t(TeamMemberRoleMap[item.role]?.label || '')}</Td>
                        <Td color={TeamMemberStatusMap[item.status].color}>
                          {t(TeamMemberStatusMap[item.status]?.label || '')}
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
                                      _hover={{ color: 'primary.500' }}
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
                                        memberId: item.tmbId,
                                        role: TeamMemberRoleEnum.visitor
                                      });
                                    }
                                  },
                                  {
                                    isActive: item.role === TeamMemberRoleEnum.admin,
                                    child: t('user.team.Invite Role Admin Tip'),
                                    onClick: () => {
                                      onUpdateMember({
                                        teamId: item.teamId,
                                        memberId: item.tmbId,
                                        role: TeamMemberRoleEnum.admin
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
                                              memberId: item.tmbId,
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
                                            memberId: item.tmbId
                                          }),
                                        undefined,
                                        t('user.team.Remove Member Confirm Tip', {
                                          username: item.memberName
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
      {isOpenInvite && userInfo?.team?.teamId && (
        <InviteModal
          teamId={userInfo.team.teamId}
          onClose={onCloseInvite}
          onSuccess={refetchMembers}
        />
      )}
      <ConfirmRemoveMemberModal />
      <ConfirmLeaveTeamModal />
    </>
  ) : null;
};

export default React.memo(TeamManageModal);
