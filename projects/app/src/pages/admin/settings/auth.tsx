import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AuthSettingComponent from '@/pageComponents/admin/settings/auth';

const AuthSettingPage = () => {
  return (
    <AdminContainer>
      <AuthSettingComponent />
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

export default AuthSettingPage;
