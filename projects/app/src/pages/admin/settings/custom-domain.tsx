import React from 'react';
import type { GetServerSideProps } from 'next';
import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import CustomDomainSettingComponent from '@/pageComponents/admin/settings/custom-domain';

const CustomDomainSettingPage = () => (
  <AdminContainer>
    <CustomDomainSettingComponent />
  </AdminContainer>
);

/** 加载自定义域名管理页需要的管理员文案。 */
export const getServerSideProps: GetServerSideProps = async (content) => ({
  props: {
    ...(await serviceSideProps(content, ['admin']))
  }
});

export default CustomDomainSettingPage;
