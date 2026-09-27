'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import ResourceSettingComponent from '@/pageComponents/admin/settings/resource';

const ResourceSettingPage = () => {
  return (
    <AdminContainer>
      <ResourceSettingComponent />
    </AdminContainer>
  );
};

export default ResourceSettingPage;
