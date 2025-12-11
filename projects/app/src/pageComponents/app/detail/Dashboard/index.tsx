/**
 * @file 数据看板组件
 * @description 智能客服应用的数据可视化展示页面，复用LogChart组件显示应用数据统计图表
 */
import React from 'react';
import { Flex } from '@chakra-ui/react';
import LogChart from '../Logs/LogChart';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { useMultipleSelect } from '@fastgpt/web/components/common/MySelect/MultipleSelect';

const Dashboard = () => {
  const appId = useContextSelector(AppContext, (v) => v.appId);

  const [dateRange, setDateRange] = React.useState<DateRangeType>({
    from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });

  const {
    value: chatSources,
    setValue: setChatSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<ChatSourceEnum>(Object.values(ChatSourceEnum), true);

  return (
    <Flex flexDirection={'column'} h={'full'}>
      <LogChart
        appId={appId}
        chatSources={chatSources}
        setChatSources={setChatSources}
        isSelectAllSource={isSelectAllSource}
        setIsSelectAllSource={setIsSelectAllSource}
        dateRange={dateRange}
        setDateRange={setDateRange}
      />
    </Flex>
  );
};

export default React.memo(Dashboard);
