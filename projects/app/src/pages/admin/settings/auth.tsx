'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const AuthSettingPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'账号与登录'}
        domain={'config.auth'}
        description={'API Key 限制、密码过期策略、登录渠道与团队默认权限。'}
      />
    </AdminContainer>
  );
};

export default AuthSettingPage;
