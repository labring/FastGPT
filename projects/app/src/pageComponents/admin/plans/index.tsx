'use client';
import React, { useRef } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, Flex, Box } from '@chakra-ui/react';
import dayjs from 'dayjs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AdminCompositeSearch, { useAdminCompositeSearch } from '@/components/admin/CompositeSearch';
import type { AdminSearchOption } from '@/components/admin/CompositeSearch/utils';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getPlans } from '@/web/admin/wallet/plan/api';
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

const planSearchOptions: readonly AdminSearchOption<'username' | 'teamId' | 'teamName'>[] = [
  { value: 'username', label: '用户名', placeholder: '搜索用户名' },
  { value: 'teamId', label: '团队 ID', placeholder: '搜索团队 ID', exactObjectId: true },
  { value: 'teamName', label: '团队名', placeholder: '搜索团队名' }
];

const PlanTable = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { searchField, inputValue, isInvalid, searchParams, onFieldChange, onInputChange } =
    useAdminCompositeSearch({ options: planSearchOptions });

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
          套餐管理
        </Box>
        <Box flexGrow={1}></Box>
        <AdminCompositeSearch
          options={planSearchOptions}
          field={searchField}
          value={inputValue}
          isInvalid={isInvalid}
          onFieldChange={onFieldChange}
          onValueChange={onInputChange}
        />
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
