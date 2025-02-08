import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import Head from 'next/head';
import React, { useEffect, useMemo } from 'react';

const NextHead = ({ title, icon, desc }: { title?: string; icon?: string; desc?: string }) => {
  const formatIcon = useMemo(() => {
    if (!icon) return LOGO_ICON;
    if (icon.startsWith('http') || icon.startsWith('/')) {
      return icon;
    }
    return LOGO_ICON;
  }, [icon]);

  useEffect(() => {
    // Force update document title
    if (title) {
      document.title = title;
    }
  }, [title]);

  return (
    <Head>
      <title>{title}</title>
      <meta
        name="viewport"
        content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no, viewport-fit=cover"
      />
      <meta httpEquiv="Content-Security-Policy" content="img-src * data:;" />
      {desc && <meta name="description" content={desc} />}
      {icon && <link rel="icon" href={formatIcon} />}
    </Head>
  );
};

export default NextHead;
