'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getInitFormData } from '@/web/admin/config/api';

type DashboardTab = 'overview' | 'traffic' | 'payment' | 'active' | 'cost';
export type DateRange = 7 | 30 | 90 | 180;

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

  // Get dateRange from query, default to 7
  const dateRange = useMemo((): DateRange => {
    const range = router.query.dateRange;
    if (range === '7' || range === '30' || range === '90' || range === '180') {
      return Number(range) as DateRange;
    }
    return 7;
  }, [router.query.dateRange]);

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
      query: tab === 'overview' ? {} : { dateRange }
    });
  };

  const handleDateRangeChange = (range: DateRange) => {
    router.push(
      {
        pathname: router.pathname,
        query: { dateRange: range }
      },
      undefined,
      { shallow: true }
    );
  };

  return (
    <Flex mb={4} justify={'space-between'} align={'center'} gap={4}>
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
        <Box display={'flex'} alignItems={'center'}>
          <FillRowTabs<DateRange>
            list={[
              { label: '近7天', value: 7 },
              { label: '近30天', value: 30 },
              { label: '近90天', value: 90 },
              { label: '近180天', value: 180 }
            ]}
            py={0.5}
            px={2}
            value={dateRange}
            onChange={handleDateRangeChange}
          />
        </Box>
      )}
    </Flex>
  );
};

export default DashboardHeader;
