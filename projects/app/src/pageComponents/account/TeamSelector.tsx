import React, { useMemo } from 'react';
import { Box, type ButtonProps } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { accountCancellationActiveStatuses } from '@fastgpt/global/support/user/account/cancellation/constants';

const TeamSelector = ({
  showManage,
  showAvatar = true,
  onChange,
  ...props
}: Omit<ButtonProps, 'onChange'> & {
  showManage?: boolean;
  showAvatar?: boolean;
  onChange?: () => void;
}) => {
  const { t } = useClientTranslation('user');
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { setLoading } = useSystemStore();
  const { resetChatCache } = useChatStore();

  const { data: myTeams = [] } = useRequest(() => getTeamList(TeamMemberStatusEnum.active), {
    manual: false,
    refreshDeps: [userInfo]
  });

  const { runAsync: onSwitchTeam } = useRequest(
    async (teamId: string) => {
      const targetTeam = myTeams.find((team) => team.teamId === teamId);
      setLoading(true);
      await putSwitchTeam(teamId);
      resetChatCache();
      const isAccountCancellationPending = accountCancellationActiveStatuses.includes(
        targetTeam?.accountCancellation
          ?.status as (typeof accountCancellationActiveStatuses)[number]
      );
      // 路由跳转可能导致当前组件卸载，不能依赖 onFinally 清理全局 loading。
      setLoading(false);
      if (isAccountCancellationPending) {
        await router.replace('/account/cancel');
      } else if (router.pathname === '/account/cancel') {
        await router.replace('/account/info');
      } else {
        await router.reload();
      }
      return isAccountCancellationPending;
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
      ...(showAvatar ? { icon: team.avatar } : {}),
      iconSize: '1.25rem',
      label: team.teamName,
      value: team.teamId
    }));
  }, [myTeams]);

  const formatTeamList = useMemo(() => {
    return [
      ...(showManage
        ? [
            {
              icon: 'common/setting',
              iconSize: '1.25rem',
              label: t('user:manage_team'),
              value: 'manage',
              showBorder: true
            }
          ]
        : []),
      ...teamList
    ];
  }, [showManage, t, teamList]);

  const handleChange = (value: string) => {
    if (value === 'manage') {
      router.push('/account/team');
    } else {
      onSwitchTeam(value);
    }
  };

  return (
    <Box w={'100%'}>
      <MySelect
        {...props}
        value={userInfo?.team?.teamId}
        list={formatTeamList}
        onChange={handleChange}
      />
    </Box>
  );
};

export default TeamSelector;
