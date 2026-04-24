/**
 * @file 对话日志主组件
 * @description 智能客服应用的对话日志管理页面，包含日志列表和优化记录两个子Tab
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Flex, Box, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { format } from 'date-fns';
import LogList from './LogList';
import OptimizeRecords from './OptimizeRecords';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import LogFilters, { type LogFiltersType } from './LogFilters';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { exportChatCorrectionRecords } from '@/web/core/app/api/log';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';

type SubTabType = 'list' | 'optimize';

const ConversationLogs = () => {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<SubTabType>('list');
  const [dateRange, setDateRange] = useState<DateRangeType>(() => {
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 30);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(now);
    toDate.setHours(23, 59, 59, 999);

    return {
      from: fromDate,
      to: toDate
    };
  });
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  // 日志筛选条件
  const [logFilters, setLogFilters] = useState<LogFiltersType | null>(null);

  // 处理日志筛选条件变化
  const handleLogFiltersChange = useCallback((filters: LogFiltersType) => {
    setLogFilters(filters);
  }, []);

  const { runAsync: handleExport, loading: isExporting } = useRequest(
    async () => {
      await exportChatCorrectionRecords({
        appId,
        startTime: dateRange.from,
        endTime: dateRange.to,
        colHeaders: [
          t('app:Correction_Question_Label'),
          t('app:Correction_Answer_Label'),
          t('app:optimize_records_col_indexes')
        ],
        filename: `${appDetail.name}-${t('app:optimize_records')}-${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`
      });
    },
    { errorToast: t('app:fetch_optimize_records_error') }
  );

  // 处理日期范围确认
  const handleDateRangeConfirm = useCallback((newDateRange: DateRangeType) => {
    setDateRange(newDateRange);
  }, []);

  const SubTabHeader = useMemo(() => {
    return (
      <Flex gap={2} pt={4} alignItems={'center'} justifyContent={'space-between'}>
        <FillRowTabs
          list={[
            { label: t('app:log_detail'), value: 'list' as SubTabType },
            { label: t('app:optimize_records'), value: 'optimize' as SubTabType }
          ]}
          h={'40px'}
          value={subTab}
          onChange={(val) => setSubTab(val)}
        />

        {subTab === 'optimize' && (
          <Flex gap={2} alignItems="center">
            <DateRangePicker
              dateRange={dateRange}
              onSuccess={handleDateRangeConfirm}
              bg={'myGray.25'}
              h={10}
              w={'223px'}
              flex={'0 1 300px'}
              rounded={'8px'}
              borderColor={'myGray.200'}
              _hover={{
                borderColor: 'primary.300'
              }}
            />
            <MyTooltip label={t('app:export_optimize_records_tip')}>
              <Button h={10} variant="whiteBase" isLoading={isExporting} onClick={handleExport}>
                {t('common:Export')}
              </Button>
            </MyTooltip>
          </Flex>
        )}
        {subTab === 'list' && <LogFilters appId={appId} onFiltersChange={handleLogFiltersChange} />}
      </Flex>
    );
  }, [
    subTab,
    t,
    dateRange,
    handleDateRangeConfirm,
    appId,
    handleLogFiltersChange,
    handleExport,
    isExporting
  ]);

  return (
    <Flex flexDirection={'column'} h={'full'} bg={'white'} borderRadius={'8px'}>
      <Box px={4}>{SubTabHeader}</Box>
      <Box flex={'1 0 0'} h={0} my={4} bg={'white'} px={4}>
        {subTab === 'list' && <LogList filters={logFilters} />}
        {subTab === 'optimize' && <OptimizeRecords dateRange={dateRange} />}
      </Box>
    </Flex>
  );
};

export default React.memo(ConversationLogs);
