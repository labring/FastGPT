'use client';
import React, { useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Box,
  HStack,
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
import BoxCard from '@/components/admin/BoxContainer/Card';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
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
  const { isPc } = useSystem();

  const {
    data: plans,
    isLoading,
    ScrollData,
    getData
  } = usePagination(getPlans, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-plans-list',
    params: {
      search
    },
    type: 'scroll',
    refreshDeps: [search]
  });

  return (
    <BoxCard display={'flex'} flexDirection={'column'} h={'100%'}>
      <HStack pb={4}>
        {isPc && (
          <Box as={'h1'} {...accountTitleTextStyles}>
            套餐管理
          </Box>
        )}
        <Box flexGrow={1}></Box>
        <PlanAddModal
          updateData={() => {
            getData(1);
          }}
        />
        <InputGroup w={['100%', '250px']}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder="请输入用户名搜索"
            size={'sm'}
            onChange={(e) => setSearch(e.target.value)}
          ></Input>
        </InputGroup>
      </HStack>

      <ScrollData position={'relative'} h={'100%'}>
        <TableContainer>
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
              {plans.map((item, i) => (
                <Tr key={i}>
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
                      {item.expiredTime
                        ? dayjs(item.expiredTime).format('YYYY/MM/DD HH:mm:ss')
                        : '-'}
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
        </TableContainer>
      </ScrollData>
    </BoxCard>
  );
};

export default PlanTable;
