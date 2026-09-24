'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const SecuritySettingPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'安全策略'}
        domain={'config.security'}
        description={'IP 限流、CSRF 防护、登录安全审计与跨域白名单。'}
      />
    </AdminContainer>
  );
};

export default SecuritySettingPage;
