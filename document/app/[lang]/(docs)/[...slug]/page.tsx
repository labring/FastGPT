import { hasPublishedLocalePage, source } from '@/lib/source';
import { searchPath } from 'fumadocs-core/breadcrumb';
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from 'fumadocs-ui/page';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';
import { defaultHomePath, getLocalizedPath } from '@/lib/i18n';
import {
  generateArticleSchema,
  generateBreadcrumbSchema,
  generateFaqSchema,
  generateWebSiteSchema,
  resolvePageSeoTitle
} from '@/lib/schema';
import {
  getFastGPTDocsOriginForLocale,
  getPublishedDocsLocales,
  isPreviewDocsSite,
  stripDocsLocalePrefix,
  type FastGPTDocsLocale
} from '@/lib/fastgpt-home-url';
import { CalendarDays } from 'lucide-react';
import { LocalizedLink } from '@/components/docs/LocalizedLink';
import DocsTocCta from '@/components/docs/DocsTocCta';
import {
  UpgradeVersionTimeline,
  type UpgradeVersionTimelineItem
} from '@/components/docs/UpgradeVersionTimeline';

// 在构建时导入静态数据
import docLastModifiedData from '@/data/doc-last-modified.json';

export default async function Page({
  params
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  // 1. 解析目标文档页与版本升级时间线数据；source.getPage 按环境过滤草稿，此处同时校验物理语言文件后缀一致。
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);
  if (!page?.data || page.data._file.path.endsWith('.en.mdx') !== (lang === 'en')) notFound();

  const MDXContent = page.data.body;
  const releaseTime = page.data.releaseTime;
  const isUpgradeTimeline = page.path.includes('self-host/upgrading/version-timeline');
  const upgradeVersionTimeline: UpgradeVersionTimelineItem[] = isUpgradeTimeline
    ? source
        .getPages(lang)
        .filter(
          (item) =>
            item.path.startsWith('self-host/upgrading/') &&
            !item.path.includes('upgrade-instruction') &&
            /^V\d/.test(item.data.title)
        )
        .map((item) => ({
          title: item.data.title,
          url: item.url,
          releaseTime: item.data.releaseTime,
          upgradeTags: item.data.upgradeTags ?? []
        }))
    : [];

  // 2. Resolve file modification timestamp and canonical host-aligned URLs for the active variant.
  const filePath = `content/${page.data._file.path}`;
  const lastModifiedData = docLastModifiedData as Record<string, string>;
  const lastModified = lastModifiedData[filePath] ?? page.data.lastModified;

  const locale: FastGPTDocsLocale = lang === 'en' ? 'en' : 'zh-CN';
  const domain = getFastGPTDocsOriginForLocale(locale);
  const routePath = stripDocsLocalePrefix(page.url).pathname;
  const isPreview = isPreviewDocsSite();
  const pagePath = isPreview ? getLocalizedPath(routePath, locale) : routePath;
  const url = `${domain}${pagePath}`;
  const homePath = getLocalizedPath(defaultHomePath, locale);
  const homeUrl = `${domain}${homePath}`;

  // 3. Derive and deduplicate breadcrumb items while falling back to the first child page for indexless folders.
  const tree = source.pageTree[lang];
  const section = searchPath(tree.children, page.url)?.find(
    (node) => node.type === 'folder' && node.root
  );
  const findFirstPageUrl = (node: (typeof tree.children)[number]): string | undefined => {
    if (node.type === 'page') return node.url;
    if (node.type === 'folder') {
      if (node.index?.url) return node.index.url;
      for (const child of node.children) {
        const found = findFirstPageUrl(child);
        if (found) return found;
      }
    }
    return undefined;
  };
  const sectionEntryUrl = section ? findFirstPageUrl(section) : undefined;
  const rawBreadcrumbs = [
    section?.type === 'folder' && page.url !== homePath
      ? {
          name: String(section.name),
          url: `${domain}${sectionEntryUrl ?? homePath}`
        }
      : { name: 'FastGPT', url: homeUrl },
    ...(searchPath(tree.children, page.url) ?? []).flatMap((node) => {
      const resolvedUrl = findFirstPageUrl(node);
      return resolvedUrl && typeof node.name === 'string'
        ? [{ name: String(node.name), url: `${domain}${resolvedUrl}` }]
        : [];
    })
  ];
  const breadcrumbByUrl = new Map<string, { name: string; url: string }>();
  for (const item of rawBreadcrumbs) {
    if (item.url === homeUrl && breadcrumbByUrl.has(item.url)) {
      continue;
    }
    breadcrumbByUrl.set(item.url, item);
  }
  const breadcrumbItems = [...breadcrumbByUrl.values()];

  // 4. Build JSON-LD structured data and gate output to indexable production pages.
  const shouldNoIndex =
    Boolean(page.data.deprecated) || /^toc(?:\.en)?\.mdx$/.test(page.data._file.path);
  const isDocsHome = routePath === defaultHomePath;
  const seoTitle = resolvePageSeoTitle({
    path: page.path,
    title: page.data.title,
    seoTitle: page.data.seoTitle,
    lang
  });
  const publishedDate = releaseTime
    ? new Date(`${releaseTime}T00:00:00.000+08:00`)
    : lastModified
      ? new Date(lastModified)
      : undefined;

  const articleSchema = generateArticleSchema({
    title: seoTitle,
    description: page.data.description ?? '',
    url,
    datePublished: publishedDate,
    dateModified: lastModified ? new Date(lastModified) : undefined,
    lang
  });

  const breadcrumbSchema = generateBreadcrumbSchema({
    items: breadcrumbItems
  });
  const isFaqPage =
    /(?:^|\/)faq(?:\.en)?\.mdx$/.test(page.data._file.path) ||
    page.data._file.path.startsWith('faq/');
  const faqSchema = isFaqPage
    ? generateFaqSchema({ ...page.data.structuredData, toc: page.data.toc })
    : null;

  return (
    <>
      {!shouldNoIndex && !isPreview && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
          />
          {faqSchema !== null && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
            />
          )}
          {isDocsHome && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify(generateWebSiteSchema({ url: homeUrl, lang }))
              }}
            />
          )}
        </>
      )}
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        tableOfContent={{
          style: 'clerk',
          footer: <DocsTocCta lang={lang} />
        }}
        editOnGithub={{
          owner: 'labring',
          repo: 'FastGPT',
          sha: 'main',
          path: `document/content/${page.data._file.path}`
        }}
        lastUpdate={lastModified ? new Date(lastModified) : undefined}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <DocsTitle>{page.data.title}</DocsTitle>
            {page.data.draft && (
              <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                {lang === 'en' ? 'Draft' : '草稿'}
              </span>
            )}
          </div>
          {releaseTime && (
            <div className="mt-2 flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-fd-muted-foreground">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              <time dateTime={releaseTime}>{releaseTime}</time>
            </div>
          )}
        </div>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDXContent
            components={getMDXComponents({
              a: createRelativeLink(source, page, LocalizedLink)
            })}
          />
          {isUpgradeTimeline && (
            <UpgradeVersionTimeline items={upgradeVersionTimeline} language={lang} />
          )}
        </DocsBody>
      </DocsPage>
    </>
  );
}

/** Generate static route params filtered to locales published by the active site variant. */
export async function generateStaticParams() {
  const published = new Set<string>(getPublishedDocsLocales());
  return source
    .generateParams()
    .filter((item) => item.lang === undefined || published.has(item.lang));
}

/** Build page-level SEO metadata with canonical URLs, cross-domain hreflang alternates, and brand title deduplication. */
export async function generateMetadata(props: {
  params: Promise<{ lang: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { lang, slug } = await props.params;
  const page = source.getPage(slug, lang);
  if (!page?.data || page.data._file.path.endsWith('.en.mdx') !== (lang === 'en')) notFound();

  const locale: FastGPTDocsLocale = lang === 'en' ? 'en' : 'zh-CN';
  const domain = getFastGPTDocsOriginForLocale(locale);
  const routePath = stripDocsLocalePrefix(page.url).pathname;
  const isPreview = isPreviewDocsSite();
  const pagePath = isPreview ? getLocalizedPath(routePath, locale) : routePath;
  const url = `${domain}${pagePath}`;
  const filePath = `content/${page.data._file.path}`;
  const lastModified =
    (docLastModifiedData as Record<string, string>)[filePath] ?? page.data.lastModified;

  const shouldNoIndex =
    Boolean(page.data.deprecated) || /^toc(?:\.en)?\.mdx$/.test(page.data._file.path);

  const languages: Record<string, string> = {};
  if (!isPreview && !shouldNoIndex) {
    for (const targetLocale of ['zh-CN', 'en'] as const) {
      if (hasPublishedLocalePage({ slugs: slug, locale: targetLocale })) {
        languages[targetLocale] = `${getFastGPTDocsOriginForLocale(targetLocale)}${routePath}`;
      }
    }
    if (languages.en !== undefined) {
      languages['x-default'] = languages.en;
    }
  }

  const robots = (() => {
    if (isPreview) {
      return { index: false, follow: false };
    }
    if (shouldNoIndex) {
      return { index: false, follow: true };
    }
    return undefined;
  })();

  const seoTitle = resolvePageSeoTitle({
    path: page.path,
    title: page.data.title,
    seoTitle: page.data.seoTitle,
    lang
  });
  const hasBrandInTitle = /fastgpt/i.test(seoTitle);
  const socialTitle = hasBrandInTitle ? seoTitle : `${seoTitle} | FastGPT`;

  return {
    title: hasBrandInTitle ? { absolute: seoTitle } : seoTitle,
    description: page.data.description,
    ...(robots !== undefined ? { robots } : {}),
    alternates:
      isPreview || shouldNoIndex
        ? {
            canonical: url
          }
        : {
            canonical: url,
            languages,
            types: {
              'text/markdown': `${url}.md`
            }
          },
    openGraph: {
      title: socialTitle,
      description: page.data.description,
      url,
      siteName: 'FastGPT',
      locale: lang === 'zh-CN' ? 'zh_CN' : 'en_US',
      type: 'article',
      publishedTime: page.data.releaseTime
        ? new Date(`${page.data.releaseTime}T00:00:00.000+08:00`).toISOString()
        : lastModified
          ? new Date(lastModified).toISOString()
          : undefined,
      modifiedTime: lastModified ? new Date(lastModified).toISOString() : undefined,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: page.data.title
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: page.data.description,
      images: ['/og-image.png']
    }
  };
}
