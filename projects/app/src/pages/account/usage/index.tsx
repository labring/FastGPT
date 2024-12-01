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
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/web/support/user/useUserStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import AccountContainer, { TabEnum } from '../components/AccountContainer';
import { serviceSideProps } from '@/web/common/utils/i18n';

const UsageDetail = dynamic(() => import('./UsageDetail'));

const UsageTable = () => {
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });
  const [usageSource, setUsageSource] = useState<UsageSourceEnum | ''>('');
  const { isPc } = useSystem();
  const { userInfo, loadAndGetTeamMembers } = useUserStore();
  const [usageDetail, setUsageDetail] = useState<UsageItemType>();

  const sourceList = useMemo(
    () =>
      [
        { label: t('account_usage:all'), value: '' },
        ...Object.entries(UsageSourceMap).map(([key, value]) => ({
          label: t(value.label as any),
          value: key
        }))
      ] as {
        label: never;
        value: UsageSourceEnum | '';
      }[],
    [t]
  );

  const [selectTmbId, setSelectTmbId] = useState(userInfo?.team?.tmbId);
  const { data: members = [] } = useQuery(['getMembers', userInfo?.team?.teamId], () => {
    if (!userInfo?.team?.teamId) return [];
    return loadAndGetTeamMembers();
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
    <AccountContainer>
      <Flex flexDirection={'column'} py={[0, 5]} h={'100%'} position={'relative'}>
        <Flex
          flexDir={['column', 'row']}
          gap={2}
          w={'100%'}
          px={[3, 8]}
          alignItems={['flex-end', 'center']}
        >
          {tmbList.length > 1 && userInfo?.team?.permission.hasManagePer && (
            <Flex alignItems={'center'}>
              <Box mr={2} flexShrink={0}>
                {t('account_usage:member')}
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
                {/* <Th>{t('account_usage:user.team.Member Name')}</Th> */}
                <Th>{t('account_usage:user_type')}</Th>
                <Th>
                  <MySelect<UsageSourceEnum | ''>
                    list={sourceList}
                    value={usageSource}
                    size={'sm'}
                    onchange={(e) => {
                      setUsageSource(e);
                    }}
                    w={'130px'}
                  ></MySelect>
                </Th>
                <Th>{t('account_usage:project_name')}</Th>
                <Th>{t('account_usage:total_points')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {usages.map((item) => (
                <Tr key={item.id}>
                  {/* <Td>{item.memberName}</Td> */}
                  <Td>{dayjs(item.time).format('YYYY/MM/DD HH:mm:ss')}</Td>
                  <Td>{t(UsageSourceMap[item.source]?.label as any) || '-'}</Td>
                  <Td>{t(item.appName as any) || '-'}</Td>
                  <Td>{formatNumber(item.totalPoints) || 0}</Td>
                  <Td>
                    <Button
                      size={'sm'}
                      variant={'whitePrimary'}
                      onClick={() => setUsageDetail(item)}
                    >
                      {t('account_usage:details')}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!isLoading && usages.length === 0 && (
            <EmptyTip text={t('account_usage:no_usage_records')}></EmptyTip>
          )}
        </TableContainer>

        <Loading loading={isLoading} fixed={false} />
        {!!usageDetail && (
          <UsageDetail usage={usageDetail} onClose={() => setUsageDetail(undefined)} />
        )}
      </Flex>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account_usage', 'account']))
    }
  };
}

export default React.memo(UsageTable);
