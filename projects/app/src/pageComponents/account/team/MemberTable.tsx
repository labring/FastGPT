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
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { delRemoveMember } from '@/web/support/user/team/api';
import Tag from '@fastgpt/web/components/common/Tag';
import Icon from '@fastgpt/web/components/common/Icon';
import GroupTags from '@/components/support/permission/Group/GroupTags';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from './context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { delLeaveTeam } from '@/web/support/user/team/api';
import { postSyncMembers } from '@/web/support/user/api';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

const InviteModal = dynamic(() => import('./InviteModal'));
const TeamTagModal = dynamic(() => import('@/components/support/user/team/TeamTagModal'));

function MemberTable({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userInfo, teamPlanStatus } = useUserStore();
  const { feConfigs, setNotSufficientModalType } = useSystemStore();

  const {
    groups,
    refetchGroups,
    myTeams,
    refetchTeams,
    members,
    refetchMembers,
    onSwitchTeam,
    MemberScrollData
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

  const isSyncMember = feConfigs.register_method?.includes('sync');

  const { runAsync: onLeaveTeam } = useRequest2(
    async () => {
      const defaultTeam = myTeams.find((item) => item.defaultTeam) || myTeams[0];
      // change to personal team
      onSwitchTeam(defaultTeam.teamId);
      return delLeaveTeam();
    },
    {
      onSuccess() {
        refetchTeams();
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

  return (
    <>
      {isSyncing && <MyLoading />}
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
        <HStack>
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
        <TableContainer overflow={'unset'} fontSize={'sm'}>
          <MemberScrollData>
            <Table overflow={'unset'}>
              <Thead>
                <Tr bgColor={'white !important'}>
                  <Th borderLeftRadius="6px" bgColor="myGray.100">
                    {t('account_team:user_name')}
                  </Th>
                  <Th bgColor="myGray.100">{t('account_team:member_group')}</Th>
                  {!isSyncMember && (
                    <Th borderRightRadius="6px" bgColor="myGray.100">
                      {t('common:common.Action')}
                    </Th>
                  )}
                </Tr>
              </Thead>
              <Tbody>
                {members?.map((item) => (
                  <Tr key={item.userId} overflow={'unset'}>
                    <Td>
                      <HStack>
                        <Avatar src={item.avatar} w={['18px', '22px']} borderRadius={'50%'} />
                        <Box className={'textEllipsis'}>
                          {item.memberName}
                          {item.status === 'waiting' && (
                            <Tag ml="2" colorSchema="yellow">
                              {t('account_team:waiting')}
                            </Tag>
                          )}
                        </Box>
                      </HStack>
                    </Td>
                    <Td maxW={'300px'}>
                      <GroupTags
                        names={groups
                          ?.filter((group) =>
                            group.members.map((m) => m.tmbId).includes(item.tmbId)
                          )
                          .map((g) => g.name)}
                        max={3}
                      />
                    </Td>
                    {!isSyncMember && (
                      <Td>
                        {userInfo?.team.permission.hasManagePer &&
                          item.role !== TeamMemberRoleEnum.owner &&
                          item.tmbId !== userInfo?.team.tmbId && (
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
                                    delRemoveMember(item.tmbId).then(() =>
                                      Promise.all([refetchGroups(), refetchMembers()])
                                    ),
                                  undefined,
                                  t('account_team:remove_tip', {
                                    username: item.memberName
                                  })
                                )();
                              }}
                            />
                          )}
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </MemberScrollData>
          <ConfirmRemoveMemberModal />
        </TableContainer>
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
