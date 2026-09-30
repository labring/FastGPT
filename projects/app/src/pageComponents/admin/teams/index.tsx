'use client';
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
  InputGroup,
  Input,
  InputLeftElement
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import DetailTeamModal from './components/DetailTeamModal';
import { getTeams } from '@/web/admin/team/api';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const TeamTable = () => {
  const [search, setSearch] = useState<string>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
          团队管理
        </Box>
        <Box flexGrow={1} />
        <InputGroup w={['100%', '250px']} h={'36px'}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder="请输入用户名搜索"
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
                  <DetailTeamModal teamId={item.id} />
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
