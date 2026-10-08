import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import PluginSubserviceComponent from '@/pageComponents/admin/subservice/plugin';

const PluginSubservicePage = () => {
  return (
    <AdminContainer>
      <PluginSubserviceComponent />
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

export default PluginSubservicePage;
