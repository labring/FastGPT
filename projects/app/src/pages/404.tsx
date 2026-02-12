'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';

const NonePage = () => {
  const router = useRouter();
  useEffect(() => {
    router.push('/dashboard/agent');
  }, [router]);

  return <div></div>;
};

export default NonePage;
