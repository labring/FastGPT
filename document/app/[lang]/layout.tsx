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

  const title = lang === 'zh-CN' ? 'FastGPT 文档 - 快速开始' : 'FastGPT Documentation - Getting Started';
  const description =
    lang === 'zh-CN'
      ? '学习如何使用 FastGPT 构建 AI 智能体。完整文档涵盖知识库、可视化工作流、RAG 系统和 API 集成。'
      : 'Learn how to build AI agents with FastGPT. Complete documentation covering knowledge base, visual workflow, RAG system, and API integration.';

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
      locale: lang === 'zh-CN' ? 'zh_CN' : 'en_US',
      url: domain,
      title: lang === 'zh-CN' ? 'FastGPT 快速开始' : 'Getting Started with FastGPT',
      description: lang === 'zh-CN' 
        ? 'FastGPT 是基于大语言模型的知识库问答系统，结合智能对话与可视化编排，让 AI 应用开发变得简单自然。'
        : 'FastGPT is a knowledge base Q&A system built on LLMs, combining intelligent conversation with visual orchestration to make AI application development simple and natural.',
      siteName: 'FastGPT Documentation',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: lang === 'zh-CN' ? 'FastGPT 文档' : 'FastGPT Documentation'
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: lang === 'zh-CN' ? 'FastGPT 快速开始' : 'Getting Started with FastGPT',
      description: lang === 'zh-CN'
        ? '学习如何使用 FastGPT 构建 AI 智能体。完整文档涵盖知识库、可视化工作流、RAG 系统和 API 集成。'
        : 'Learn how to build AI agents with FastGPT. Complete documentation covering knowledge base, visual workflow, RAG system, and API integration.',
      images: ['/og-image.png']
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
