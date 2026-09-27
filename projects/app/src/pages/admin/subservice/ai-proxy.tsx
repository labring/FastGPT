'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AiProxySubserviceComponent from '@/pageComponents/admin/subservice/ai-proxy';

const AiProxySubservicePage = () => {
  return (
    <AdminContainer>
      <AiProxySubserviceComponent />
    </AdminContainer>
  );
};

export default AiProxySubservicePage;
