import React from 'react';
import Price from '@/components/support/wallet/Price';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/utils/i18n';

const PriceBox = () => {
  const router = useRouter();
  return <Price onClose={router.back} />;
};

export default PriceBox;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
