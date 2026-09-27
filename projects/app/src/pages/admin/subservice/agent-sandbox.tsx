'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AgentSandboxSubserviceComponent from '@/pageComponents/admin/subservice/agent-sandbox';

const AgentSandboxSubservicePage = () => {
  return (
    <AdminContainer>
      <AgentSandboxSubserviceComponent />
    </AdminContainer>
  );
};

export default AgentSandboxSubservicePage;
