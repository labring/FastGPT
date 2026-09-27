'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import SecuritySettingComponent from '@/pageComponents/admin/settings/security';

const SecuritySettingPage = () => {
  return (
    <AdminContainer>
      <SecuritySettingComponent />
    </AdminContainer>
  );
};

export default SecuritySettingPage;
