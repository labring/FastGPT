'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import FeatureSettingComponent from '@/pageComponents/admin/settings/feature';

const FeatureSettingPage = () => {
  return (
    <AdminContainer>
      <FeatureSettingComponent />
    </AdminContainer>
  );
};

export default FeatureSettingPage;
