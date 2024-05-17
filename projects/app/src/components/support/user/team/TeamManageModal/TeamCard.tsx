import { Box, Button, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TeamContext } from '.';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useContextSelector } from 'use-context-selector';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import RowTabs from '../../../../common/Rowtabs';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { DragHandleIcon } from '@chakra-ui/icons';
import MemberTable from './MemberTable';
import PermissionManage from './PermissionManage';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { hasManage } from '@fastgpt/service/support/permission/resourcePermission/permisson';
import { useI18n } from '@/web/context/I18n';
type TabListType = Pick<React.ComponentProps<typeof RowTabs>, 'list'>['list'];
enum TabListEnum {
  member = 'member',
  permission = 'permission'
}

function TeamCard() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { userT } = useI18n();
  const members = useContextSelector(TeamContext, (v) => v.members);
  const onOpenInvite = useContextSelector(TeamContext, (v) => v.onOpenInvite);
  const onOpenTeamTagsAsync = useContextSelector(TeamContext, (v) => v.onOpenTeamTagsAsync);
  const setEditTeamData = useContextSelector(TeamContext, (v) => v.setEditTeamData);
  const onLeaveTeam = useContextSelector(TeamContext, (v) => v.onLeaveTeam);

  const { userInfo, teamPlanStatus } = useUserStore();

  const { ConfirmModal: ConfirmLeaveTeamModal, openConfirm: openLeaveConfirm } = useConfirm({
    content: t('user.team.member.Confirm Leave')
  });

  const { feConfigs } = useSystemStore();

  const Tablist: TabListType = [
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
  ];

  const [tab, setTab] = useState<string>(Tablist[0].value);
  return (
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
        <Box fontSize={['lg', 'xl']} fontWeight={'bold'} alignItems={'center'}>
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
        <RowTabs
          overflow={'auto'}
          list={Tablist}
          value={tab}
          onChange={(v) => {
            setTab(v as string);
          }}
        ></RowTabs>
        <Flex alignItems={'center'}>
          {hasManage(
            members.find((item) => item.tmbId.toString() === userInfo?.team.tmbId.toString())
              ?.permission!
          ) &&
            tab === 'member' && (
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
          {userInfo?.team.role === TeamMemberRoleEnum.owner && feConfigs?.show_team_chat && (
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
          {userInfo?.team.role !== TeamMemberRoleEnum.owner && (
            <Button
              variant={'whitePrimary'}
              size="sm"
              borderRadius={'md'}
              ml={3}
              leftIcon={<MyIcon name={'support/account/loginoutLight'} w={'14px'} />}
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
        {tab === 'member' ? <MemberTable /> : <PermissionManage />}
      </Box>
      <ConfirmLeaveTeamModal />
    </Flex>
  );
}

export default TeamCard;
