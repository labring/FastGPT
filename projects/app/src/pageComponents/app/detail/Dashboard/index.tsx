/**
 * @file 数据看板组件
 * @description 智能客服应用的数据可视化展示页面，复用LogChart组件显示应用数据统计图表
 */
import React, { useMemo } from 'react';
import { Flex, Box } from '@chakra-ui/react';
import LogChart from '../Logs/LogChart';
import { LogsContext, LogsContextProvider } from '../Logs/context';
import { useContextSelector } from 'use-context-selector';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import { useTranslation } from 'next-i18next';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';

const DashboardHeader = () => {
  const { t } = useTranslation();

  const dateRange = useContextSelector(LogsContext, (v) => v.dateRange);
  const setDateRange = useContextSelector(LogsContext, (v) => v.setDateRange);
  const chatSources = useContextSelector(LogsContext, (v) => v.chatSources);
  const setChatSources = useContextSelector(LogsContext, (v) => v.setChatSources);
  const isSelectAllSource = useContextSelector(LogsContext, (v) => v.isSelectAllSource);
  const setIsSelectAllSource = useContextSelector(LogsContext, (v) => v.setIsSelectAllSource);

  const sourceList = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  return (
    <Flex alignItems={'center'} gap={3} px={4} pb={3} flexShrink={0}>
      <Flex w={'226px'}>
        <MultipleSelect<ChatSourceEnum>
          list={sourceList}
          value={chatSources}
          onSelect={setChatSources}
          isSelectAll={isSelectAllSource}
          setIsSelectAll={setIsSelectAllSource}
          h={'36px'}
          rounded={'4px'}
          bg={'white'}
          tagStyle={{ px: 1, py: 1, borderRadius: 'sm', bg: 'myGray.100', color: 'myGray.900' }}
          borderColor={'myGray.200'}
          formLabel={t('app:logs_source')}
          formLabelFontSize={'sm'}
          flexShrink={0}
        />
      </Flex>
      <DateRangePicker
        defaultDate={dateRange}
        onSuccess={(date) => setDateRange(date)}
        bg={'white'}
        h={'36px'}
        w={'240px'}
        rounded={'4px'}
        borderColor={'myGray.200'}
        formLabel={t('app:logs_date')}
        _hover={{ borderColor: 'primary.300' }}
      />
    </Flex>
  );
};

const Dashboard = () => {
  return (
    <LogsContextProvider>
      <Flex
        flexDirection={'column'}
        h={'full'}
        pb={'16px'}
        pt={'16px'}
        bg="white"
        borderRadius={'8px'}
      >
        <DashboardHeader />
        <Box borderBottom={'1px solid'} borderColor={'myGray.200'} mx={'16px'} />
        <LogChart />
      </Flex>
    </LogsContextProvider>
  );
};

export default React.memo(Dashboard);
