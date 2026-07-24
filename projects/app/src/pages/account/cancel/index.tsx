import dynamic from 'next/dynamic';
import { serviceSideProps } from '@/web/common/i18n/utils';

const CancelAccountPage = dynamic(
  () => import('@/pageComponents/account/cancel/CancelAccountPage')
);

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context, ['account', 'account_info', 'user']))
    }
  };
}

export default CancelAccountPage;
