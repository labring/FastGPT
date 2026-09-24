'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const PluginSubservicePage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'插件服务监控'}
        domain={'subservice.plugin'}
        description={'插件网关连接状态、连通性实时健康探测与已加载插件清单。'}
      />
    </AdminContainer>
  );
};

export default PluginSubservicePage;
