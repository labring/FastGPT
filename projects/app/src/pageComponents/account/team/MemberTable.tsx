import Avatar from '@fastgpt/web/components/common/Avatar';
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { delRemoveMember, updateStatus } from '@/web/support/user/team/api';
import Tag from '@fastgpt/web/components/common/Tag';
import Icon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from './context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { delLeaveTeam } from '@/web/support/user/team/api';
import { GetSearchUserGroupOrg, postSyncMembers } from '@/web/support/user/api';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import format from 'date-fns/format';
import OrgTags from '@/components/support/user/team/OrgTags';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useState } from 'react';
import { downloadFetch } from '@/web/common/system/utils';

const InviteModal = dynamic(() => import('./InviteModal'));
const TeamTagModal = dynamic(() => import('@/components/support/user/team/TeamTagModal'));

function MemberTable({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userInfo, teamPlanStatus } = useUserStore();
  const { feConfigs, setNotSufficientModalType } = useSystemStore();

  const {
    refetchGroups,
    myTeams,
    refetchTeams,
    members,
    refetchMembers,
    onSwitchTeam,
    MemberScrollData,
    orgs
  } = useContextSelector(TeamContext, (v) => v);

  const {
    isOpen: isOpenTeamTagsAsync,
    onOpen: onOpenTeamTagsAsync,
    onClose: onCloseTeamTagsAsync
  } = useDisclosure();
  const { isOpen: isOpenInvite, onOpen: onOpenInvite, onClose: onCloseInvite } = useDisclosure();

  const { ConfirmModal: ConfirmRemoveMemberModal, openConfirm: openRemoveMember } = useConfirm({
    type: 'delete'
  });

  const { ConfirmModal: ConfirmRestoreMemberModal, openConfirm: openRestoreMember } = useConfirm({
    type: 'common',
    title: t('account_team:restore_tip_title'),
    iconSrc: 'common/confirm/restoreTip',
    iconColor: 'primary.500'
  });

  const [searchText, setSearchText] = useState<string>('');
  const isSyncMember = feConfigs.register_method?.includes('sync');

  const { data: searchMembersData } = useRequest2(
    () => GetSearchUserGroupOrg(searchText, { members: true, orgs: false, groups: false }),
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [searchText]
    }
  );

  const { runAsync: onLeaveTeam } = useRequest2(
    async () => {
      const defaultTeam = myTeams[0];
      // change to personal team
      onSwitchTeam(defaultTeam.teamId);
      return delLeaveTeam();
    },
    {
      onSuccess() {
        refetchTeams();
        refetchMembers();
      },
      errorToast: t('account_team:user_team_leave_team_failed')
    }
  );
  const { ConfirmModal: ConfirmLeaveTeamModal, openConfirm: openLeaveConfirm } = useConfirm({
    content: t('account_team:confirm_leave_team')
  });

  const { runAsync: onSyncMember, loading: isSyncing } = useRequest2(postSyncMembers, {
    onSuccess() {
      refetchMembers();
    },
    successToast: t('account_team:sync_member_success'),
    errorToast: t('account_team:sync_member_failed')
  });

  const { runAsync: onRestore, loading: isUpdateInvite } = useRequest2(updateStatus, {
    onSuccess() {
      refetchMembers();
    },
    successToast: t('common:user.team.invite.Accepted'),
    errorToast: t('common:user.team.invite.Reject')
  });

  const isLoading = isUpdateInvite || isSyncing;

  return (
    <>
      {isLoading && <MyLoading />}
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
        <HStack alignItems={'center'}>
          <Box width={'200px'}>
            <SearchInput
              placeholder={t('account_team:search_member')}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Box>
          {userInfo?.team.permission.hasManagePer && feConfigs?.show_team_chat && (
            <Button
              variant={'whitePrimary'}
              size="md"
              borderRadius={'md'}
              ml={3}
              leftIcon={<MyIcon name="core/dataset/tag" w={'16px'} />}
              onClick={() => {
                onOpenTeamTagsAsync();
              }}
            >
              {t('account_team:label_sync')}
            </Button>
          )}
          {userInfo?.team.permission.hasManagePer && isSyncMember && (
            <Button
              variant={'primary'}
              size="md"
              borderRadius={'md'}
              ml={3}
              leftIcon={<MyIcon name="common/retryLight" w={'16px'} color={'white'} />}
              onClick={() => {
                onSyncMember();
              }}
            >
              {t('account_team:sync_immediately')}
            </Button>
          )}
          {userInfo?.team.permission.hasManagePer && !isSyncMember && (
            <Button
              variant={'primary'}
              size="md"
              borderRadius={'md'}
              ml={3}
              leftIcon={<MyIcon name="common/inviteLight" w={'16px'} color={'white'} />}
              onClick={() => {
                if (
                  teamPlanStatus?.standardConstants?.maxTeamMember &&
                  teamPlanStatus.standardConstants.maxTeamMember <= members.length
                ) {
                  toast({
                    status: 'warning',
                    title: t('common:user.team.Over Max Member Tip', {
                      max: teamPlanStatus.standardConstants.maxTeamMember
                    })
                  });
                  setNotSufficientModalType(TeamErrEnum.teamMemberOverSize);
                } else {
                  onOpenInvite();
                }
              }}
            >
              {t('account_team:user_team_invite_member')}
            </Button>
          )}
          {userInfo?.team.permission.isOwner && isSyncMember && (
            <Button
              variant={'whitePrimary'}
              size="md"
              borderRadius={'md'}
              ml={3}
              leftIcon={<MyIcon name="export" w={'16px'} />}
              onClick={() => {
                downloadFetch({
                  url: '/api/proApi/support/user/team/member/export',
                  filename: `${userInfo.team.teamName}-${format(new Date(), 'yyyyMMddHHmmss')}.csv`
                });
              }}
            >
              {t('account_team:export_members')}
            </Button>
          )}
          {!userInfo?.team.permission.isOwner && (
            <Button
              variant={'whitePrimary'}
              size="md"
              borderRadius={'md'}
              ml={3}
              leftIcon={<MyIcon name={'support/account/loginoutLight'} w={'14px'} />}
              onClick={() => openLeaveConfirm(onLeaveTeam)()}
            >
              {t('account_team:user_team_leave_team')}
            </Button>
          )}
        </HStack>
      </Flex>

      <Box flex={'1 0 0'} overflow={'auto'}>
        <MemberScrollData>
          <TableContainer overflow={'unset'} fontSize={'sm'}>
            <Table overflow={'unset'}>
              <Thead>
                <Tr bgColor={'white !important'}>
                  <Th borderLeftRadius="6px" bgColor="myGray.100">
                    {t('account_team:user_name')}
                  </Th>
                  <Th bgColor="myGray.100">{t('account_team:contact')}</Th>
                  <Th bgColor="myGray.100">{t('account_team:org')}</Th>
                  <Th bgColor="myGray.100">{t('account_team:join_update_time')}</Th>
                  <Th borderRightRadius="6px" bgColor="myGray.100">
                    {t('common:common.Action')}
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {(searchText && searchMembersData ? searchMembersData.members : members).map(
                  (member) => (
                    <Tr key={member.tmbId} overflow={'unset'}>
                      <Td>
                        <HStack>
                          <Avatar src={member.avatar} w={['18px', '22px']} borderRadius={'50%'} />
                          <Box className={'textEllipsis'}>
                            {member.memberName}
                            {member.status === 'waiting' && (
                              <Tag ml="2" colorSchema="yellow">
                                {t('account_team:waiting')}
                              </Tag>
                            )}
                            {member.status === 'leave' && (
                              <Tag ml="2" colorSchema="gray">
                                {t('account_team:leave')}
                              </Tag>
                            )}
                          </Box>
                        </HStack>
                      </Td>
                      <Td maxW={'300px'}>{member.contact || '-'}</Td>
                      <Td maxWidth="300px">
                        {(() => {
                          const memberOrgs = orgs.filter((org) =>
                            org.members.find((v) => String(v.tmbId) === String(member.tmbId))
                          );
                          const memberPathIds = memberOrgs.map((org) =>
                            (org.path + '/' + org.pathId).split('/').slice(0)
                          );
                          const memberOrgNames = memberPathIds.map((pathIds) =>
                            pathIds.map((id) => orgs.find((v) => v.pathId === id)?.name).join('/')
                          );
                          return <OrgTags orgs={memberOrgNames} type="tag" />;
                        })()}
                      </Td>
                      <Td maxW={'300px'}>
                        <VStack gap={0}>
                          <Box>{format(new Date(member.createTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                          <Box>
                            {member.updateTime
                              ? format(new Date(member.updateTime), 'yyyy-MM-dd HH:mm:ss')
                              : '-'}
                          </Box>
                        </VStack>
                      </Td>
                      <Td>
                        {userInfo?.team.permission.hasManagePer &&
                          member.role !== TeamMemberRoleEnum.owner &&
                          member.tmbId !== userInfo?.team.tmbId &&
                          (member.status !== TeamMemberStatusEnum.leave ? (
                            <Icon
                              name={'common/trash'}
                              cursor={'pointer'}
                              w="1rem"
                              p="1"
                              borderRadius="sm"
                              _hover={{
                                color: 'red.600',
                                bgColor: 'myGray.100'
                              }}
                              onClick={() => {
                                openRemoveMember(
                                  () =>
                                    delRemoveMember(member.tmbId).then(() =>
                                      Promise.all([refetchGroups(), refetchMembers()])
                                    ),
                                  undefined,
                                  t('account_team:remove_tip', {
                                    username: member.memberName
                                  })
                                )();
                              }}
                            />
                          ) : (
                            <Icon
                              name={'common/confirm/restoreTip'}
                              cursor={'pointer'}
                              w="1rem"
                              p="1"
                              borderRadius="sm"
                              _hover={{
                                color: 'primary.500',
                                bgColor: 'myGray.100'
                              }}
                              onClick={() => {
                                openRestoreMember(
                                  () =>
                                    onRestore({
                                      tmbId: member.tmbId,
                                      status: TeamMemberStatusEnum.active
                                    }),
                                  undefined,
                                  t('account_team:restore_tip', {
                                    username: member.memberName
                                  })
                                )();
                              }}
                            />
                          ))}
                      </Td>
                    </Tr>
                  )
                )}
              </Tbody>
            </Table>
            <ConfirmRemoveMemberModal />
            <ConfirmRestoreMemberModal />
          </TableContainer>
        </MemberScrollData>
      </Box>

      <ConfirmLeaveTeamModal />
      {isOpenInvite && userInfo?.team?.teamId && (
        <InviteModal
          teamId={userInfo.team.teamId}
          onClose={onCloseInvite}
          onSuccess={refetchMembers}
        />
      )}
      {isOpenTeamTagsAsync && <TeamTagModal onClose={onCloseTeamTagsAsync} />}
    </>
  );
}

export default MemberTable;
