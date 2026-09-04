'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Flex, Box, Button, useDisclosure } from '@chakra-ui/react';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useUserStore } from '@/web/support/user/useUserStore';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import {
  MultiSelectFilter,
  createMultiSelectFilter,
  type MultiSelectFilterValue,
  useCommonFilterLabels
} from '@fastgpt/web/components/common/TagFilter';
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
import TeamMemberFilter from '@/components/support/user/TeamMemberFilter';
const UsageDashboard = dynamic(() => import('@/pageComponents/account/usage/Dashboard'));

export enum UsageTabEnum {
  detail = 'detail',
  dashboard = 'dashboard'
}

const UsageTable = () => {
  const { t } = useClientTranslation(['account_usage', 'account']);
  const labels = useCommonFilterLabels();
  const { userInfo } = useUserStore();
  const router = useRouter();
  const { usageTab = UsageTabEnum.detail } = router.query as { usageTab: `${UsageTabEnum}` };
  const {
    isOpen: isOpenUsageRecharge,
    onOpen: onOpenUsageRecharge,
    onClose: onCloseUsageRecharge
  } = useDisclosure();

  const [unit] = useState<UnitType>('day');
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });
  const [memberFilter, setMemberFilter] = useState(createMultiSelectFilter());
  const [sourceFilter, setSourceFilter] =
    useState<MultiSelectFilterValue<UsageSourceEnum>>(createMultiSelectFilter());

  const sourceOptions = useMemo(
    () =>
      Object.entries(UsageSourceMap).map(([key, value]) => ({
        label: t(value.label as any),
        value: key as UsageSourceEnum
      })),
    [t]
  );

  const [projectName, setProjectName] = useState<string>('');
  const [inputValue] = useState('');

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
        <DateRangePicker
          formLabel={t('common:user.Time')}
          w={'fit-content'}
          flexShrink={0}
          defaultDate={dateRange}
          dateRange={dateRange}
          onSuccess={setDateRange}
        />
        {userInfo?.team?.permission.hasManagePer && (
          <TeamMemberFilter
            title={t('account_usage:member')}
            value={memberFilter}
            onChange={setMemberFilter}
          />
        )}
        <MultiSelectFilter
          title={t('account_usage:source')}
          value={sourceFilter}
          onChange={setSourceFilter}
          options={sourceOptions}
          labels={labels}
        />
      </Flex>
    ),
    [
      t,
      dateRange,
      userInfo?.team?.permission.hasManagePer,
      memberFilter,
      sourceFilter,
      sourceOptions,
      labels
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
      memberFilter,
      sourceFilter,
      projectName,
      unit
    }),
    [dateRange, memberFilter, projectName, sourceFilter, unit]
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
