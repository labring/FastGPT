import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import CommercialSettingComponent from '@/pageComponents/admin/settings/commercial';

const PaySettingPage = () => {
  return (
    <AdminContainer>
      <CommercialSettingComponent />
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

export default PaySettingPage;
