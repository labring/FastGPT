import { source } from '@/lib/source';
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import NotFound from '@/components/docs/not-found';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';

// 在构建时导入静态数据
import docLastModifiedData from '@/data/doc-last-modified.json';

export default async function Page({
  params
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);

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

export async function generateMetadata(props: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await props.params;
  const page = source.getPage(slug, lang);
  if (!page || !page.data) notFound();

  return {
    title: `${page.data.title} | FastGPT`,
    description: page.data.description
  };
}
