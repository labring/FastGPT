import LogTable from '@/pageComponents/app/detail/Logs/LogTable';
import { LogsContextProvider } from '@/pageComponents/app/detail/Logs/context';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { Flex } from '@chakra-ui/react';
import React from 'react';
import { useContextSelector } from 'use-context-selector';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

const LogDetails = ({ Header }: Props) => {
  const appId = useContextSelector(ChatPageContext, (v) => v.chatSettings?.appId || '');

  return (
    <LogsContextProvider appId={appId}>
      <Flex gap={'13px'} flexDir="column" h={['calc(100vh - 69px)', 'full']}>
        <Header />
        <LogTable />
      </Flex>
    </LogsContextProvider>
  );
};

export default React.memo(LogDetails);
