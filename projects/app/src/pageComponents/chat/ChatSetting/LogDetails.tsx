import LogTable from '@/pageComponents/app/detail/Logs/LogTable';
import { LogsContext, LogsContextProvider } from '@/pageComponents/app/detail/Logs/context';
import { HeaderControl } from '@/pageComponents/app/detail/Logs/LogChart';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import LogKeysConfigPopover from '@/pageComponents/app/detail/Logs/LogKeysConfigPopover';
import { Box, Flex, Input } from '@chakra-ui/react';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

const LogsFilterBar = () => {
  const { t } = useTranslation();
  const dateRange = useContextSelector(LogsContext, (v) => v.dateRange);
  const setDateRange = useContextSelector(LogsContext, (v) => v.setDateRange);
  const chatSources = useContextSelector(LogsContext, (v) => v.chatSources);
  const setChatSources = useContextSelector(LogsContext, (v) => v.setChatSources);
  const isSelectAllSource = useContextSelector(LogsContext, (v) => v.isSelectAllSource);
  const setIsSelectAllSource = useContextSelector(LogsContext, (v) => v.setIsSelectAllSource);
  const chatSearch = useContextSelector(LogsContext, (v) => v.chatSearch);
  const setChatSearch = useContextSelector(LogsContext, (v) => v.setChatSearch);
  const logKeys = useContextSelector(LogsContext, (v) => v.logKeys);
  const setLogKeys = useContextSelector(LogsContext, (v) => v.setLogKeys);

  return (
    <Flex gap={3}>
      <HeaderControl
        chatSources={chatSources}
        setChatSources={setChatSources}
        isSelectAllSource={isSelectAllSource}
        setIsSelectAllSource={setIsSelectAllSource}
        dateRange={dateRange}
        setDateRange={setDateRange}
        px={[2, 0]}
      />
      <Flex alignItems="center" gap={3} px={[2, 0]}>
        <Flex
          flex={'0 1 240px'}
          rounded={'4px'}
          alignItems={'center'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          _focusWithin={{
            borderColor: 'primary.600',
            boxShadow: '0 0 0 2.4px rgba(51, 112, 255, 0.15)'
          }}
          pl={3}
          h={'36px'}
          flexShrink={0}
        >
          <Box rounded={'4px'} bg={'white'} fontSize={'sm'} border={'none'} whiteSpace={'nowrap'}>
            {t('common:Search')}
          </Box>
          <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
          <Input
            placeholder={t('app:logs_search_title')}
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            fontSize={'sm'}
            border={'none'}
            pl={0}
            _focus={{ boxShadow: 'none' }}
            _placeholder={{ fontSize: 'sm' }}
          />
        </Flex>
        <LogKeysConfigPopover
          logKeysList={logKeys}
          setLogKeysList={(value) =>
            setLogKeys(typeof value === 'function' ? value(logKeys) : value)
          }
        />
      </Flex>
    </Flex>
  );
};

const LogDetails = ({ Header }: Props) => {
  const appId = useContextSelector(ChatPageContext, (v) => v.chatSettings?.appId || '');

  if (!appId) {
    return (
      <Flex gap={'13px'} flexDir="column" h={['calc(100vh - 69px)', 'full']}>
        <Header />
      </Flex>
    );
  }

  return (
    <LogsContextProvider appId={appId}>
      <Flex gap={'13px'} flexDir="column" h={['calc(100vh - 69px)', 'full']}>
        <Header />
        <LogsFilterBar />
        <LogTable appId={appId} />
      </Flex>
    </LogsContextProvider>
  );
};

export default React.memo(LogDetails);
