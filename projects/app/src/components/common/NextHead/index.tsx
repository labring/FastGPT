import Head from 'next/head';
import React from 'react';

const NextHead = ({ title, icon, desc }: { title?: string; icon?: string; desc?: string }) => {
  return (
    <Head>
      <title>{title}</title>
      {desc && <meta name="description" content={desc} />}
      {icon && <link rel="icon" href={icon} />}
    </Head>
  );
};

export default NextHead;
