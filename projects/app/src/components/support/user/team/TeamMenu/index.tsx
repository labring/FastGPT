import React, { useMemo } from 'react';
import { Box, Button, ButtonProps, Flex, SelectProps, useDisclosure } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MySelect from '@fastgpt/web/components/common/MySelect';

const TeamMenu = (props: ButtonProps) => {
  const { t } = useTranslation();
  const { userInfo, initUserInfo } = useUserStore();

  const { data: myTeams = [], loading: loadingTeamList } = useRequest2(
    () => getTeamList(TeamMemberStatusEnum.active),
    {
      manual: false,
      refreshDeps: [userInfo]
    }
  );

  const { runAsync: onSwitchTeam, loading: switching } = useRequest2(
    async (teamId: string) => {
      await putSwitchTeam(teamId);
      return initUserInfo();
    },
    {
      errorToast: t('common:user.team.Switch Team Failed')
    }
  );

  const teamList = useMemo(() => {
    return myTeams.map((team) => ({
      label: (
        <Flex
          key={team.teamId}
          alignItems={'center'}
          borderRadius={'md'}
          cursor={'default'}
          gap={3}
          onClick={() => onSwitchTeam(team.teamId)}
          _hover={{
            cursor: 'pointer'
          }}
        >
          <Avatar src={team.avatar} w={['18px', '22px']} />
          <Box
            flex={'1 0 0'}
            w={0}
            fontSize={'sm'}
            {...(team.role === TeamMemberRoleEnum.owner
              ? {
                  fontWeight: 'bold'
                }
              : {})}
          >
            {team.teamName}
          </Box>
        </Flex>
      ),
      value: team.teamId
    }));
  }, [myTeams, onSwitchTeam]);

  const defaultList = useMemo(() => {
    return [
      {
        label: t('common:user.team.Personal Team'),
        value: ''
      }
    ];
  }, [t]);

  return (
    <>
      <MySelect
        {...props}
        value={userInfo?.team?.teamId}
        list={userInfo?.team ? teamList : defaultList}
      />
    </>
  );
};

export default TeamMenu;
