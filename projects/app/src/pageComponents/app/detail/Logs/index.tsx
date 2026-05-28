import React, { useState, useCallback } from 'react';
import { Flex, Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import LogFilters, { type LogFiltersType } from '../ConversationLogs/LogFilters';
import LogList from '../ConversationLogs/LogList';

const Logs = () => {
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const [logFilters, setLogFilters] = useState<LogFiltersType | null>(null);

  const handleLogFiltersChange = useCallback((filters: LogFiltersType) => {
    setLogFilters(filters);
  }, []);

  return (
    <Flex flexDirection={'column'} h={'full'} bg={'white'} borderRadius={'8px'}>
      <Box px={4} pt={4}>
        <LogFilters appId={appId} onFiltersChange={handleLogFiltersChange} />
      </Box>
      <Box flex={'1 0 0'} h={0} my={4} bg={'white'} px={4}>
        <LogList filters={logFilters} />
      </Box>
    </Flex>
  );
};

export default React.memo(Logs);
