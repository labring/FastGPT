'use client';
import React, { useRef, useState } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, Flex, Box, Button, HStack } from '@chakra-ui/react';
import dayjs from 'dayjs';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AdminCompositeSearch, { useAdminCompositeSearch } from '@/components/admin/CompositeSearch';
import type { AdminSearchOption } from '@/components/admin/CompositeSearch/utils';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import DetailTeamModal from './components/DetailTeamModal';
import { getTeams, putAdminSwitchTeam } from '@/web/admin/team/api';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useUserStore } from '@/web/support/user/useUserStore';

const teamSearchOptions: readonly AdminSearchOption<'username' | 'teamId' | 'teamName'>[] = [
  { value: 'username', label: '用户名', placeholder: '搜索用户名' },
  { value: 'teamId', label: '团队 ID', placeholder: '搜索团队 ID', exactObjectId: true },
  { value: 'teamName', label: '团队名', placeholder: '搜索团队名' }
];

const TeamTable = () => {
  const { t } = useSafeTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resetChatCache } = useChatStore();
  const { initUserInfo } = useUserStore();
  const [switchingTeamId, setSwitchingTeamId] = useState<string>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { searchField, inputValue, isInvalid, searchParams, onFieldChange, onInputChange } =
    useAdminCompositeSearch({ options: teamSearchOptions });

  const { runAsync: onEnterTeam } = useRequest(
    async (teamId: string) => {
      setSwitchingTeamId(teamId);
      await putAdminSwitchTeam({ teamId });
      resetChatCache();
      queryClient.clear();
      await initUserInfo();
      await router.push('/dashboard/agent');
    },
    {
      onFinally: () => {
        setSwitchingTeamId(undefined);
      },
      errorToast: t('common:user.team.Switch Team Failed')
    }
  );

  const {
    data: teams,
    isLoading,
    Pagination,
    total,
    pageSize,
    getData
  } = usePagination(getTeams, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-teams-list',
    params: searchParams,
    refreshDeps: [searchParams],
    scrollContainerRef
  });

  return (
    <BoxPageRoot display={'flex'} flexDirection={'column'} h={'100%'} p={0}>
      <Flex
        h={'64px'}
        flexShrink={0}
        px={6}
        alignItems={'center'}
        gap={2}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Box as={'h1'} {...accountTitleTextStyles}>
          团队管理
        </Box>
        <Box flexGrow={1} />
        <AdminCompositeSearch
          options={teamSearchOptions}
          field={searchField}
          value={inputValue}
          isInvalid={isInvalid}
          onFieldChange={onFieldChange}
          onValueChange={onInputChange}
        />
      </Flex>

      <FixedTableContainer
        ref={scrollContainerRef}
        position={'relative'}
        h={'100%'}
        maxH={'none'}
        px={[4, 6]}
        py={6}
        footer={
          total > pageSize ? (
            <Flex mt={3} justifyContent={'center'}>
              <Pagination />
            </Flex>
          ) : undefined
        }
      >
        <Table>
          <Thead>
            <Tr>
              <Th>团队id</Th>
              <Th>团队名</Th>
              <Th>用户名</Th>
              <Th>创建时间</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {teams.map((item) => (
              <Tr key={item.id}>
                <Td>{item.id}</Td>
                <Td>{item.name}</Td>
                <Td>{item.ownerName}</Td>
                <Td>
                  {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                </Td>
                <Td>
                  <HStack spacing={2}>
                    <DetailTeamModal teamId={item.id} />
                    <Button
                      variant={'whitePrimary'}
                      size={'sm'}
                      isLoading={switchingTeamId === item.id}
                      isDisabled={Boolean(switchingTeamId) && switchingTeamId !== item.id}
                      onClick={() => onEnterTeam(item.id)}
                    >
                      {t('account_team:enter_team')}
                    </Button>
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!isLoading && teams.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              无团队记录～
            </Box>
          </Flex>
        )}
      </FixedTableContainer>
    </BoxPageRoot>
  );
};

export default TeamTable;
