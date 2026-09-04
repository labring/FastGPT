import LogTable from '@/pageComponents/app/detail/Logs/LogTable';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { Flex } from '@chakra-ui/react';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { createMultiSelectFilter } from '@fastgpt/web/components/common/TagFilter';
import { addDays } from 'date-fns';
import React, { useState } from 'react';
import { useContextSelector } from 'use-context-selector';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

const LogDetails = ({ Header }: Props) => {
  const appId = useContextSelector(ChatPageContext, (v) => v.chatSettings?.appId || '');

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });
  const [sourceFilter, setSourceFilter] = useState(createMultiSelectFilter<ChatSourceEnum>());

  return (
    <Flex gap={'13px'} flexDir="column" h={['calc(100vh - 69px)', 'full']}>
      <Header />
      <LogTable
        pageSizeCacheKey={'chat-log-details'}
        px={[2, 0]}
        showSourceSelector={false}
        appId={appId}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        dateRange={dateRange}
        setDateRange={setDateRange}
      />
    </Flex>
  );
};

export default React.memo(LogDetails);
