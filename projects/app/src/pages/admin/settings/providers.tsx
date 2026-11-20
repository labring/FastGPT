import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import ProvidersSettingComponent from '@/pageComponents/admin/settings/providers';

const ProvidersSettingPage = () => {
  return (
    <AdminContainer>
      <ProvidersSettingComponent />
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

export default ProvidersSettingPage;
