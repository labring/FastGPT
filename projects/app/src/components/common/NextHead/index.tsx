import Head from 'next/head';
import React, { useEffect, useMemo } from 'react';

type NextHeadProps = {
  title?: string;
  icon?: string;
  desc?: string;
  robots?: string;
};

/** 渲染页面文档头部元信息；仅在显式传入 robots 时输出搜索引擎索引指令。 */
const NextHead = ({ title, icon, desc, robots }: NextHeadProps) => {
  const formatIcon = useMemo(() => {
    if (!icon || icon === '/') return '/favicon.ico';
    if (icon.startsWith('http') || icon.startsWith('/')) {
      return icon;
    }
    return '/favicon.ico';
  }, [icon]);

  // 针对 Chromium / Webkit 浏览器对 React Head 动态更新 favicon 的非响应问题，
  // 必须直接操作真实 DOM 的 link 节点并触发浏览器标签栏实时重绘。
  useEffect(() => {
    if (typeof window === 'undefined' || !formatIcon) return;

    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'shortcut icon';
      document.head.appendChild(link);
    }

    if (link.getAttribute('href') !== formatIcon) {
      link.setAttribute('href', formatIcon);
    }
  }, [formatIcon]);

  return (
    <Head>
      <title>{title}</title>
      <meta
        name="viewport"
        content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no, viewport-fit=cover"
      />
      <meta httpEquiv="Content-Security-Policy" content="img-src * data: blob:;" />
      {desc && <meta name="description" content={desc} />}
      {robots && <meta name="robots" content={robots} />}
      {icon && <link rel="icon" href={formatIcon} />}
    </Head>
  );
};

export default NextHead;
