import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AiProxySubserviceComponent from '@/pageComponents/admin/subservice/ai-proxy';

const AiProxySubservicePage = () => {
  return (
    <AdminContainer>
      <AiProxySubserviceComponent />
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

export default AiProxySubservicePage;
