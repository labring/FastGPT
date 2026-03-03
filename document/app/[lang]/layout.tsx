import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Translations } from 'fumadocs-ui/i18n';
import CustomSearchDialog from '@/components/CustomSearchDialog';
import Script from 'next/script';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin']
});

const zh_CN: Partial<Translations> = {
  search: '搜索',
  nextPage: '下一页',
  previousPage: '上一页',
  lastUpdate: '文件更新时间',
  editOnGithub: '在 GitHub 上编辑',
  searchNoResult: '没有找到相关内容',
  toc: '本页导航',
  tocNoHeadings: '本页没有导航',
  chooseLanguage: '选择语言'
};
const en: Partial<Translations> = {
  search: 'Search',
  nextPage: 'Next Page',
  previousPage: 'Previous Page',
  lastUpdate: 'File Updated',
  editOnGithub: 'Edit on GitHub',
  searchNoResult: 'No results found',
  toc: 'On this page',
  tocNoHeadings: 'No headings',
  chooseLanguage: 'Choose Language'
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

export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const homeDomain = process.env.FASTGPT_HOME_DOMAIN ?? 'https://fastgpt.io';
  const domain = homeDomain.replace('https://', 'https://doc.');

  const title = lang === 'zh-CN' ? 'FastGPT 文档' : 'FastGPT Documentation';
  const description =
    lang === 'zh-CN'
      ? 'FastGPT 是一个 AI Agent 构建平台，通过 Flow 提供开箱即用的数据处理、模型调用能力和可视化工作流编排。'
      : 'FastGPT is an AI Agent building platform that provides out-of-the-box data processing, model invocation capabilities, and visual workflow orchestration through Flow.';

  return {
    title: {
      default: title,
      template: `%s | FastGPT`
    },
    description,
    keywords: ['FastGPT', 'AI', 'Agent', 'LLM', 'RAG', 'Workflow', 'Documentation'],
    authors: [{ name: 'Labring', url: 'https://github.com/labring' }],
    creator: 'Labring',
    publisher: 'Labring',
    metadataBase: new URL(domain),
    alternates: {
      canonical: '/',
      languages: {
        en: '/en',
        'zh-CN': '/zh-CN'
      }
    },
    openGraph: {
      type: 'website',
      locale: lang,
      url: domain,
      title,
      description,
      siteName: 'FastGPT',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'FastGPT'
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/twitter-image.png']
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1
      }
    },
    icons: {
      icon: [
        { url: '/favicon/favicon.ico' },
        { url: '/favicon/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' }
      ],
      apple: [{ url: '/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
    },
    manifest: '/favicon/site.webmanifest'
  };
}

export default async function Layout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  // Get tracking config from env (site ID is injected per-build by CI)
  const trackSrc = process.env.NEXT_PUBLIC_DOC_TRACK_SRC;
  const siteId = process.env.NEXT_PUBLIC_DOC_TRACK_SITE_ID;

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        {trackSrc && siteId && (
          <Script src={trackSrc} data-site-id={siteId} defer strategy="afterInteractive" />
        )}
        <RootProvider
          i18n={{
            locale: lang,
            locales,
            translations: {
              'zh-CN': zh_CN,
              en
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
