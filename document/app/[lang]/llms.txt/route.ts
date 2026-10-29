import { source } from '@/lib/source';
import { getFastGPTDocsOriginForLocale } from '@/lib/fastgpt-home-url';
import { i18n } from '@/lib/i18n';

export const revalidate = false;

/** Export an llmstxt.org-compliant Markdown index of active documentation pages with canonical URLs. */
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang)) return new Response('Unknown language', { status: 404 });

  // 1. Filter active locale pages and exclude utility/deprecated/outdated upgrade notes.
  const isEn = lang === 'en';
  const domain = getFastGPTDocsOriginForLocale(isEn ? 'en' : 'zh-CN');
  const pages = source
    .getPages(lang)
    .filter(
      (page) =>
        page.data._file.path.endsWith('.en.mdx') === isEn &&
        !page.data.deprecated &&
        !/^toc(?:\.en)?\.mdx$/.test(page.data._file.path) &&
        !page.data._file.path.startsWith('self-host/upgrading/outdated/')
    )
    .sort((a, b) => a.url.localeCompare(b.url));

  // 2. Group pages into reader-facing sections with localized section titles.
  const sectionDefs = [
    {
      title: isEn ? 'Use FastGPT' : '使用 FastGPT',
      match: (pageUrl: string) => pageUrl.startsWith(`/${lang}/guide/`)
    },
    {
      title: isEn ? 'Developers & OpenAPI' : '开发者与 OpenAPI',
      match: (pageUrl: string) =>
        pageUrl.startsWith(`/${lang}/developers`) ||
        pageUrl.startsWith(`/${lang}/openapi/`) ||
        pageUrl.startsWith(`/${lang}/plugin/`)
    },
    {
      title: isEn ? 'Deploy and Operate' : '部署与运维',
      match: (pageUrl: string) =>
        pageUrl === `/${lang}/self-host` || pageUrl.startsWith(`/${lang}/self-host/`)
    },
    {
      title: isEn ? 'FAQ' : '常见问题',
      match: (pageUrl: string) => pageUrl.startsWith(`/${lang}/faq/`)
    }
  ];

  // 3. Render the llmstxt.org Markdown header and section lists.
  const header = isEn
    ? `# FastGPT Documentation\n\n> Official documentation for FastGPT: AI agent building, knowledge base RAG, visual workflow orchestration, System OpenAPI, plugins, and self-hosted operations.\n\n- [Full Documentation Corpus](${domain}/${lang}/llms-full.txt): Complete Markdown text of all active FastGPT documentation topics.`
    : `# FastGPT 文档\n\n> FastGPT 官方文档：涵盖 AI Agent 构建、知识库 RAG、可视化工作流编排、System OpenAPI、插件开发与私有化部署运维。\n\n- [完整文档语料库](${domain}/${lang}/llms-full.txt): 全部现行 FastGPT 文档页面的完整 Markdown 正文。`;

  const sections = sectionDefs
    .map((section) => {
      const items = pages
        .filter((page) => section.match(page.url))
        .map((page) => {
          const desc = page.data.description ? `: ${page.data.description}` : '';
          return `- [${page.data.title}](${domain}${page.url})${desc}`;
        });
      return items.length > 0 ? `## ${section.title}\n\n${items.join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  return new Response(`${header}\n\n${sections}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
