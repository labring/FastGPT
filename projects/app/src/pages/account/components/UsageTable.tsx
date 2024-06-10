import React, { useEffect, useMemo, useState } from 'react';
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
  Button
} from '@chakra-ui/react';
import { UsageSourceEnum, UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import { getUserUsages } from '@/web/support/wallet/usage/api';
import type { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import dayjs from 'dayjs';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamMembers } from '@/web/support/user/team/api';
import Avatar from '@/components/Avatar';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
const UsageDetail = dynamic(() => import('./UsageDetail'));

const UsageTable = () => {
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });
  const [usageSource, setUsageSource] = useState<`${UsageSourceEnum}` | ''>('');
  const { isPc } = useSystemStore();
  const { userInfo } = useUserStore();
  const [usageDetail, setUsageDetail] = useState<UsageItemType>();

  const sourceList = useMemo(
    () => [
      { label: t('common.All'), value: '' },
      ...Object.entries(UsageSourceMap).map(([key, value]) => ({
        label: t(value.label),
        value: key
      }))
    ],
    [t]
  );

  const [selectTmbId, setSelectTmbId] = useState(userInfo?.team?.tmbId);
  const { data: members = [] } = useQuery(['getMembers', userInfo?.team?.teamId], () => {
    if (!userInfo?.team?.teamId) return [];
    return getTeamMembers();
  });
  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <Flex alignItems={'center'}>
            <Avatar src={item.avatar} w={'16px'} mr={1} />
            {item.memberName}
          </Flex>
        ),
        value: item.tmbId
      })),
    [members]
  );

  const {
    data: usages,
    isLoading,
    Pagination,
    getData
  } = usePagination<UsageItemType>({
    api: getUserUsages,
    pageSize: isPc ? 20 : 10,
    params: {
      dateStart: dateRange.from || new Date(),
      dateEnd: addDays(dateRange.to || new Date(), 1),
      source: usageSource,
      teamMemberId: selectTmbId
    },
    defaultRequest: false
  });

  useEffect(() => {
    getData(1);
  }, [usageSource, selectTmbId]);

  return (
    <Flex flexDirection={'column'} py={[0, 5]} h={'100%'} position={'relative'}>
      <Flex
        flexDir={['column', 'row']}
        gap={2}
        w={'100%'}
        px={[3, 8]}
        alignItems={['flex-end', 'center']}
      >
        {tmbList.length > 1 && userInfo?.team?.permission.hasWritePer && (
          <Flex alignItems={'center'}>
            <Box mr={2} flexShrink={0}>
              {t('support.user.team.member')}
            </Box>
            <MySelect
              size={'sm'}
              minW={'100px'}
              list={tmbList}
              value={selectTmbId}
              onchange={setSelectTmbId}
            />
          </Flex>
        )}
        <Box flex={'1'} />
        <Flex alignItems={'center'} gap={3}>
          <DateRangePicker
            defaultDate={dateRange}
            position="bottom"
            onChange={setDateRange}
            onSuccess={() => getData(1)}
          />
          <Pagination />
        </Flex>
      </Flex>
      <TableContainer
        mt={2}
        px={[3, 8]}
        position={'relative'}
        flex={'1 0 0'}
        h={0}
        overflowY={'auto'}
      >
        <Table>
          <Thead>
            <Tr>
              {/* <Th>{t('user.team.Member Name')}</Th> */}
              <Th>{t('user.Time')}</Th>
              <Th>
                <MySelect
                  list={sourceList}
                  value={usageSource}
                  size={'sm'}
                  onchange={(e) => {
                    setUsageSource(e);
                  }}
                  w={'130px'}
                ></MySelect>
              </Th>
              <Th>{t('user.Application Name')}</Th>
              <Th>{t('support.wallet.usage.Total points')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {usages.map((item) => (
              <Tr key={item.id}>
                {/* <Td>{item.memberName}</Td> */}
                <Td>{dayjs(item.time).format('YYYY/MM/DD HH:mm:ss')}</Td>
                <Td>{t(UsageSourceMap[item.source]?.label) || '-'}</Td>
                <Td>{t(item.appName) || '-'}</Td>
                <Td>{formatNumber(item.totalPoints) || 0}</Td>
                <Td>
                  <Button size={'sm'} variant={'whitePrimary'} onClick={() => setUsageDetail(item)}>
                    详情
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {!isLoading && usages.length === 0 && <EmptyTip text="无使用记录~"></EmptyTip>}

      <Loading loading={isLoading} fixed={false} />
      {!!usageDetail && (
        <UsageDetail usage={usageDetail} onClose={() => setUsageDetail(undefined)} />
      )}
    </Flex>
  );
};

export default React.memo(UsageTable);
