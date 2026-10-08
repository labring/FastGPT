import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import SecuritySettingComponent from '@/pageComponents/admin/settings/security';

const SecuritySettingPage = () => {
  return (
    <AdminContainer>
      <SecuritySettingComponent />
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

export default SecuritySettingPage;
