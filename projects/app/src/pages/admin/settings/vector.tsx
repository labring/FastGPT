'use client';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminPlaceholder from '@/pageComponents/admin/AdminPlaceholder';

const VectorSettingPage = () => {
  return (
    <AdminContainer>
      <AdminPlaceholder
        title={'向量检索策略'}
        domain={'config.vector'}
        description={'向量量化等级、多语言识别引擎以及 HNSW 检索索引参数。'}
      />
    </AdminContainer>
  );
};

export default VectorSettingPage;
