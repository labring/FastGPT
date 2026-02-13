import LogTable from '@/pageComponents/app/detail/Logs/LogTable';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { Flex } from '@chakra-ui/react';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { useMultipleSelect } from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { addDays } from 'date-fns';
import React, { useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

// Cache the chat source enum values to avoid creating new array on every render
const chatSourceValues = Object.values(ChatSourceEnum);

const LogDetails = ({ Header }: Props) => {
  const appId = useContextSelector(ChatPageContext, (v) => v.chatSettings?.appId || '');

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });

  const {
    value: chatSources,
    setValue: setChatSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<ChatSourceEnum>(chatSourceValues, true);

  return (
    <Flex gap={'13px'} flexDir="column" h={['calc(100vh - 69px)', 'full']}>
      <Header />
      <LogTable
        px={[2, 0]}
        showSourceSelector={false}
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

export default React.memo(LogDetails);
