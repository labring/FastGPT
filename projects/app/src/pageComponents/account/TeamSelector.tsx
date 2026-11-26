import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex, type ButtonProps } from '@chakra-ui/react';
import { useDebounce } from 'ahooks';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import { getAdminTeamSelectorList, putAdminSwitchTeam } from '@/web/admin/team/api';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyTag from '@fastgpt/web/components/common/Tag';
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
      return getTeamList(TeamMemberStatusEnum.active);
    },
    {
      manual: false,
      refreshDeps: [userInfo?._id, userInfo?.team?.teamId, isRoot]
    }
  );

  const myTeams = useMemo(() => {
    if (isRoot) {
      return adminTeams.map((team) => ({
        teamId: team.teamId,
        teamName: team.teamName,
        avatar: team.avatar ?? undefined,
        accountCancellation: undefined,
        isOwner: Boolean(team.isOwner)
      }));
    }

    const getSwitchTimestamp = (value?: Date | string) => {
      if (!value) return 0;
      const timestamp = new Date(value).getTime();
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    return memberTeams
      .map((team) => ({
        teamId: team.teamId,
        teamName: team.teamName,
        avatar: team.avatar ?? undefined,
        accountCancellation: team.accountCancellation,
        isOwner: team.role === TeamMemberRoleEnum.owner || Boolean(team.permission?.isOwner),
        lastSwitchTimestamp: getSwitchTimestamp(team.lastSwitchTime)
      }))
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return Number(b.isOwner) - Number(a.isOwner);
        return b.lastSwitchTimestamp - a.lastSwitchTimestamp;
      });
  }, [adminTeams, isRoot, memberTeams]);

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
  const isCurrentTeamOwner = userInfo?.team?.role === TeamMemberRoleEnum.owner;
  const myTeamTagLabel = t('account_team:my_team');

  const teamList = useMemo(() => {
    const buildTeamItem = (team: {
      teamId: string;
      teamName: string;
      avatar?: string;
      isOwner: boolean;
    }) => ({
      ...(showAvatar && team.avatar ? { icon: team.avatar } : {}),
      iconSize: '1.25rem',
      searchText: team.teamName,
      label: team.isOwner ? (
        <Flex alignItems={'center'} justifyContent={'space-between'} flex={1} minW={0} gap={2}>
          <Box noOfLines={1}>{team.teamName}</Box>
          <MyTag
            colorSchema={'blue'}
            type={'fill'}
            px={2}
            py={'2px'}
            fontSize={'mini'}
            flexShrink={0}
          >
            {myTeamTagLabel}
          </MyTag>
        </Flex>
      ) : (
        team.teamName
      ),
      value: team.teamId
    });

    const items = myTeams.map(buildTeamItem);

    // 确保搜索筛选返回前或超分页边界时，当前激活团队仍能回显。
    if (currentTeamId && !searchKeyword && !items.some((item) => item.value === currentTeamId)) {
      const currentItem = buildTeamItem({
        teamId: currentTeamId,
        teamName: currentTeamName,
        avatar: currentTeamAvatar ?? undefined,
        isOwner: isCurrentTeamOwner
      });
      if (isCurrentTeamOwner) {
        return [currentItem, ...items];
      }
      const firstNonOwnerIndex = myTeams.findIndex((team) => !team.isOwner);
      if (firstNonOwnerIndex === -1) {
        return [...items, currentItem];
      }
      return [
        ...items.slice(0, firstNonOwnerIndex),
        currentItem,
        ...items.slice(firstNonOwnerIndex)
      ];
    }

    return items;
  }, [
    currentTeamAvatar,
    currentTeamId,
    currentTeamName,
    isCurrentTeamOwner,
    myTeamTagLabel,
    myTeams,
    searchKeyword,
    showAvatar
  ]);

  const currentValueLabel = useMemo(() => {
    if (!currentTeamId) {
      return undefined;
    }
    return (
      <>
        {showAvatar && currentTeamAvatar && <Avatar mr={2} src={currentTeamAvatar} w={'1.25rem'} />}
        <Box noOfLines={1}>{currentTeamName}</Box>
      </>
    );
  }, [currentTeamAvatar, currentTeamId, currentTeamName, showAvatar]);

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
