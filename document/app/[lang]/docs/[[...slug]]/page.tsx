import { source } from '@/lib/source';
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';
import { fetchLastModified } from '@/lib/github';

export default async function Page({
  params
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);
  if (!page || !page.data || !page.file) notFound();

  const MDXContent = page.data.body;
  const lastModified = await fetchLastModified(`content/docs/${page.file.path}`);

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
