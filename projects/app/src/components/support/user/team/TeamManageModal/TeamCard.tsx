import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useContextSelector } from 'use-context-selector';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { DragHandleIcon } from '@chakra-ui/icons';
import MemberTable from './components/MemberTable';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { TeamModalContext } from './context';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { delLeaveTeam } from '@/web/support/user/team/api';
import dynamic from 'next/dynamic';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';

enum TabListEnum {
  member = 'member',
  permission = 'permission'
}

const TeamTagModal = dynamic(() => import('../TeamTagModal'));
const InviteModal = dynamic(() => import('./components/InviteModal'));
const PermissionManage = dynamic(() => import('./components/PermissionManage/index'));

function TeamCard() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { myTeams, refetchTeams, members, refetchMembers, setEditTeamData, onSwitchTeam } =
    useContextSelector(TeamModalContext, (v) => v);

  const { userInfo, teamPlanStatus } = useUserStore();
  const { feConfigs } = useSystemStore();

  const { ConfirmModal: ConfirmLeaveTeamModal, openConfirm: openLeaveConfirm } = useConfirm({
    content: t('user.team.member.Confirm Leave')
  });
  const { mutate: onLeaveTeam, isLoading: isLoadingLeaveTeam } = useRequest({
    mutationFn: async (teamId?: string) => {
      if (!teamId) return;
      const defaultTeam = myTeams.find((item) => item.defaultTeam) || myTeams[0];
      // change to personal team
      // get members
      onSwitchTeam(defaultTeam.teamId);
      return delLeaveTeam(teamId);
    },
    onSuccess() {
      refetchTeams();
    },
    errorToast: t('user.team.Leave Team Failed')
  });

  const {
    isOpen: isOpenTeamTagsAsync,
    onOpen: onOpenTeamTagsAsync,
    onClose: onCloseTeamTagsAsync
  } = useDisclosure();
  const { isOpen: isOpenInvite, onOpen: onOpenInvite, onClose: onCloseInvite } = useDisclosure();

  const Tablist = useMemo(
    () => [
      {
        icon: 'support/team/memberLight',
        label: (
          <Flex alignItems={'center'}>
            <Box ml={1}>{t('user.team.Member')}</Box>
            <Box ml={2} bg={'myGray.100'} borderRadius={'20px'} px={3} fontSize={'xs'}>
              {members.length}
            </Box>
          </Flex>
        ),
        value: TabListEnum.member
      },
      {
        icon: 'support/team/key',
        label: t('common.Role'),
        value: TabListEnum.permission
      }
    ],
    [members.length, t]
  );
  const [tab, setTab] = useState(Tablist[0].value);

  return (
    <Flex
      flexDirection={'column'}
      bg={'white'}
      minH={['50vh', 'auto']}
      h={'100%'}
      borderRadius={['8px 8px 0 0', '8px 0 0 8px']}
    >
      <Flex
        alignItems={'center'}
        px={5}
        py={4}
        borderBottom={'1.5px solid'}
        borderBottomColor={'myGray.100'}
        mb={2}
      >
        <Box fontSize={['sm', 'md']} fontWeight={'bold'} alignItems={'center'}>
          {userInfo?.team.teamName}
        </Box>
        {userInfo?.team.role === TeamMemberRoleEnum.owner && (
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

      <Flex px={5} alignItems={'center'} justifyContent={'space-between'}>
        <LightRowTabs<TabListEnum>
          overflow={'auto'}
          list={Tablist}
          value={tab}
          onChange={setTab}
        ></LightRowTabs>
        {/* ctrl buttons */}
        <Flex alignItems={'center'}>
          {tab === TabListEnum.member && userInfo?.team.permission.hasManagePer && (
            <Button
              variant={'whitePrimary'}
              size="sm"
              borderRadius={'md'}
              ml={3}
              leftIcon={<MyIcon name="common/inviteLight" w={'14px'} color={'primary.500'} />}
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
              {t('user.team.Invite Member')}
            </Button>
          )}
          {userInfo?.team.permission.hasManagePer && feConfigs?.show_team_chat && (
            <Button
              variant={'whitePrimary'}
              size="sm"
              borderRadius={'md'}
              ml={3}
              leftIcon={<DragHandleIcon w={'14px'} color={'primary.500'} />}
              onClick={() => {
                onOpenTeamTagsAsync();
              }}
            >
              {t('user.team.Team Tags Async')}
            </Button>
          )}
          {!userInfo?.team.permission.isOwner && (
            <Button
              variant={'whitePrimary'}
              size="sm"
              borderRadius={'md'}
              ml={3}
              leftIcon={<MyIcon name={'support/account/loginoutLight'} w={'14px'} />}
              isLoading={isLoadingLeaveTeam}
              onClick={() => {
                openLeaveConfirm(() => onLeaveTeam(userInfo?.team?.teamId))();
              }}
            >
              {t('user.team.Leave Team')}
            </Button>
          )}
        </Flex>
      </Flex>

      <Box mt={3} flex={'1 0 0'} overflow={'auto'}>
        {tab === TabListEnum.member && <MemberTable />}
        {tab === TabListEnum.permission && <PermissionManage />}
      </Box>

      {isOpenInvite && userInfo?.team?.teamId && (
        <InviteModal
          teamId={userInfo.team.teamId}
          onClose={onCloseInvite}
          onSuccess={refetchMembers}
        />
      )}
      {isOpenTeamTagsAsync && <TeamTagModal onClose={onCloseTeamTagsAsync} />}
      <ConfirmLeaveTeamModal />
    </Flex>
  );
}

export default TeamCard;
