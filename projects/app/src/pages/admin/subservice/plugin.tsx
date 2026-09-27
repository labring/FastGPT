'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import PluginSubserviceComponent from '@/pageComponents/admin/subservice/plugin';

const PluginSubservicePage = () => {
  return (
    <AdminContainer>
      <PluginSubserviceComponent />
    </AdminContainer>
  );
};

export default PluginSubservicePage;
