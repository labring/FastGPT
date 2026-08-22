'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Flex, Box, Button, HStack, useDisclosure } from '@chakra-ui/react';
import { UsageSourceEnum, UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useUserStore } from '@/web/support/user/useUserStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import {
  accountContentScrollStyles,
  accountPageRootStyles,
  accountTitleTextStyles
} from '@/pageComponents/account/styles';

import UsageTableList from '@/pageComponents/account/usage/UsageTable';
import { type UnitType } from '@/pageComponents/account/usage/type';
import UsageRechargeModal from '@/pageComponents/account/usage/UsageRechargeModal';
const UsageDashboard = dynamic(() => import('@/pageComponents/account/usage/Dashboard'));

export enum UsageTabEnum {
  detail = 'detail',
  dashboard = 'dashboard'
}

const UsageTable = () => {
  const { t } = useClientTranslation(['account_usage', 'account']);
  const { userInfo } = useUserStore();
  const router = useRouter();
  const { usageTab = UsageTabEnum.detail } = router.query as { usageTab: `${UsageTabEnum}` };
  const {
    isOpen: isOpenUsageRecharge,
    onOpen: onOpenUsageRecharge,
    onClose: onCloseUsageRecharge
  } = useDisclosure();

  const [unit, _setUnit] = useState<UnitType>('day');
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });

  const { data: members, ScrollData } = useScrollPagination(getTeamMembers, {});
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
  const [inputValue, _setInputValue] = useState('');

  const Tabs = useMemo(
    () => (
      <FillRowTabs
        w={['100%', 'auto']}
        size={'sm'}
        scrollPositionKey={'account-usage-tabs'}
        list={[
          { label: t('account_usage:usage_detail'), value: 'detail' },
          { label: t('account_usage:dashboard'), value: 'dashboard' }
        ]}
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
      <Flex
        flexDir={['column', 'row']}
        alignItems={['stretch', 'flex-start']}
        justifyContent={['flex-start', 'flex-end']}
        gap={3}
      >
        <Flex alignItems={'center'} gap={2} w={['100%', 'auto']}>
          <Box flexShrink={0} fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
            {t('common:user.Time')}
          </Box>
          <Box flex={['1 1 0', '0 0 auto']} minW={0}>
            <DateRangePicker
              w={['100%', 'auto']}
              bg={'myGray.25'}
              defaultDate={dateRange}
              dateRange={dateRange}
              onSuccess={setDateRange}
            />
          </Box>
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
        <Flex
          alignItems={'center'}
          justifyContent={['flex-start', 'flex-end']}
          gap={3}
          w={['100%', 'auto']}
        >
          {userInfo?.team?.permission.hasManagePer && (
            <Flex flex={['1 1 0', '0 0 auto']} minW={0} alignItems={'center'} gap={2}>
              <Box flexShrink={0} fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
                {t('account_usage:member')}
              </Box>
              <Box flex={['1 1 0', '0 0 auto']} minW={0}>
                <MultipleSelect<string>
                  list={tmbList}
                  value={selectTmbIds}
                  onSelect={(val) => {
                    setSelectTmbIds(val as string[]);
                  }}
                  itemWrap={false}
                  h={'32px'}
                  bg={'myGray.25'}
                  w={['100%', '160px']}
                  ScrollData={ScrollData}
                  isSelectAll={isSelectAllTmb}
                  setIsSelectAll={setIsSelectAllTmb}
                />
              </Box>
            </Flex>
          )}
          <Flex flex={['1 1 0', '0 0 auto']} minW={0} alignItems={'center'} gap={2}>
            <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'}>
              {t('account_usage:source')}
            </Box>
            <Box flex={['1 1 0', '0 0 auto']} minW={0}>
              <MultipleSelect<UsageSourceEnum>
                list={sourceList}
                value={usageSources}
                onSelect={setUsageSources}
                isSelectAll={isSelectAllSource}
                setIsSelectAll={setIsSelectAllSource}
                itemWrap={false}
                height={'32px'}
                bg={'myGray.25'}
                w={['100%', '160px']}
              />
            </Box>
          </Flex>
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
      <Flex {...accountPageRootStyles} flexDirection={'column'}>
        <Flex
          display={['none', 'flex']}
          h={'64px'}
          flexShrink={0}
          px={[3, 6]}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box as={'h1'} {...accountTitleTextStyles}>
            {t('account:usage_records')}
          </Box>
          <Box flex={1} />
          <Button variant={'whitePrimaryOutline'} onClick={onOpenUsageRecharge}>
            {t('account_usage:plan_usage_status')}
          </Button>
        </Flex>
        <Box
          pt={[3, 6]}
          pb={[0, 6]}
          {...accountContentScrollStyles}
          overflowX={'hidden'}
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
        {isOpenUsageRecharge && (
          <UsageRechargeModal
            onClose={onCloseUsageRecharge}
            onPaySuccess={onCloseUsageRecharge}
            title={t('account_usage:plan_usage_status')}
          />
        )}
      </Flex>
    </AccountContainer>
  );
};

export default React.memo(UsageTable);
