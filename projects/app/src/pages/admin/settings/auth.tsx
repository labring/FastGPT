'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AuthSettingComponent from '@/pageComponents/admin/settings/auth';

const AuthSettingPage = () => {
  return (
    <AdminContainer>
      <AuthSettingComponent />
    </AdminContainer>
  );
};

export default AuthSettingPage;
