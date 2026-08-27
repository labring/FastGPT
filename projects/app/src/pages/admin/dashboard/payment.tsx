'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import PaymentPage from '@/pageComponents/admin/dashboard/payment';

const AdminPage = () => {
  return (
    <AdminContainer>
      <PaymentPage />
    </AdminContainer>
  );
};

export default AdminPage;
