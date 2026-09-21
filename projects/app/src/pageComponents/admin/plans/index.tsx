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
import { getPlans } from '@/web/admin/users/api';
import { standardSubLevelMap } from '../pays';
import type { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import PlanAddModal from './components/PlanAddModal';
import PlanEditModal from './components/PlanEditModal';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

export type PlanType = {
  id: string;
  teamId: string;
  teamName: string;
  userName: string;
  type: `${SubTypeEnum}`;
  level: `${StandardSubLevelEnum}`;
  createTime: string;
  expiredTime: string;
  startTime: string;
  totalPoints: number;
  surplusPoints: number;
  extraDatasetSize: number;

  maxTeamMember?: number;
  maxApp?: number;
  maxDataset?: number;

  maxDatasetSize?: number;
  requestsPerMinute?: number;
  websiteSyncPerDataset?: number;
  chatHistoryStoreDuration?: number;
  appRegistrationCount?: number;
  auditLogStoreDuration?: number;
  ticketResponseTime?: number;
  customDomain?: number;
  maxUploadFileSize?: number;
  maxUploadFileCount?: number;
  enableSandbox?: boolean;
};

const PlanTable = () => {
  const [search, setSearch] = useState<string>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: plans,
    isLoading,
    Pagination,
    total,
    pageSize,
    getData
  } = usePagination(getPlans, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-plans-list',
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
          套餐管理
        </Box>
        <Box flexGrow={1}></Box>
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
        <PlanAddModal
          updateData={() => {
            getData(1);
          }}
        />
      </Flex>

      <FixedTableContainer
        ref={scrollContainerRef}
        position={'relative'}
        h={'100%'}
        maxH={'none'}
        horizontalScroll
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
              <Th>订阅套餐</Th>
              <Th>积分</Th>
              <Th>起止时间</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {plans.map((item) => (
              <Tr key={item.id}>
                <Td>{item.teamId}</Td>
                <Td>{item.teamName}</Td>
                <Td>{item.userName}</Td>
                <Td>
                  {item.type === SubTypeEnum.standard
                    ? `${standardSubLevelMap[item.level]?.label}版`
                    : item.type === SubTypeEnum.extraDatasetSize
                      ? '额外知识库'
                      : 'AI 积分套餐'}
                </Td>
                <Td>
                  {item.totalPoints
                    ? `${Math.round(item.totalPoints - item.surplusPoints)} / ${item.totalPoints}`
                    : '-'}
                </Td>
                <Td>
                  <Box>
                    {item.startTime ? dayjs(item.startTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                  </Box>
                  <Box>
                    {item.expiredTime ? dayjs(item.expiredTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                  </Box>
                </Td>
                <Td>
                  <PlanEditModal
                    data={item}
                    subType={item.type}
                    getData={() => {
                      getData(1);
                    }}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!isLoading && plans.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              无套餐记录～
            </Box>
          </Flex>
        )}
      </FixedTableContainer>
    </BoxPageRoot>
  );
};

export default PlanTable;
