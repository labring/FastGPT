'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import SiteSettingComponent from '@/pageComponents/admin/settings/site';

const SiteSettingPage = () => {
  return (
    <AdminContainer>
      <SiteSettingComponent />
    </AdminContainer>
  );
};

export default SiteSettingPage;
