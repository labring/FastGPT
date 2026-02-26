import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Translations } from 'fumadocs-ui/i18n';
import CustomSearchDialog from '@/components/CustomSearchDialog';
import Script from 'next/script';

const inter = Inter({
  subsets: ['latin']
});

const zh_CN: Partial<Translations> = {
  search: '搜索',
  nextPage: '下一页',
  previousPage: '上一页',
  lastUpdate: '最后更新于',
  editOnGithub: '在 GitHub 上编辑',
  searchNoResult: '没有找到相关内容',
  toc: '本页导航',
  tocNoHeadings: '本页没有导航',
  chooseLanguage: '选择语言'
};

const locales = [
  {
    name: 'English',
    locale: 'en'
  },
  {
    name: '简体中文',
    locale: 'zh-CN'
  }
];

export default async function Layout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  // Get tracking config from env
  const trackSrc = process.env.NEXT_PUBLIC_DOC_TRACK_SRC;
  const trackCn = process.env.NEXT_PUBLIC_DOC_TRACK_CN;
  const trackIo = process.env.NEXT_PUBLIC_DOC_TRACK_IO;
  
  // Determine site ID based on domain
  const domain = process.env.FASTGPT_HOME_DOMAIN || '';
  const siteId = domain.includes('fastgpt.cn') ? trackCn : trackIo;

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        {trackSrc && siteId && (
          <Script
            src={trackSrc}
            data-site-id={siteId}
            defer
            strategy="afterInteractive"
          />
        )}
        <RootProvider
          i18n={{
            locale: lang,
            locales,
            translations: {
              'zh-CN': zh_CN,
              en: {
                search: 'Search',
                nextPage: 'Next Page',
                previousPage: 'Previous Page',
                lastUpdate: 'Last Updated',
                editOnGithub: 'Edit on GitHub',
                searchNoResult: 'No results found',
                toc: 'On this page',
                tocNoHeadings: 'No headings',
                chooseLanguage: 'Choose Language'
              }
            }[lang]
          }}
          search={{
            enabled: true,
            SearchDialog: CustomSearchDialog
          }}
          theme={{
            enabled: true
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
