import React, { useMemo } from 'react';
import { Box, type ButtonProps } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';

const TeamSelector = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { setLoading } = useSystemStore();

  const { data: myTeams = [] } = useRequest2(() => getTeamList(TeamMemberStatusEnum.active), {
    manual: false,
    refreshDeps: [userInfo]
  });

  const { runAsync: onSwitchTeam } = useRequest2(
    async (teamId: string) => {
      setLoading(true);
      await putSwitchTeam(teamId);
    },
    {
      onFinally: () => {
        router.reload();
        setLoading(false);
      },
      errorToast: t('common:user.team.Switch Team Failed')
    }
  );

  const teamList = useMemo(() => {
    return myTeams.map((team) => ({
      icon: team.avatar,
      iconSize: '1.25rem',
      label: team.teamName,
      value: team.teamId
    }));
  }, [myTeams]);

  return (
    <Box w={'100%'}>
      <MySelect
        value={userInfo?.team?.teamId}
        list={teamList}
        onChange={(value) => onSwitchTeam(value)}
      />
    </Box>
  );
};

export default TeamSelector;
