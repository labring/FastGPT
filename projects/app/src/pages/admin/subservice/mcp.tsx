import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import McpSubserviceComponent from '@/pageComponents/admin/subservice/mcp';

const McpSubservicePage = () => {
  return (
    <AdminContainer>
      <McpSubserviceComponent />
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

export default McpSubservicePage;
