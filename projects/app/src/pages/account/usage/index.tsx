'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Flex, Box, HStack } from '@chakra-ui/react';
import { UsageSourceEnum, UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import { addDays, startOfMonth, startOfWeek } from 'date-fns';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

import UsageTableList from '@/pageComponents/account/usage/UsageTable';
import { type UnitType } from '@/pageComponents/account/usage/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
const UsageDashboard = dynamic(() => import('@/pageComponents/account/usage/Dashboard'));

export enum UsageTabEnum {
  detail = 'detail',
  dashboard = 'dashboard'
}

const UsageTable = () => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { isPc } = useSystem();
  const router = useRouter();
  const { usageTab = UsageTabEnum.detail } = router.query as { usageTab: `${UsageTabEnum}` };

  const [unit, setUnit] = useState<UnitType>('day');
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });

  const { data: members, ScrollData, total: memberTotal } = useScrollPagination(getTeamMembers, {});
  const {
    value: selectTmbIds,
    setValue: setSelectTmbIds,
    isSelectAll: isSelectAllTmb,
    setIsSelectAll: setIsSelectAllTmb
  } = useMultipleSelect<string>([], true);
  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <HStack spacing={1} color={'myGray.500'}>
            <Avatar src={item.avatar} w={'1.2rem'} mr={1} rounded={'full'} />
            <Box>{item.memberName}</Box>
          </HStack>
        ),
        value: item.tmbId
      })),
    [members]
  );

  const {
    value: usageSources,
    setValue: setUsageSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<UsageSourceEnum>(Object.values(UsageSourceEnum), true);
  const sourceList = useMemo(
    () =>
      Object.entries(UsageSourceMap).map(([key, value]) => ({
        label: t(value.label as any),
        value: key as UsageSourceEnum
      })),
    [t]
  );

  const [projectName, setProjectName] = useState<string>('');
  const [inputValue, setInputValue] = useState('');

  const Tabs = useMemo(
    () => (
      <FillRowTabs
        list={[
          { label: t('account_usage:usage_detail'), value: 'detail' },
          { label: t('account_usage:dashboard'), value: 'dashboard' }
        ]}
        py={1}
        value={usageTab}
        onChange={(e) => {
          router.replace({
            query: {
              ...router.query,
              usageTab: e
            }
          });
        }}
      />
    ),
    [router, t, usageTab]
  );

  const Selectors = useMemo(
    () => (
      <Flex flexDir={['column', 'row']} alignItems={'center'} gap={3}>
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
            {t('common:user.Time')}
          </Box>
          <DateRangePicker defaultDate={dateRange} dateRange={dateRange} onSuccess={setDateRange} />
          {/* {usageTab === UsageTabEnum.dashboard && (
            <MySelect<UnitType>
              bg={'myGray.50'}
              minH={'32px'}
              height={'32px'}
              fontSize={'mini'}
              ml={1}
              list={[
                { label: t('account_usage:every_day'), value: 'day' },
                { label: t('account_usage:every_month'), value: 'month' }
              ]}
              value={unit}
              onChange={setUnit}
            />
          )} */}
        </Flex>
        {userInfo?.team?.permission.hasManagePer && (
          <Flex alignItems={'center'} gap={2}>
            <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
              {t('account_usage:member')}
            </Box>
            <Box>
              <MultipleSelect<string>
                list={tmbList}
                value={selectTmbIds}
                onSelect={(val) => {
                  setSelectTmbIds(val as string[]);
                }}
                itemWrap={false}
                h={'32px'}
                bg={'myGray.50'}
                w={'160px'}
                ScrollData={ScrollData}
                isSelectAll={isSelectAllTmb}
                setIsSelectAll={setIsSelectAllTmb}
              />
            </Box>
          </Flex>
        )}
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
            {t('account_usage:source')}
          </Box>
          <Box>
            <MultipleSelect<UsageSourceEnum>
              list={sourceList}
              value={usageSources}
              onSelect={setUsageSources}
              isSelectAll={isSelectAllSource}
              setIsSelectAll={setIsSelectAllSource}
              itemWrap={false}
              height={'32px'}
              bg={'myGray.50'}
              w={'160px'}
            />
          </Box>
        </Flex>
        {/* {usageTab === UsageTabEnum.detail && (
          <Flex alignItems={'center'}>
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
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </Flex>
        )} */}
      </Flex>
    ),
    [
      t,
      dateRange,
      userInfo?.team?.permission.hasManagePer,
      tmbList,
      selectTmbIds,
      ScrollData,
      isSelectAllTmb,
      setIsSelectAllTmb,
      sourceList,
      usageSources,
      setUsageSources,
      isSelectAllSource,
      setIsSelectAllSource,
      setSelectTmbIds
    ]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setProjectName(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const filterParams = useMemo(
    () => ({
      dateRange,
      selectTmbIds,
      projectName,
      isSelectAllTmb,
      usageSources,
      isSelectAllSource,
      unit
    }),
    [dateRange, isSelectAllSource, unit, isSelectAllTmb, projectName, selectTmbIds, usageSources]
  );

  return (
    <AccountContainer>
      <Box
        px={[3, 8]}
        pt={[0, 4]}
        pb={[0, 4]}
        h={'full'}
        overflow={'hidden'}
        display={'flex'}
        flexDirection={'column'}
      >
        {usageTab === UsageTabEnum.detail && (
          <UsageTableList filterParams={filterParams} Tabs={Tabs} Selectors={Selectors} />
        )}
        {usageTab === UsageTabEnum.dashboard && (
          <UsageDashboard filterParams={filterParams} Tabs={Tabs} Selectors={Selectors} />
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
