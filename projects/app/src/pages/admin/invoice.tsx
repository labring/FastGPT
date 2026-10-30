import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import InvoiceManageTable from '@/pageComponents/admin/invoice/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <InvoiceManageTable />
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
