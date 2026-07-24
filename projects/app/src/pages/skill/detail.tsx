'use client';
import React from 'react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import SkillDetailPage from '@/pageComponents/dashboard/skill/detail/SkillDetailPage';

const SkillDetail = () => {
  return <SkillDetailPage />;
};

export default SkillDetail;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'chat', 'common', 'skill', 'user']))
    }
  };
}
