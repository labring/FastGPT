'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import CommercialSettingComponent from '@/pageComponents/admin/settings/commercial';

const PaySettingPage = () => {
  return (
    <AdminContainer>
      <CommercialSettingComponent />
    </AdminContainer>
  );
};

export default PaySettingPage;
