import React from 'react';
import Price from '@/components/support/wallet/Price';
import { useRouter } from 'next/router';

const PriceBox = () => {
  const router = useRouter();
  return <Price onClose={router.back} />;
};

export default PriceBox;
