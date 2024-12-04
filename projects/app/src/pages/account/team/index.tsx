import { serviceSideProps } from '@/web/common/utils/i18n';
import AccountContainer from '../components/AccountContainer';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import TeamSelector from '../components/TeamSelector';
import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useRouter } from 'next/router';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { delLeaveTeam } from '@/web/support/user/team/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamContext, TeamModalContextProvider } from './components/context';
import dynamic from 'next/dynamic';
import TeamTagModal from '@/components/support/user/team/TeamTagModal';
import MemberTable from './components/MemberTable';

const InviteModal = dynamic(() => import('./components/InviteModal'));
const PermissionManage = dynamic(() => import('./components/PermissionManage/index'));
const GroupManage = dynamic(() => import('./components/GroupManage/index'));
const GroupInfoModal = dynamic(() => import('./components/GroupManage/GroupInfoModal'));
const ManageGroupMemberModal = dynamic(() => import('./components/GroupManage/GroupManageMember'));

export enum TeamTabEnum {
  member = 'member',
  group = 'group',
  permission = 'permission'
}

const Team = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { userInfo, teamPlanStatus } = useUserStore();
  const { feConfigs } = useSystemStore();

  const {
    myTeams,
    refetchTeams,
    members,
    refetchMembers,
    setEditTeamData,
    onSwitchTeam,
    searchKey,
    setSearchKey,
    teamSize,
    isLoading
  } = useContextSelector(TeamContext, (v) => v);

  const { teamTab = TeamTabEnum.member } = router.query as { teamTab: `${TeamTabEnum}` };

  const {
    isOpen: isOpenTeamTagsAsync,
    onOpen: onOpenTeamTagsAsync,
    onClose: onCloseTeamTagsAsync
  } = useDisclosure();
  const { isOpen: isOpenInvite, onOpen: onOpenInvite, onClose: onCloseInvite } = useDisclosure();
  const {
    isOpen: isOpenGroupInfo,
    onOpen: onOpenGroupInfo,
    onClose: onCloseGroupInfo
  } = useDisclosure();
  const {
    isOpen: isOpenManageGroupMember,
    onOpen: onOpenManageGroupMember,
    onClose: onCloseManageGroupMember
  } = useDisclosure();

  const { runAsync: onLeaveTeam, loading: isLoadingLeaveTeam } = useRequest2(
    async (teamId?: string) => {
      if (!teamId) return;
      const defaultTeam = myTeams.find((item) => item.defaultTeam) || myTeams[0];
      // change to personal team
      // get members
      onSwitchTeam(defaultTeam.teamId);
      return delLeaveTeam(teamId);
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

  const [editGroupId, setEditGroupId] = useState<string>();
  const onEditGroup = (groupId: string) => {
    setEditGroupId(groupId);
    onOpenGroupInfo();
  };

  const onManageMember = (groupId: string) => {
    setEditGroupId(groupId);
    onOpenManageGroupMember();
  };

  return (
    <AccountContainer isLoading={isLoading}>
      {/* header */}
      <Flex
        w={'100%'}
        h={'3.5rem'}
        px={'1.56rem'}
        py={'0.56rem'}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
        bg={'myGray.25'}
        align={'center'}
        gap={6}
        justify={'space-between'}
      >
        <Flex align={'center'}>
          <Flex gap={2} color={'myGray.900'}>
            <Icon name="support/user/usersLight" w={'1.25rem'} h={'1.25rem'} />
            <Box fontWeight={'500'} fontSize={'1rem'}>
              {t('account:team')}
            </Box>
          </Flex>
          <Flex align={'center'} ml={6}>
            <TeamSelector height={'28px'} />
          </Flex>
          {userInfo?.team.role === TeamMemberRoleEnum.owner && (
            <Flex align={'center'} justify={'center'} ml={2} p={'0.44rem'}>
              <MyIcon
                name="edit"
                w="18px"
                cursor="pointer"
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
            </Flex>
          )}
        </Flex>

        <Box
          float={'right'}
          color={'myGray.900'}
          h={'1.25rem'}
          px={'0.5rem'}
          py={'0.125rem'}
          fontSize={'0.75rem'}
          borderRadius={'1.25rem'}
          bg={'myGray.150'}
        >
          {t('account_team:total_team_members', { amount: teamSize })}
        </Box>
      </Flex>

      {/* table */}
      <Box py={'1.5rem'} px={'2rem'}>
        <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
          <FillRowTabs
            list={[
              { label: t('account_team:member'), value: TeamTabEnum.member },
              { label: t('account_team:group'), value: TeamTabEnum.group },
              { label: t('account_team:permission'), value: TeamTabEnum.permission }
            ]}
            px={'1rem'}
            value={teamTab}
            onChange={(e) => {
              router.replace({
                query: {
                  ...router.query,
                  teamTab: e
                }
              });
            }}
          />

          <Flex alignItems={'center'}>
            {teamTab === TeamTabEnum.member &&
              userInfo?.team.permission.hasManagePer &&
              feConfigs?.show_team_chat && (
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
            {teamTab === TeamTabEnum.member && userInfo?.team.permission.hasManagePer && (
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
                      title: t('user.team.Over Max Member Tip', {
                        max: teamPlanStatus.standardConstants.maxTeamMember
                      })
                    });
                  } else {
                    onOpenInvite();
                  }
                }}
              >
                {t('account_team:user_team_invite_member')}
              </Button>
            )}
            {teamTab === TeamTabEnum.member && !userInfo?.team.permission.isOwner && (
              <Button
                variant={'whitePrimary'}
                size="md"
                borderRadius={'md'}
                ml={3}
                leftIcon={<MyIcon name={'support/account/loginoutLight'} w={'14px'} />}
                isLoading={isLoadingLeaveTeam}
                onClick={() => {
                  openLeaveConfirm(() => onLeaveTeam(userInfo?.team?.teamId))();
                }}
              >
                {t('account_team:user_team_leave_team')}
              </Button>
            )}
            {teamTab === TeamTabEnum.group && userInfo?.team.permission.hasManagePer && (
              <Button
                variant={'primary'}
                size="md"
                borderRadius={'md'}
                ml={3}
                leftIcon={<MyIcon name="support/permission/collaborator" w={'14px'} />}
                onClick={onOpenGroupInfo}
              >
                {t('user:team.group.create')}
              </Button>
            )}
            {teamTab === TeamTabEnum.permission && (
              <Box ml="auto">
                <SearchInput
                  placeholder={t('user:team.group.search_placeholder')}
                  w="200px"
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                />
              </Box>
            )}
          </Flex>
        </Flex>
        <Box mt={3} flex={'1 0 0'} overflow={'auto'}>
          {teamTab === TeamTabEnum.member && <MemberTable />}
          {teamTab === TeamTabEnum.group && (
            <GroupManage onEditGroup={onEditGroup} onManageMember={onManageMember} />
          )}
          {teamTab === TeamTabEnum.permission && <PermissionManage />}
        </Box>
      </Box>
      {isOpenInvite && userInfo?.team?.teamId && (
        <InviteModal
          teamId={userInfo.team.teamId}
          onClose={onCloseInvite}
          onSuccess={refetchMembers}
        />
      )}
      {isOpenTeamTagsAsync && <TeamTagModal onClose={onCloseTeamTagsAsync} />}
      {isOpenGroupInfo && (
        <GroupInfoModal
          onClose={() => {
            onCloseGroupInfo();
            setEditGroupId(undefined);
          }}
          editGroupId={editGroupId}
        />
      )}
      {isOpenManageGroupMember && (
        <ManageGroupMemberModal
          onClose={() => {
            onCloseManageGroupMember();
            setEditGroupId(undefined);
          }}
          editGroupId={editGroupId}
        />
      )}
      <ConfirmLeaveTeamModal />
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_team', 'user']))
    }
  };
}

const Render = () => {
  const { userInfo } = useUserStore();

  return !!userInfo?.team ? (
    <TeamModalContextProvider>
      <Team />
    </TeamModalContextProvider>
  ) : null;
};

export default React.memo(Render);
