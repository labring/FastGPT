'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const VersionPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'系统版本'}
        description={'展示当前系统版本、构建元数据以及各节点配置生效状态。'}
      />
    </AdminContainer>
  );
};

export default VersionPage;
