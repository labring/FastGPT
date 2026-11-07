'use client';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getInitFormData } from '@/web/admin/system/api';
import SingleSelectFilter from '@fastgpt/web/components/common/TagFilter/SingleSelectFilter';
import {
  useDashboardFilters,
  DashboardFiltersContext,
  defaultDashboardFilters,
  normalizeDashboardFilters,
  type DashboardFilters,
  type DateRange,
  type Granularity
} from './utils';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';

export type DashboardTab = 'overview' | 'traffic' | 'payment' | 'active' | 'cost';

type DashboardHeaderProps = {
  currentTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
};

const DashboardHeader = ({ currentTab, onTabChange }: DashboardHeaderProps) => {
  const { t } = useSafeTranslation();
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

  const { dateRange, granularity, updateFilters } = useDashboardFilters();

  // Show date range selector for non-overview pages
  const showDateRangeSelector = currentTab !== 'overview';

  const handleDateRangeChange = (range: DateRange) => {
    updateFilters({ dateRange: range, granularity: range === 7 ? 'day' : granularity });
  };

  const handleGranularityChange = (value: Granularity) => {
    updateFilters({ granularity: value });
  };

  return (
    <Flex mb={4} justify={'space-between'} align={'center'} gap={4} flexWrap={'wrap'}>
      <FillRowTabs<DashboardTab>
        list={[
          {
            label: t('admin:dashboard_overview'),
            value: 'overview'
          },
          {
            label: t('admin:dashboard_traffic'),
            value: 'traffic'
          },
          ...(isSubscriptionEnabled
            ? [
                {
                  label: t('admin:dashboard_payment'),
                  value: 'payment' as const
                }
              ]
            : []),
          {
            label: t('admin:dashboard_active'),
            value: 'active'
          },
          {
            label: t('admin:dashboard_cost'),
            value: 'cost'
          }
        ]}
        py={1.5}
        value={currentTab}
        onChange={onTabChange}
      />

      {showDateRangeSelector && (
        <Flex alignItems={'center'} gap={3} flexWrap={'wrap'}>
          <SingleSelectFilter<DateRange>
            storageKey={'admin.dashboard.dateRange'}
            title={t('admin:dashboard_date_range')}
            options={[
              { label: t('admin:dashboard_7_days'), value: 7 },
              { label: t('admin:dashboard_30_days'), value: 30 },
              { label: t('admin:dashboard_90_days'), value: 90 },
              { label: t('admin:dashboard_360_days'), value: 360 }
            ]}
            value={dateRange}
            onChange={handleDateRangeChange}
          />
          {dateRange !== 7 && (
            <SingleSelectFilter<Granularity>
              storageKey={'admin.dashboard.granularity'}
              title={t('admin:dashboard_granularity')}
              options={[
                { label: t('admin:dashboard_day'), value: 'day' },
                { label: t('admin:dashboard_month'), value: 'month' },
                { label: t('admin:dashboard_quarter'), value: 'quarter' }
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

export const DashboardLayout = ({
  children,
  currentTab,
  onTabChange
}: DashboardHeaderProps & { children: React.ReactNode }) => {
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const updateFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setFilters((previous) => normalizeDashboardFilters({ ...previous, ...patch }));
  }, []);
  const context = useMemo(() => ({ filters, updateFilters }), [filters, updateFilters]);
  return (
    <DashboardFiltersContext.Provider value={context}>
      <BoxPageRoot
        display={'flex'}
        flexDirection={'column'}
        h={'100%'}
        minH={0}
        overflow={'hidden'}
        p={0}
      >
        <Box flexShrink={0} px={[4, 6]} pt={[4, 6]}>
          <DashboardHeader currentTab={currentTab} onTabChange={onTabChange} />
        </Box>
        <Box
          flex={'1 1 0'}
          minH={0}
          overflowY={'auto'}
          overflowX={'hidden'}
          px={[4, 6]}
          pb={[4, 6]}
        >
          {children}
        </Box>
      </BoxPageRoot>
    </DashboardFiltersContext.Provider>
  );
};

export default DashboardHeader;
