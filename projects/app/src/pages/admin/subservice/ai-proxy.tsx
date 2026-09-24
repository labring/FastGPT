'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const AiProxySubservicePage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'AI Proxy 监控'}
        domain={'subservice.aiProxy'}
        description={'模型中继代理服务状态、通道健康检查与上游中继配置监控。'}
      />
    </AdminContainer>
  );
};

export default AiProxySubservicePage;
