import { source } from '@/lib/source';
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import NotFound from '@/components/docs/not-found';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';
import { i18n } from '@/lib/i18n';
import { generateArticleSchema, generateBreadcrumbSchema } from '@/lib/schema';
import { getFastGPTDocsOrigin } from '@/lib/fastgpt-home-url';
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
  let page = source.getPage(slug, lang);

  // If page not found in current language, fallback to default language
  // This allows showing Chinese content when English translation is not available
  // while keeping the URL unchanged (e.g., /en/docs/faq shows Chinese content)
  if (!page || !page.data || !page.file) {
    page = source.getPage(slug, i18n.defaultLanguage);
  }

  // If still not found in default language, show 404
  if (!page || !page.data || !page.file) {
    return <NotFound />;
  }

  const MDXContent = page.data.body;
  const releaseTime = page.data.releaseTime;
  const isUpgradeTimeline = page.path.includes('self-host/upgrading/version-timeline');
  const upgradeVersionTimeline: UpgradeVersionTimelineItem[] = isUpgradeTimeline
    ? source
        .getPages(lang)
        .filter(
          (item) =>
            item.path.startsWith('self-host/upgrading/') &&
            !item.path.includes('upgrade-intruction') &&
            /^V\d/.test(item.data.title)
        )
        .map((item) => ({
          title: item.data.title,
          url: item.url,
          releaseTime: item.data.releaseTime,
          upgradeTags: item.data.upgradeTags ?? []
        }))
    : [];

  // 使用构建时导入的静态数据
  const filePath = `content/${page.file.path}`;
  const lastModifiedData = docLastModifiedData as Record<string, string>;
  const lastModified = lastModifiedData[filePath] ?? page.data.lastModified;

  const domain = getFastGPTDocsOrigin();
  const url = `${domain}${page.url}`;

  // 生成面包屑导航
  const breadcrumbItems = [
    { name: 'FastGPT', url: domain },
    { name: 'Docs', url: `${domain}/${lang}` }
  ];
  if (slug && slug.length > 0) {
    slug.forEach((segment, index) => {
      const segmentUrl = `${domain}/${lang}/${slug.slice(0, index + 1).join('/')}`;
      breadcrumbItems.push({ name: segment, url: segmentUrl });
    });
  }

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
          path: `document/content/${page.file.path}`
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
  if (!page || !page.data) notFound();

  const domain = getFastGPTDocsOrigin();
  const url = `${domain}${page.url}`;

  // 构建多语言 alternates
  const languages: Record<string, string> = {};
  i18n.languages.forEach((locale) => {
    const localePage = source.getPage(slug, locale);
    if (localePage) {
      languages[locale] = `${domain}/${locale}/${slug?.join('/') || ''}`;
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
