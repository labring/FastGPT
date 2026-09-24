'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const ProvidersSettingPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'外部提供商'}
        domain={'config.providers'}
        description={'文档增强解析服务（PDF/深信服）、智能分块引擎及 CRM 客户关系对接。'}
      />
    </AdminContainer>
  );
};

export default ProvidersSettingPage;
