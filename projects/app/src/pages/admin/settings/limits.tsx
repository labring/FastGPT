import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import LimitsSettingComponent from '@/pageComponents/admin/settings/limits';

const LimitsSettingPage = () => {
  return (
    <AdminContainer>
      <LimitsSettingComponent />
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

export default LimitsSettingPage;
