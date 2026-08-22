'use client';
import React from 'react';
import ApiKeyTable from '@/components/support/apikey/Table';
import AccountContainer from '@/pageComponents/account/AccountContainer';

const ApiKey = () => {
  return (
    <AccountContainer>
      <ApiKeyTable />
    </AccountContainer>
  );
};

export default ApiKey;
