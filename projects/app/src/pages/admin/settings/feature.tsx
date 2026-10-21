import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import FeatureSettingComponent from '@/pageComponents/admin/settings/feature';

const FeatureSettingPage = () => {
  return (
    <AdminContainer>
      <FeatureSettingComponent />
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

export default FeatureSettingPage;
