import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AgentSandboxSubserviceComponent from '@/pageComponents/admin/subservice/agent-sandbox';

const AgentSandboxSubservicePage = () => {
  return (
    <AdminContainer>
      <AgentSandboxSubserviceComponent />
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

export default AgentSandboxSubservicePage;
