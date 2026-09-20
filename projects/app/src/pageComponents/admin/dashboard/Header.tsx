'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getInitFormData } from '@/web/admin/config/api';
import SingleSelectFilter from '@fastgpt/web/components/common/TagFilter/SingleSelectFilter';
import { getDashboardFilters, type DateRange, type Granularity } from './utils';

type DashboardTab = 'overview' | 'traffic' | 'payment' | 'active' | 'cost';

const DashboardHeader = () => {
  const router = useRouter();

  const { data: systemConfig } = useRequest(getInitFormData, {
    manual: false
  });

  // Check if subscription is enabled
  const isSubscriptionEnabled = useMemo((): boolean => {
    if (!systemConfig) return false;

    const feConfigs = systemConfig.fastgpt?.feConfigs;
    const subPlans = systemConfig.fastgpt?.subPlans;

    return Boolean(
      feConfigs?.show_pay && subPlans?.standard && Object.keys(subPlans.standard).length > 0
    );
  }, [systemConfig]);

  const currentTab = useMemo((): DashboardTab => {
    const path = router.pathname;
    if (path === '/admin/dashboard') return 'overview';
    if (path === '/admin/dashboard/traffic') return 'traffic';
    if (path === '/admin/dashboard/payment') return 'payment';
    if (path === '/admin/dashboard/active') return 'active';
    if (path === '/admin/dashboard/cost') return 'cost';
    return 'overview';
  }, [router.pathname]);

  const { dateRange, granularity } = getDashboardFilters(router.query);

  // Show date range selector for non-overview pages
  const showDateRangeSelector = currentTab !== 'overview';

  const handleTabChange = (tab: DashboardTab) => {
    const pathMap: Record<DashboardTab, string> = {
      overview: '/admin/dashboard',
      traffic: '/admin/dashboard/traffic',
      payment: '/admin/dashboard/payment',
      active: '/admin/dashboard/active',
      cost: '/admin/dashboard/cost'
    };
    // Keep dateRange when switching tabs
    router.push({
      pathname: pathMap[tab],
      query: tab !== 'overview' ? { dateRange, granularity } : {}
    });
  };

  const handleDateRangeChange = (range: DateRange) => {
    router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, dateRange: range, granularity: range === 7 ? 'day' : granularity }
      },
      undefined,
      { shallow: true }
    );
  };

  const handleGranularityChange = (value: Granularity) => {
    router.push(
      { pathname: router.pathname, query: { ...router.query, granularity: value } },
      undefined,
      { shallow: true }
    );
  };

  return (
    <Flex mb={4} justify={'space-between'} align={'center'} gap={4} flexWrap={'wrap'}>
      <FillRowTabs<DashboardTab>
        list={[
          {
            label: '全局统计',
            value: 'overview'
          },
          {
            label: '流量',
            value: 'traffic'
          },
          ...(isSubscriptionEnabled
            ? [
                {
                  label: '付费',
                  value: 'payment' as const
                }
              ]
            : []),
          {
            label: '活跃',
            value: 'active'
          },
          {
            label: '成本',
            value: 'cost'
          }
        ]}
        py={1.5}
        value={currentTab}
        onChange={handleTabChange}
      />

      {showDateRangeSelector && (
        <Flex alignItems={'center'} gap={3} flexWrap={'wrap'}>
          <SingleSelectFilter<DateRange>
            title={'时间范围'}
            options={[
              { label: '近7天', value: 7 },
              { label: '近30天', value: 30 },
              { label: '近90天', value: 90 },
              { label: '近360天', value: 360 }
            ]}
            value={dateRange}
            onChange={handleDateRangeChange}
          />
          {dateRange !== 7 && (
            <SingleSelectFilter<Granularity>
              title={'颗粒度'}
              options={[
                { label: '按天', value: 'day' },
                { label: '按月', value: 'month' },
                { label: '按季度', value: 'quarter' }
              ]}
              value={granularity}
              onChange={handleGranularityChange}
            />
          )}
        </Flex>
      )}
    </Flex>
  );
};

export default DashboardHeader;
