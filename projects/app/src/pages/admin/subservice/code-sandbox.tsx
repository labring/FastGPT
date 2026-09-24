'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const CodeSandboxSubservicePage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'Code Sandbox 监控'}
        domain={'subservice.codeSandbox'}
        description={'代码沙箱服务连接状态、健康探测、运行时依赖库与模块发现。'}
      />
    </AdminContainer>
  );
};

export default CodeSandboxSubservicePage;
