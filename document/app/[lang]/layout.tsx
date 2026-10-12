import '@/app/global.css';
import type { ReactNode } from 'react';
import type { Translations } from 'fumadocs-ui/i18n';
import DocsRootProvider from '@/components/DocsRootProvider';
import Script from 'next/script';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFastGPTDocsOrigin } from '@/lib/fastgpt-home-url';
import { i18n } from '@/lib/i18n';
import { getDocSiteVariant, getOgLocale } from '@/lib/site';
import SiteAnalytics from '@/components/SiteAnalytics';

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
  lastUpdate: 'Last updated',
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

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}
export const dynamicParams = false;

// Search-engine verification meta, per domain variant. No-op when env is unset.
function getVerificationMetadata(): Pick<Metadata, 'verification'> {
  const variant = getDocSiteVariant();
  const google = variant === 'io' ? process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION_ID : undefined;
  const bing = variant === 'io' ? process.env.NEXT_PUBLIC_BING_VERIFICATION_ID : undefined;
  const baidu = variant === 'cn' ? process.env.NEXT_PUBLIC_BAIDU_VERIFICATION_ID : undefined;

  const other: Record<string, string> = {};
  if (bing) other['msvalidate.01'] = bing;
  if (baidu) other['baidu-site-verification'] = baidu;

  if (!google && Object.keys(other).length === 0) return {};
  return {
    verification: {
      ...(google ? { google } : {}),
      ...(Object.keys(other).length > 0 ? { other } : {})
    }
  };
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!i18n.languages.includes(lang)) notFound();

  const domain = getFastGPTDocsOrigin();

  const title =
    lang === 'zh-CN' ? 'FastGPT 文档 - 快速开始' : 'FastGPT Documentation - Getting Started';
  const description =
    lang === 'zh-CN'
      ? '学习如何使用 FastGPT 构建 AI 智能体。完整文档涵盖知识库、可视化工作流、RAG 系统和 API 集成。'
      : 'Learn how to build AI agents with FastGPT. Explore guides to Datasets, visual workflows, RAG systems, and API integrations.';

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
    openGraph: {
      type: 'website',
      locale: getOgLocale(lang),
      url: domain,
      title: lang === 'zh-CN' ? 'FastGPT 快速开始' : 'Getting Started with FastGPT',
      description:
        lang === 'zh-CN'
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
      description:
        lang === 'zh-CN'
          ? '学习如何使用 FastGPT 构建 AI 智能体。完整文档涵盖知识库、可视化工作流、RAG 系统和 API 集成。'
          : 'Learn how to build AI agents with FastGPT. Explore guides to Datasets, visual workflows, RAG systems, and API integrations.',
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
    manifest: '/favicon/site.webmanifest',
    ...getVerificationMetadata()
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
  if (!i18n.languages.includes(lang)) notFound();

  // Get tracking config from env (site ID is injected per-build by CI)
  const trackSrc = process.env.NEXT_PUBLIC_DOC_TRACK_SRC;
  const siteId = process.env.NEXT_PUBLIC_DOC_TRACK_SITE_ID;

  return (
    <html lang={lang} className="font-sans" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <SiteAnalytics />
        {trackSrc && siteId && (
          <Script src={trackSrc} data-site-id={siteId} defer strategy="afterInteractive" />
        )}
        <DocsRootProvider
          lang={lang}
          locales={locales}
          translations={
            {
              'zh-CN': zh_CN,
              en
            }[lang] ?? en
          }
        >
          {children}
        </DocsRootProvider>
      </body>
    </html>
  );
}
