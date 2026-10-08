'use client';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
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
import { getPlans } from '@/web/admin/wallet/plan/api';
import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import PlanAddModal from './components/PlanAddModal';
import PlanEditModal from './components/PlanEditModal';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';

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
  const { t } = useClientTranslation('admin');
  const [search, setSearch] = useState<string>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const standardSubLevelMap = {
    [StandardSubLevelEnum.free]: {
      label: t('admin:free_short')
    },
    [StandardSubLevelEnum.custom]: {
      label: t('admin:custom_short')
    },
    [StandardSubLevelEnum.basic]: {
      label: t('admin:basic_short')
    },
    [StandardSubLevelEnum.advanced]: {
      label: t('admin:advanced_short')
    },

    // deprecated
    [StandardSubLevelEnum.experience]: {
      label: t('admin:experience_short')
    },
    [StandardSubLevelEnum.team]: {
      label: t('admin:team')
    },
    [StandardSubLevelEnum.enterprise]: {
      label: t('admin:enterprise_short')
    }
  };

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
          {t('admin:plan_management')}
        </Box>
        <Box flexGrow={1}></Box>
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
              <Th>{t('admin:team_id_3')}</Th>
              <Th>{t('admin:team_name_2')}</Th>
              <Th>{t('admin:username')}</Th>
              <Th>{t('admin:subscription_plans')}</Th>
              <Th>{t('admin:points')}</Th>
              <Th>{t('admin:time_range')}</Th>
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
                      : t('admin:ai_points_package')}
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
              {t('admin:no_plans')}
            </Box>
          </Flex>
        )}
      </FixedTableContainer>
    </BoxPageRoot>
  );
};

export default PlanTable;
