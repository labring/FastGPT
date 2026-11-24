import { serviceSideProps } from '@/web/common/i18n/utils';
import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import ModerationPolicy from '@/pageComponents/admin/moderation/policy';

const AdminModerationPolicyPage = () => {
  return (
    <AdminContainer>
      <ModerationPolicy />
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

export default AdminModerationPolicyPage;
