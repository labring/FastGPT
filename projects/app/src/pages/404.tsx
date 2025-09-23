import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

const NonePage = () => {
  const router = useRouter();
  useEffect(() => {
    router.push('/dashboard/apps');
  }, [router]);

  return <div></div>;
};

export async function getStaticProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}

export default NonePage;
