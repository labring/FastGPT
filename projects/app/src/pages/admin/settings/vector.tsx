'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import VectorSettingComponent from '@/pageComponents/admin/settings/vector';

const VectorSettingPage = () => {
  return (
    <AdminContainer>
      <VectorSettingComponent />
    </AdminContainer>
  );
};

export default VectorSettingPage;
