import { source } from '@/lib/source';
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import NotFound from '@/components/docs/not-found';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';
import fs from 'fs';
import path from 'path';

// 读取文档修改时间数据
function getDocLastModifiedData(): Record<string, string> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'doc-last-modified.json');

    if (!fs.existsSync(dataPath)) {
      return {};
    }

    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取文档修改时间数据失败:', error);
    return {};
  }
}

export default async function Page({
  params
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);

  // 如果页面不存在，调用 notFound()
  if (!page || !page.data || !page.file) {
    return <NotFound />;
  }

  const MDXContent = page.data.body;

  // 获取文档的最后修改时间
  const docLastModifiedData = getDocLastModifiedData();
  const filePath = `content/docs/${page.file.path}`;
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
