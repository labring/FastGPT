import React, { useEffect, useMemo, useState } from 'react';
import { Flex, Box, Button } from '@chakra-ui/react';
import { UsageSourceEnum, UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import { getTotalPoints, getUserUsages } from '@/web/support/wallet/usage/api';
import type { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import { addDays, startOfMonth, startOfWeek } from 'date-fns';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import AccountContainer from '../components/AccountContainer';
import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import ExportModal, { ExportModalParams } from './components/ExportModal';
import UsageForm from './components/UsageForm';
import UsageTableList from './components/UsageTable';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MySelect from '@fastgpt/web/components/common/MySelect';

const UsageDetail = dynamic(() => import('./components/UsageDetail'));

const UsageTable = () => {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();
  const [usageDetail, setUsageDetail] = useState<UsageItemType>();
  const [usageType, setUsageType] = useState<'detail' | 'dashboard'>('detail');
  const isDetail = usageType === 'detail';

  const sourceList = useMemo(
    () =>
      Object.entries(UsageSourceMap).map(([key, value]) => ({
        label: t(value.label as any),
        value: key
      })),
    [t]
  );

  const [selectTmbId, setSelectTmbId] = useState(userInfo?.team?.tmbId);
  const { data: members, ScrollData } = useScrollPagination(getTeamMembers, {});
  const [selectTmbIds, setSelectTmbIds] = useState<string[]>([]);
  const [usageSources, setUsageSources] = useState<UsageSourceEnum[]>(
    Object.values(UsageSourceEnum)
  );
  const [projectName, setProjectName] = useState<string>('');
  const [currentParams, setCurrentParams] = useState<ExportModalParams | null>(null);
  const [unit, setUnit] = useState<'day' | 'week' | 'month'>('day');
  // const { data: members = [] } = useRequest2(loadAndGetTeamMembers, {
  //   manual: false,
  //   refreshDeps: [userInfo?.team?.teamId]
  // });

  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <Flex alignItems={'center'} color={'myGray.500'}>
            <Avatar src={item.avatar} w={'20px'} mr={1} rounded={'full'} />
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
    getData,
    total
  } = usePagination(getUserUsages, {
    pageSize: isPc ? 20 : 10,
    params: {
      dateStart: dateRange.from || new Date(),
      dateEnd: addDays(dateRange.to || new Date(), 1),
      // source: usageSource as UsageSourceEnum,
      teamMemberId: selectTmbId ?? '',
      source: usageSources[0],
      teamMemberIds: selectTmbIds,
      projectName
    },
    defaultRequest: false
  });

  const {
    run: getTotalPointsData,
    data: totalPoints,
    loading: totalPointsLoading
  } = useRequest2(
    () =>
      getTotalPoints({
        dateStart: dateRange.from || new Date(),
        dateEnd: addDays(dateRange.to || new Date(), 1),
        teamMemberIds: selectTmbIds,
        sources: usageSources,
        unit
      }),
    {
      manual: true
    }
  );

  const totalUsage = useMemo(() => {
    return totalPoints?.reduce((acc, curr) => acc + curr.totalPoints, 0);
  }, [totalPoints]);

  useEffect(() => {
    if (selectTmbIds.length === 0 || usageSources.length === 0) return;
    if (isDetail) {
      getData(1);
    } else {
      getTotalPointsData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageSources, selectTmbIds.length, projectName, usageType, dateRange, unit]);

  useEffect(() => {
    setSelectTmbIds(members.map((item) => item.tmbId));
  }, [members]);

  return (
    <AccountContainer>
      <Box
        px={[3, 8]}
        pt={[0, 8]}
        pb={[0, 4]}
        h={'full'}
        overflow={'hidden'}
        display={'flex'}
        flexDirection={'column'}
      >
        <Box>
          <FillRowTabs
            list={[
              { label: t('account_usage:usage_detail'), value: 'detail' },
              { label: t('account_usage:dashboard'), value: 'dashboard' }
            ]}
            value={usageType}
            onChange={(e) => setUsageType(e as 'detail' | 'dashboard')}
          />
        </Box>

        <Flex mt={4} flexDir={['column', 'row']} w={'100%'} alignItems={['flex-end', 'center']}>
          <Flex alignItems={'center'}>
            <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} mr={4}>
              {t('common:user.Time')}
            </Box>
            <DateRangePicker
              defaultDate={dateRange}
              dateRange={dateRange}
              position="bottom"
              onChange={setDateRange}
              onSuccess={() => getData(1)}
            />
            {!isDetail && (
              <MySelect
                bg={'myGray.50'}
                minH={'32px'}
                height={'32px'}
                fontSize={'mini'}
                ml={1}
                list={[
                  { label: t('account_usage:every_day'), value: 'day' },
                  { label: t('account_usage:every_week'), value: 'week' },
                  { label: t('account_usage:every_month'), value: 'month' }
                ]}
                value={unit}
                onchange={(val) => {
                  if (!dateRange.from) return dateRange;

                  switch (val) {
                    case 'week':
                      setDateRange({
                        from: startOfWeek(dateRange.from, { weekStartsOn: 1 }),
                        to: dateRange.to
                      });
                      break;
                    case 'month':
                      setDateRange({
                        from: startOfMonth(dateRange.from),
                        to: dateRange.to
                      });
                      break;
                    default:
                      break;
                  }

                  setUnit(val as 'day' | 'week' | 'month');
                }}
              />
            )}
          </Flex>
          {tmbList.length > 1 && userInfo?.team?.permission.hasManagePer && (
            <Flex alignItems={'center'} ml={6}>
              <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} mr={4}>
                {t('account_usage:member')}
              </Box>
              <Box>
                <MultipleSelect<string>
                  list={tmbList}
                  value={selectTmbIds}
                  onSelect={(val) => {
                    console.log(val);
                    setSelectTmbIds(val as string[]);
                  }}
                  itemWrap={false}
                  height={'32px'}
                  bg={'myGray.50'}
                  w={'160px'}
                />
              </Box>
              {/* {tmbList.length > 1 && userInfo?.team?.permission.hasManagePer && (
            <Flex alignItems={'center'}>
              <Box mr={2} flexShrink={0}>
                {t('account_usage:member')}
              </Box>
              <MySelect
                size={'sm'}
                minW={'100px'}
                ScrollData={ScrollData}
                list={tmbList}
                value={selectTmbId}
                onchange={setSelectTmbId}
              />
            </Flex>
          )} */}
            </Flex>
          )}
          <Flex alignItems={'center'} ml={6}>
            <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} mr={4}>
              {t('common:user.type')}
            </Box>
            <Box>
              <MultipleSelect<string>
                list={sourceList}
                value={usageSources}
                onSelect={(val) => setUsageSources(val as UsageSourceEnum[])}
                itemWrap={false}
                height={'32px'}
                bg={'myGray.50'}
                w={'160px'}
              />
            </Box>
          </Flex>
          {isDetail && (
            <Flex alignItems={'center'} ml={6}>
              <Box
                fontSize={'mini'}
                fontWeight={'medium'}
                color={'myGray.900'}
                mr={4}
                whiteSpace={'nowrap'}
              >
                {t('common:user.Application Name')}
              </Box>
              <SearchInput
                placeholder={t('common:user.Application Name')}
                w={'160px'}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </Flex>
          )}
          <Box flex={'1'} />
          {isDetail && (
            <Button
              size={'md'}
              onClick={() => {
                setCurrentParams({
                  dateStart: dateRange.from || new Date(),
                  dateEnd: addDays(dateRange.to || new Date(), 1),
                  sources: usageSources,
                  teamMemberIds: selectTmbIds,
                  teamMemberNames: members
                    .filter((item) => selectTmbIds.includes(item.tmbId))
                    .map((item) => item.memberName),
                  projectName
                });
              }}
            >
              {t('common:Export')}
            </Button>
          )}
        </Flex>

        {isDetail ? (
          <>
            <UsageTableList usages={usages} tmbList={tmbList} isLoading={isLoading} />
            <Flex mt={3} justifyContent={'center'}>
              <Pagination />
            </Flex>
          </>
        ) : (
          <MyBox isLoading={totalPointsLoading}>
            <Flex fontSize={'20px'} fontWeight={'medium'} my={6}>
              <Box color={'black'}>{`${t('account_usage:total_usage')}:`}</Box>
              <Box color={'primary.600'} ml={2}>
                {`${formatNumber(totalUsage || 0)} ${t('account_usage:points')}`}
              </Box>
            </Flex>
            <Flex mb={4} fontSize={'mini'} color={'myGray.500'} fontWeight={'medium'}>
              {t('account_usage:points')}
            </Flex>
            <UsageForm usageData={totalPoints || []} />
          </MyBox>
        )}

        {!!usageDetail && (
          <UsageDetail usage={usageDetail} onClose={() => setUsageDetail(undefined)} />
        )}

        {!!currentParams && (
          <ExportModal
            onClose={() => setCurrentParams(null)}
            params={currentParams}
            total={total}
          />
        )}
      </Box>
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
