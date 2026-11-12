import React, { useCallback, useMemo, useState } from 'react';
import { Box, type ButtonProps } from '@chakra-ui/react';
import { useDebounce } from 'ahooks';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import { getAdminTeamSelectorList, putAdminSwitchTeam } from '@/web/admin/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { accountCancellationActiveStatuses } from '@fastgpt/global/support/user/account/cancellation/constants';

const TeamSelector = ({
  showAvatar = true,
  onChange,
  ...props
}: Omit<ButtonProps, 'onChange'> & {
  showAvatar?: boolean;
  onChange?: () => void;
}) => {
  const { t } = useSafeTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { setLoading } = useSystemStore();
  const { resetChatCache } = useChatStore();
  const isRoot = userInfo?.username === 'root';

  const [searchKeyword, setSearchKeyword] = useState('');
  const debouncedSearch = useDebounce(searchKeyword.trim(), { wait: 250 });
  const handleSearchChange = useCallback((val: string) => {
    setSearchKeyword(val);
  }, []);

  const {
    data: adminTeams,
    ScrollData: AdminScrollData,
    isInitialLoading: isAdminInitialLoading
  } = useScrollPagination(getAdminTeamSelectorList, {
    pageSize: 30,
    params: debouncedSearch ? { search: debouncedSearch } : {},
    disabled: !userInfo || !isRoot,
    showNoMoreTip: false,
    refreshDeps: [userInfo?._id, userInfo?.team?.teamId, isRoot, debouncedSearch]
  });

  const { data: memberTeams = [] } = useRequest(
    async () => {
      if (!userInfo || isRoot) return [];
      const teams = await getTeamList(TeamMemberStatusEnum.active);
      return teams.map((team) => ({
        teamId: team.teamId,
        teamName: team.teamName,
        avatar: team.avatar ?? undefined,
        accountCancellation: team.accountCancellation
      }));
    },
    {
      manual: false,
      refreshDeps: [userInfo?._id, userInfo?.team?.teamId, isRoot]
    }
  );

  const myTeams = useMemo(
    () =>
      isRoot
        ? adminTeams.map((team) => ({
            teamId: team.teamId,
            teamName: team.teamName,
            avatar: team.avatar ?? undefined,
            accountCancellation: undefined
          }))
        : memberTeams,
    [adminTeams, isRoot, memberTeams]
  );

  const { runAsync: onSwitchTeam } = useRequest(
    async (teamId: string) => {
      const targetTeam = myTeams.find((team) => team.teamId === teamId);
      setLoading(true);
      if (isRoot) {
        await putAdminSwitchTeam({ teamId });
      } else {
        await putSwitchTeam(teamId);
      }
      resetChatCache();
      onChange?.();
      const isAccountCancellationPending =
        !isRoot &&
        accountCancellationActiveStatuses.includes(
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

  const currentTeamId = userInfo?.team?.teamId;
  const currentTeamName = userInfo?.team?.teamName ?? '';
  const currentTeamAvatar = userInfo?.team?.avatar;

  const teamList = useMemo(() => {
    const items = myTeams.map((team) => ({
      ...(showAvatar && team.avatar ? { icon: team.avatar } : {}),
      iconSize: '1.25rem',
      label: team.teamName,
      value: team.teamId
    }));

    // 确保搜索筛选返回前或超分页边界时，当前激活团队仍能回显纯团队名。
    if (currentTeamId && !searchKeyword && !items.some((item) => item.value === currentTeamId)) {
      return [
        {
          ...(showAvatar && currentTeamAvatar ? { icon: currentTeamAvatar } : {}),
          iconSize: '1.25rem',
          label: currentTeamName,
          value: currentTeamId
        },
        ...items
      ];
    }

    return items;
  }, [currentTeamAvatar, currentTeamId, currentTeamName, myTeams, searchKeyword, showAvatar]);

  const currentValueLabel = useMemo(() => {
    if (!currentTeamId || teamList.some((item) => item.value === currentTeamId)) {
      return undefined;
    }
    return (
      <>
        {showAvatar && currentTeamAvatar && (
          <Avatar mr={2} src={currentTeamAvatar as any} w={'1.25rem'} />
        )}
        <Box noOfLines={1}>{currentTeamName}</Box>
      </>
    );
  }, [currentTeamAvatar, currentTeamId, currentTeamName, showAvatar, teamList]);

  return (
    <Box w={'100%'}>
      <MySelect
        {...props}
        isSearch
        onSearchChange={isRoot ? handleSearchChange : undefined}
        ScrollData={isRoot ? AdminScrollData : undefined}
        isListLoading={isRoot ? isAdminInitialLoading : false}
        value={userInfo?.team?.teamId}
        valueLabel={currentValueLabel}
        list={teamList}
        onChange={onSwitchTeam}
      />
    </Box>
  );
};

export default TeamSelector;
