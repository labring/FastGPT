'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import PerformanceSettingComponent from '@/pageComponents/admin/settings/performance';

const PerformanceSettingPage = () => {
  return (
    <AdminContainer>
      <PerformanceSettingComponent />
    </AdminContainer>
  );
};

export default PerformanceSettingPage;
