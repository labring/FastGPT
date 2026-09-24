'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const SiteSettingPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'站点信息'}
        domain={'config.site'}
        description={'站点名称、描述、图标、文档链接与前端入口配置。'}
      />
    </AdminContainer>
  );
};

export default SiteSettingPage;
