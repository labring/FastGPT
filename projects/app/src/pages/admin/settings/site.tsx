import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import SiteSettingComponent from '@/pageComponents/admin/settings/site';

const SiteSettingPage = () => {
  return (
    <AdminContainer>
      <SiteSettingComponent />
    </AdminContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['admin']))
    }
  };
}

export default SiteSettingPage;
