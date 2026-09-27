'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import StorageSettingComponent from '@/pageComponents/admin/settings/storage';

const StorageSettingPage = () => {
  return (
    <AdminContainer>
      <StorageSettingComponent />
    </AdminContainer>
  );
};

export default StorageSettingPage;
