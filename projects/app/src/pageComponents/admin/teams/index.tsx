'use client';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useRef, useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Flex,
  Box,
  Button,
  HStack,
  InputGroup,
  Input,
  InputLeftElement
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import DetailTeamModal from './components/DetailTeamModal';
import { getTeams, putAdminSwitchTeam } from '@/web/admin/team/api';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useUserStore } from '@/web/support/user/useUserStore';

const TeamTable = () => {
  const { t } = useSafeTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resetChatCache } = useChatStore();
  const { initUserInfo } = useUserStore();
  const [search, setSearch] = useState<string>();
  const [switchingTeamId, setSwitchingTeamId] = useState<string>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
    params: {
      search
    },
    refreshDeps: [search],
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
          {t('admin:team_management')}
        </Box>
        <Box flexGrow={1} />
        <InputGroup w={['100%', '250px']} h={'36px'}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder={t('admin:search_by_username')}
            h={'36px'}
            onChange={(e) => setSearch(e.target.value)}
          ></Input>
        </InputGroup>
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
              <Th>{t('admin:team_id_3')}</Th>
              <Th>{t('admin:team_name_2')}</Th>
              <Th>{t('admin:username')}</Th>
              <Th>{t('admin:created_at')}</Th>
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
              {t('admin:no_teams')}
            </Box>
          </Flex>
        )}
      </FixedTableContainer>
    </BoxPageRoot>
  );
};

export default TeamTable;
