'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const PerformanceSettingPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'性能与并发'}
        domain={'config.performance'}
        description={'工作流并发控制、文件解析超时、知识库处理并发及对话 QPM 限制。'}
      />
    </AdminContainer>
  );
};

export default PerformanceSettingPage;
