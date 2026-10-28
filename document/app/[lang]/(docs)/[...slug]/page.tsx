import { source } from '@/lib/source';
import { getBreadcrumbItems, searchPath } from 'fumadocs-core/breadcrumb';
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';
import { i18n } from '@/lib/i18n';
import { generateArticleSchema, generateBreadcrumbSchema } from '@/lib/schema';
import { getFastGPTDocsOriginForLocale } from '@/lib/fastgpt-home-url';
import { CalendarDays } from 'lucide-react';
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

  // Use the physical locale file; the route path omits the language suffix.
  const filePath = `content/${page.data._file.path}`;
  const lastModifiedData = docLastModifiedData as Record<string, string>;
  const lastModified = lastModifiedData[filePath] ?? page.data.lastModified;

  const domain = getFastGPTDocsOriginForLocale(lang === 'en' ? 'en' : 'zh-CN');
  const url = `${domain}${page.url}`;

  const tree = source.pageTree[lang];
  const section = searchPath(tree.children, page.url)?.find(
    (node) => node.type === 'folder' && node.root
  );
  const breadcrumbItems = [
    { name: 'FastGPT', url: `${domain}/${lang}/guide/getting-started` },
    ...(section?.type === 'folder' && section.index && section.index.url !== page.url
      ? [{ name: String(section.name), url: `${domain}${section.index.url}` }]
      : []),
    ...getBreadcrumbItems(page.url, tree)
      .filter((item) => item.url && typeof item.name === 'string')
      .map((item) => ({ name: String(item.name), url: `${domain}${item.url}` }))
  ];

  // 生成结构化数据
  const articleSchema = generateArticleSchema({
    title: page.data.title,
    description: page.data.description || '',
    url,
    datePublished: releaseTime ? new Date(`${releaseTime}T00:00:00.000+08:00`) : undefined,
    dateModified: lastModified ? new Date(lastModified) : undefined,
    lang
  });

  const breadcrumbSchema = generateBreadcrumbSchema({
    items: breadcrumbItems
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        tableOfContent={{
          style: 'clerk'
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
          <DocsTitle>{page.data.title}</DocsTitle>
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
              a: createRelativeLink(source, page)
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

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await props.params;
  const page = source.getPage(slug, lang);
  if (!page?.data || page.data._file.path.endsWith('.en.mdx') !== (lang === 'en')) notFound();

  const domain = getFastGPTDocsOriginForLocale(lang === 'en' ? 'en' : 'zh-CN');
  const url = `${domain}${page.url}`;

  // 构建多语言 alternates
  const languages: Record<string, string> = {};
  i18n.languages.forEach((locale) => {
    const localePage = source.getPage(slug, locale);
    if (localePage && localePage.data._file.path.endsWith('.en.mdx') === (locale === 'en')) {
      languages[locale] = `${getFastGPTDocsOriginForLocale(locale === 'en' ? 'en' : 'zh-CN')}${localePage.url}`;
    }
  });

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: url,
      languages
    },
    openGraph: {
      title: `${page.data.title} | FastGPT`,
      description: page.data.description,
      url,
      siteName: 'FastGPT',
      locale: lang,
      type: 'article',
      publishedTime: page.data.releaseTime
        ? new Date(`${page.data.releaseTime}T00:00:00.000+08:00`).toISOString()
        : undefined
    }
  };
}
