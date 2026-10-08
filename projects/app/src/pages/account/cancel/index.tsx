import dynamic from 'next/dynamic';

const CancelAccountPage = dynamic(
  () => import('@/pageComponents/account/cancel/CancelAccountPage')
);

export default CancelAccountPage;
