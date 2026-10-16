import Script from 'next/script';
import { getDocSiteVariant } from '@/lib/site';

/**
 * Per-domain analytics. Renders nothing unless the matching env var is set at build time.
 * - io: Google Analytics (NEXT_PUBLIC_GOOGLE_ANALYTICS_ID)
 * - cn: Baidu Tongji (NEXT_PUBLIC_BAIDU_TONGJI_ID), only executed on doc.fastgpt.cn
 */
export default function SiteAnalytics() {
  const variant = getDocSiteVariant();
  const gaId = variant === 'io' ? process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID : undefined;
  const baiduId = variant === 'cn' ? process.env.NEXT_PUBLIC_BAIDU_TONGJI_ID : undefined;
  const safe = (v: string) => /^[A-Za-z0-9_-]+$/.test(v);

  return (
    <>
      {gaId && safe(gaId) && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="docs-gtag" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
          </Script>
        </>
      )}
      {baiduId && safe(baiduId) && (
        <Script id="docs-baidu-tongji" strategy="afterInteractive">
          {`if(location.hostname==='doc.fastgpt.cn'){var _hmt=window._hmt=window._hmt||[];var hm=document.createElement('script');hm.src='https://hm.baidu.com/hm.js?${baiduId}';var s=document.getElementsByTagName('script')[0];s.parentNode.insertBefore(hm,s);}`}
        </Script>
      )}
    </>
  );
}
