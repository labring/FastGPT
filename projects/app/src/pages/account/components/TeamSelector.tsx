import React, { useMemo } from 'react';
import { Box, ButtonProps, Flex } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const TeamSelector = (props: ButtonProps) => {
  const { t } = useTranslation();
  const { userInfo, initUserInfo } = useUserStore();
  const { setLoading } = useSystemStore();

  const { data: myTeams = [] } = useRequest2(() => getTeamList(TeamMemberStatusEnum.active), {
    manual: false,
    refreshDeps: [userInfo]
  });

  const { runAsync: onSwitchTeam } = useRequest2(
    async (teamId: string) => {
      setLoading(true);
      await putSwitchTeam(teamId);
      return initUserInfo();
    },
    {
      onFinally: () => {
        setLoading(false);
      },
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
          <Avatar src={team.avatar} w={['1.25rem', '1.375rem']} />
          <Box flex={'1 0 0'} w={0} className="textEllipsis" fontSize={'sm'}>
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

export default TeamSelector;
