'use client';
import React from 'react';
import ApiKeyTable from '@/components/support/apikey/Table';
import { Box } from '@chakra-ui/react';
import AccountContainer from '@/pageComponents/account/AccountContainer';

const ApiKey = () => {
  return (
    <AccountContainer>
      <Box h={'100%'} minH={0} overflow={'hidden'} px={[4, 8]} py={[4, 6]}>
        <ApiKeyTable />
      </Box>
    </AccountContainer>
  );
};

export default ApiKey;
