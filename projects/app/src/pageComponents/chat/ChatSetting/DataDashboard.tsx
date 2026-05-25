import LogChart, { HeaderControl } from '@/pageComponents/app/detail/Logs/LogChart';
import { LogsContext, LogsContextProvider } from '@/pageComponents/app/detail/Logs/context';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { Flex } from '@chakra-ui/react';
import React from 'react';
import { useContextSelector } from 'use-context-selector';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

const LogsFilterBar = () => {
  const dateRange = useContextSelector(LogsContext, (v) => v.dateRange);
  const setDateRange = useContextSelector(LogsContext, (v) => v.setDateRange);
  const chatSources = useContextSelector(LogsContext, (v) => v.chatSources);
  const setChatSources = useContextSelector(LogsContext, (v) => v.setChatSources);
  const isSelectAllSource = useContextSelector(LogsContext, (v) => v.isSelectAllSource);
  const setIsSelectAllSource = useContextSelector(LogsContext, (v) => v.setIsSelectAllSource);

  return (
    <HeaderControl
      chatSources={chatSources}
      setChatSources={setChatSources}
      isSelectAllSource={isSelectAllSource}
      setIsSelectAllSource={setIsSelectAllSource}
      dateRange={dateRange}
      setDateRange={setDateRange}
      px={[2, 0]}
    />
  );
};

const DataDashboard = ({ Header }: Props) => {
  const appId = useContextSelector(ChatPageContext, (v) => v.chatSettings?.appId || '');

  return (
    <LogsContextProvider appId={appId}>
      <Flex gap={'13px'} flexDir="column" h={['calc(100vh - 69px)', 'full']}>
        <Header />
        <LogsFilterBar />
        <LogChart appId={appId} />
      </Flex>
    </LogsContextProvider>
  );
};

export default React.memo(DataDashboard);
