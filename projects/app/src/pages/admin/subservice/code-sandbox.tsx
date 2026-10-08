import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import CodeSandboxSubserviceComponent from '@/pageComponents/admin/subservice/code-sandbox';

const CodeSandboxSubservicePage = () => {
  return (
    <AdminContainer>
      <CodeSandboxSubserviceComponent />
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

export default CodeSandboxSubservicePage;
