import Head from 'next/head';
import React from 'react';

const NextHead = ({ title, icon, desc }: { title?: string; icon?: string; desc?: string }) => {
  return (
    <Head>
      <title>{title}</title>
      <meta
        name="viewport"
        content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no, viewport-fit=cover"
      />
      {desc && <meta name="description" content={desc} />}
      {icon && <link rel="icon" href={icon} />}
    </Head>
  );
};

export default NextHead;
