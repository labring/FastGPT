'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import CodeSandboxSubserviceComponent from '@/pageComponents/admin/subservice/code-sandbox';

const CodeSandboxSubservicePage = () => {
  return (
    <AdminContainer>
      <CodeSandboxSubserviceComponent />
    </AdminContainer>
  );
};

export default CodeSandboxSubservicePage;
