import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import CoreSettingComponent from '@/pageComponents/admin/settings/core';

const CoreSettingPage = () => {
  return (
    <AdminContainer>
      <CoreSettingComponent />
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

export default CoreSettingPage;
