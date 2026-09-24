'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const ResourceSettingPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'资源限制'}
        domain={'config.resource'}
        description={'请求大小限制、字符串处理上限、文件夹层级及文件上传配额。'}
      />
    </AdminContainer>
  );
};

export default ResourceSettingPage;
