import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AuditTable from '@/pageComponents/admin/audit/AuditTable';

const AdminPage = () => {
  return (
    <AdminContainer>
      <AuditTable />
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

export default AdminPage;
