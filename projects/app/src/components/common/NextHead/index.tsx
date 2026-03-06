import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import Head from 'next/head';
import React, { useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

const NextHead = ({ title, icon, desc }: { title?: string; icon?: string; desc?: string }) => {
  const { feConfigs } = useSystemStore();
  const defaultIcon = getWebReqUrl(feConfigs?.systemLogo || LOGO_ICON);

  const formatIcon = useMemo(() => {
    if (!icon) return defaultIcon;
    if (icon.startsWith('http') || icon.startsWith('/')) {
      return icon;
    }
    return defaultIcon;
  }, [icon, defaultIcon]);

  return (
    <Head>
      <title>{title}</title>
      <meta
        name="viewport"
        content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no, viewport-fit=cover"
      />
      <meta httpEquiv="Content-Security-Policy" content="img-src * data: blob:;" />
      {desc && <meta name="description" content={desc} />}
      {icon && <link rel="icon" href={formatIcon} />}
    </Head>
  );
};

export default NextHead;
