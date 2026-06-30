import React, { useState, useCallback, useEffect } from 'react';
import { Flex, Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import LogFilters, { type LogFiltersType } from '../ConversationLogs/LogFilters';
import LogList from '../ConversationLogs/LogList';

const Logs = () => {
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const [logFilters, setLogFilters] = useState<LogFiltersType | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLogFiltersChange = useCallback((filters: LogFiltersType) => {
    setLogFilters(filters);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <Flex flexDirection={'column'} h={'full'} bg={'white'} borderRadius={'8px'}>
      <Box px={4} pt={4}>
        <LogFilters appId={appId} onFiltersChange={handleLogFiltersChange} />
      </Box>
      <Box flex={'1 0 0'} h={0} my={4} bg={'white'} px={4}>
        <LogList filters={logFilters} refreshKey={refreshKey} />
      </Box>
    </Flex>
  );
};

export default React.memo(Logs);
