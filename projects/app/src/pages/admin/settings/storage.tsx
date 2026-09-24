'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const StorageSettingPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'文件与存储策略'}
        domain={'config.storage'}
        description={'下载短链重定向模式、短链有效期以及临时下载链接 TTL。'}
      />
    </AdminContainer>
  );
};

export default StorageSettingPage;
