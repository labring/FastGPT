import { serviceSideProps } from '@/web/common/utils/i18n';
import React, { useEffect } from 'react';
import Loading from '@/components/Loading';
import { useRouter } from 'next/router';

const index = () => {
  const router = useRouter();
  useEffect(() => {
    router.push('/app/list');
  }, [router]);
  return <Loading></Loading>;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}
export default index;
