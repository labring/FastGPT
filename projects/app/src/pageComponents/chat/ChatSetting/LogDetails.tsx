import LogTable from '@/pageComponents/app/detail/Logs/LogTable';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import { Flex } from '@chakra-ui/react';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { useMultipleSelect } from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { addDays } from 'date-fns';
import React, { useState } from 'react';
import { useContextSelector } from 'use-context-selector';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

const LogDetails = ({ Header }: Props) => {
  const appId = useContextSelector(ChatSettingContext, (v) => v.chatSettings?.appId || '');

  const [dateRange, setDateRange] = useState<DateRangeType>({
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
    <Flex
      py={5}
      pl={6}
      pr={[0, 6]}
      gap={'13px'}
      flexDir="column"
      mt={['46px', 0]}
      h={['calc(100vh - 46px)', 'full']}
    >
      <Header />

      <LogTable
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
