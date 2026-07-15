'use client';
import React from 'react';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import SkillDetailPage from '@/pageComponents/dashboard/skill/detail/SkillDetailPage';
import { serviceSideProps } from '@/web/common/i18n/utils';

const DashboardSkillDetail = () => {
  return <DashboardContainer>{() => <SkillDetailPage />}</DashboardContainer>;
};

export default DashboardSkillDetail;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'chat', 'common', 'skill', 'user']))
    }
  };
}
