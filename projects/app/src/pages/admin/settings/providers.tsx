'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import ProvidersSettingComponent from '@/pageComponents/admin/settings/providers';

const ProvidersSettingPage = () => {
  return (
    <AdminContainer>
      <ProvidersSettingComponent />
    </AdminContainer>
  );
};

export default ProvidersSettingPage;
