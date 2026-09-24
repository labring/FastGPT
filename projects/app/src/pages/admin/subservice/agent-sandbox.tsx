'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const AgentSandboxSubservicePage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'Agent Sandbox 管理'}
        domain={'subservice.agentSandbox'}
        description={'多沙箱 Provider 调度、CPU/内存/存储资源规格与生命周期策略管理。'}
      />
    </AdminContainer>
  );
};

export default AgentSandboxSubservicePage;
