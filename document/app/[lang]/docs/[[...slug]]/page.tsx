import { source } from '@/lib/source';
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import NotFound from '@/components/docs/not-found';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';
import { i18n } from '@/lib/i18n';

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

  // 使用构建时导入的静态数据
  const filePath = `document/content/docs/${page.file.path}`;
  // @ts-ignore
  const lastModified = docLastModifiedData[filePath] || page.data.lastModified;

  return (
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
        path: `document/content/docs/${page.file.path}`
      }}
      lastUpdate={lastModified ? new Date(lastModified) : undefined}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDXContent
          components={getMDXComponents({
            a: createRelativeLink(source, page)
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

// 由 CI/CD 传入: doc.fastgpt.cn 或 doc.fastgpt.io
const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_DOC_DOMAIN) {
    return `https://${process.env.NEXT_PUBLIC_DOC_DOMAIN}`;
  }
  return 'https://doc.fastgpt.io';
};

export async function generateMetadata(props: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await props.params;
  const page = source.getPage(slug, lang);
  if (!page || !page.data) notFound();

  const baseUrl = getBaseUrl();
  const slugPath = slug?.join('/') || '';
  const pageUrl = `${baseUrl}/${lang}/docs/${slugPath}`;
  const description = page.data.description || `FastGPT 文档 - ${page.data.title}`;

  // hreflang alternates：同一域名下的不同语言版本
  const languages: Record<string, string> = {};
  for (const l of i18n.languages) {
    languages[l] = `${baseUrl}/${l}/docs/${slugPath}`;
  }

  return {
    title: `${page.data.title} | FastGPT`,
    description,
    alternates: {
      canonical: pageUrl,
      languages
    },
    openGraph: {
      title: `${page.data.title} | FastGPT`,
      description,
      url: pageUrl,
      siteName: 'FastGPT Docs',
      locale: lang === 'zh-CN' ? 'zh_CN' : 'en_US',
      type: 'article'
    },
    twitter: {
      card: 'summary',
      title: `${page.data.title} | FastGPT`,
      description
    }
  };
}
