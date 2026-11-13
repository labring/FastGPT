import * as fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkStringify from 'remark-stringify';
import { remarkInclude } from 'fumadocs-mdx/config';
import { source } from '@/lib/source';
import {
  getFastGPTDocsOriginForLocale,
  getProductionDocsUrl,
  stripDocsLocalePrefix,
  type FastGPTDocsLocale
} from '@/lib/fastgpt-home-url';
import { getApiReferenceNotice } from '@/lib/api-reference-notice';

type AstAttribute = {
  type?: string;
  name?: string;
  value?: unknown;
};

type AstNode = {
  type: string;
  name?: string | null;
  value?: string;
  lang?: string;
  depth?: number;
  url?: string;
  spread?: boolean;
  attributes?: AstAttribute[];
  children?: AstNode[];
};

const includeMdxFiles = remarkInclude as unknown as typeof remarkMdx;
const CONTENT_ROOT = path.resolve(process.cwd(), 'content');
const STATIC_MARKDOWN_PREFIXES = ['/examples/', '/deploy/', '/imgs/', '/favicon/'];

export type LlmsBundleKey = 'guide' | 'openapi' | 'self-host';

function normalizeExportedMarkdownHref(href: string): string {
  if (!href.startsWith('/')) {
    return href;
  }
  if (STATIC_MARKDOWN_PREFIXES.some((prefix) => href.startsWith(prefix))) {
    return href;
  }
  return stripDocsLocalePrefix(href).path;
}

function matchesLlmsBundle(relSlug: string, bundle?: LlmsBundleKey): boolean {
  if (!bundle) return true;
  if (bundle === 'guide') {
    return relSlug.startsWith('/guide/') || relSlug.startsWith('/faq/');
  }
  if (bundle === 'openapi') {
    return (
      relSlug === '/developers' ||
      relSlug.startsWith('/developers/') ||
      relSlug.startsWith('/openapi/') ||
      relSlug.startsWith('/plugin/')
    );
  }
  return (
    relSlug === '/self-host' ||
    (relSlug.startsWith('/self-host/') && !relSlug.startsWith('/self-host/upgrading/'))
  );
}

function getAttrString(node: AstNode, attrName: string): string | undefined {
  const attr = node.attributes?.find((item) => item.name === attrName);
  return typeof attr?.value === 'string' ? attr.value : undefined;
}

function extractInlineText(nodes: AstNode[] = []): string {
  return nodes
    .map((child) => {
      if (child.type === 'text' || child.type === 'inlineCode') return child.value ?? '';
      if (child.children) return extractInlineText(child.children);
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureBlockChildren(nodes: AstNode[]): AstNode[] {
  const blockTypes = new Set([
    'paragraph',
    'heading',
    'list',
    'blockquote',
    'code',
    'table',
    'thematicBreak'
  ]);
  const out: AstNode[] = [];
  let inlineBuffer: AstNode[] = [];

  const flushInline = () => {
    if (inlineBuffer.length === 0) return;
    const text = extractInlineText(inlineBuffer);
    if (text.length > 0) {
      out.push({ type: 'paragraph', children: inlineBuffer });
    }
    inlineBuffer = [];
  };

  for (const child of nodes) {
    if (blockTypes.has(child.type)) {
      flushInline();
      out.push(child);
    } else {
      inlineBuffer.push(child);
    }
  }
  flushInline();
  return out;
}

/** Strip MDX imports/comments and convert custom JSX documentation components into pure GFM nodes. */
function remarkCleanLlmsMdx() {
  const transformNodes = (nodes: AstNode[], inFlow: boolean): AstNode[] =>
    nodes.flatMap<AstNode>((node) => {
      if (node.type === 'mdxjsEsm') return [];

      if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
        const raw = (node.value ?? '').trim();
        if (raw.startsWith('/*')) return [];
        const stringMatch = raw.match(/^(['"])([\s\S]*)\1$/);
        if (stringMatch) {
          const textNode: AstNode = { type: 'text', value: stringMatch[2] };
          return inFlow ? [{ type: 'paragraph', children: [textNode] }] : [textNode];
        }
        return [];
      }

      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        const tagName = node.name ?? '';
        const childInFlow = node.type === 'mdxJsxFlowElement';
        const children = transformNodes(node.children ?? [], childInFlow);

        if (tagName === 'CurrentOriginCodeBlockUpdater') return [];
        if (tagName === 'span' && children.length === 0) return [];

        if (tagName === 'MermaidDiagram') {
          const chart = getAttrString(node, 'chart')?.trim();
          return chart ? [{ type: 'code', lang: 'mermaid', value: chart }] : [];
        }

        if (tagName === 'CommercialContactDialog') {
          const label = getAttrString(node, 'label') ?? 'Contact FastGPT';
          const url = getAttrString(node, 'url') ?? 'https://fastgpt.io';
          const linkNode: AstNode = {
            type: 'link',
            url,
            children: [{ type: 'text', value: label }]
          };
          return childInFlow ? [{ type: 'paragraph', children: [linkNode] }] : [linkNode];
        }

        if (tagName === 'Alert') {
          const blockChildren = ensureBlockChildren(children);
          return blockChildren.length > 0 ? [{ type: 'blockquote', children: blockChildren }] : [];
        }

        if (tagName === 'ApiReferenceNotice') {
          const notice = getApiReferenceNotice(getAttrString(node, 'language'));
          const markdown = [
            `**${notice.title}**${notice.separator}${notice.description}`,
            '',
            ...notice.links.map(({ label, url }) => `- ${label}${notice.separator}[System OpenAPI](${url})`),
            `- ${notice.selfHosted}${notice.separator}\`${notice.selfHostedPath}\``
          ].join('\n');
          const content = remark().use(remarkGfm).parse(markdown);
          return [{ type: 'blockquote', children: content.children as AstNode[] }];
        }

        if (tagName === 'Tab' || tagName === 'Accordion') {
          const label = getAttrString(node, 'value') ?? getAttrString(node, 'title');
          const heading: AstNode[] = label
            ? [{ type: 'heading', depth: 4, children: [{ type: 'text', value: label }] }]
            : [];
          return [...heading, ...ensureBlockChildren(children)];
        }

        if (tagName === 'Card') {
          const title = getAttrString(node, 'title') ?? 'Guide';
          const href = getAttrString(node, 'href');
          const normalizedHref = href !== undefined ? normalizeExportedMarkdownHref(href) : undefined;
          const summary = extractInlineText(children);
          const head: AstNode = normalizedHref
            ? { type: 'link', url: normalizedHref, children: [{ type: 'text', value: title }] }
            : { type: 'text', value: title };
          const inlineParts: AstNode[] = summary
            ? [head, { type: 'text', value: `: ${summary}` }]
            : [head];
          return [
            {
              type: 'list',
              spread: false,
              children: [{ type: 'listItem', spread: false, children: [{ type: 'paragraph', children: inlineParts }] }]
            }
          ];
        }

        if (tagName === 'summary') {
          const summaryText = extractInlineText(children);
          return summaryText
            ? [{ type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: summaryText }] }] }]
            : [];
        }

        return childInFlow && inFlow ? ensureBlockChildren(children) : children;
      }

      if (node.children) {
        const nextChildren = transformNodes(
          node.children,
          node.type === 'root' || node.type === 'blockquote' || node.type === 'listItem'
        );
        const nextUrl =
          node.type === 'link' && typeof node.url === 'string'
            ? normalizeExportedMarkdownHref(node.url)
            : node.url;
        return [{ ...node, url: nextUrl, children: nextChildren }];
      }

      return [node];
    });

  return (tree: AstNode) => {
    tree.children = transformNodes(tree.children ?? [], true);
  };
}

const cleanProcessor = remark()
  .use(remarkMdx)
  .use(includeMdxFiles)
  .use(remarkGfm)
  .use(remarkCleanLlmsMdx)
  .use(remarkStringify);

/** Convert raw MDX body content into clean GFM Markdown without imports or raw JSX wrappers. */
export async function renderCleanMdxBody(filePath: string, content: string): Promise<string> {
  const processed = await cleanProcessor.process({
    path: filePath,
    value: content
  });
  return String(processed).trim();
}

/** Build the llmstxt.org Markdown directory for the given language. */
export function buildLlmsIndexText(lang: FastGPTDocsLocale): string {
  const isEn = lang === 'en';
  const domain = getFastGPTDocsOriginForLocale(lang);
  const pages = source
    .getPages(lang)
    .filter(
      (page) =>
        page.data._file.path.endsWith('.en.mdx') === isEn &&
        !page.data.deprecated &&
        !/^toc(?:\.en)?\.mdx$/.test(page.data._file.path) &&
        !page.data._file.path.startsWith('self-host/upgrading/outdated/')
    )
    .sort((a, b) =>
      stripDocsLocalePrefix(a.url).pathname.localeCompare(stripDocsLocalePrefix(b.url).pathname)
    );

  const sectionDefs = [
    {
      title: isEn ? 'Use FastGPT' : '使用 FastGPT',
      match: (routePath: string) => routePath.startsWith('/guide/')
    },
    {
      title: isEn ? 'Developers & OpenAPI' : '开发者与 OpenAPI',
      match: (routePath: string) =>
        routePath === '/developers' ||
        routePath.startsWith('/developers/') ||
        routePath.startsWith('/openapi/') ||
        routePath.startsWith('/plugin/')
    },
    {
      title: isEn ? 'Deploy and Operate' : '部署与运维',
      match: (routePath: string) =>
        routePath === '/self-host' ||
        (routePath.startsWith('/self-host/') && !routePath.startsWith('/self-host/upgrading/'))
    },
    {
      title: isEn ? 'Versions & Upgrades' : '版本与升级',
      match: (routePath: string) => routePath.startsWith('/self-host/upgrading/')
    },
    {
      title: isEn ? 'FAQ' : '常见问题',
      match: (routePath: string) => routePath.startsWith('/faq/')
    }
  ];

  const header = isEn
    ? `# FastGPT Documentation\n\n> Official documentation for FastGPT: AI agent building, knowledge base RAG, visual workflow orchestration, System OpenAPI, plugins, and self-hosted operations. Append \`.md\` to any canonical page URL (for example \`${domain}/openapi/intro.md\`) to fetch standalone Markdown.\n\n- [Full Documentation Corpus](${domain}/llms-full.txt): Complete Markdown text of all active FastGPT documentation topics.\n- [Product & RAG Guides Corpus](${domain}/llms-guide.txt): Focused corpus covering Agent building, workflows, datasets, and FAQs.\n- [Developers & OpenAPI Corpus](${domain}/llms-openapi.txt): Focused corpus covering System OpenAPI, authentication, and plugin development.\n- [Self-Hosted Operations Corpus](${domain}/llms-self-host.txt): Focused corpus covering Docker/Sealos deployment, model configuration, migrations, and troubleshooting.\n- [Pricing & Editions](${domain}/pricing.md): Structured comparison of Community, Cloud, and Commercial editions and resource pricing.`
    : `# FastGPT 文档\n\n> FastGPT 官方文档：涵盖 AI Agent 构建、知识库 RAG、可视化工作流编排、System OpenAPI、插件开发与私有化部署运维。在任意规范文档 URL 后追加 \`.md\`（例如 \`${domain}/openapi/intro.md\`）可直接拉取单页纯净 Markdown。\n\n- [完整文档语料库](${domain}/llms-full.txt): 全部现行 FastGPT 文档页面的完整 Markdown 正文。\n- [产品与知识库语料分卷](${domain}/llms-guide.txt): 聚焦应用构建、工作流、知识库 RAG 与常见问题的精简语料。\n- [开发者与 OpenAPI 语料分卷](${domain}/llms-openapi.txt): 聚焦 System OpenAPI、鉴权代理与插件开发的接口语料。\n- [私有化部署与运维语料分卷](${domain}/llms-self-host.txt): 聚焦 Docker/Sealos 部署、模型配置、数据迁移与排障的运维语料。\n- [版本与定价清单](${domain}/pricing.md): 社区版、云服务版与商业版功能边界及资源计费标准。`;

  const sections = sectionDefs
    .map((section) => {
      const items = pages
        .filter((page) => section.match(stripDocsLocalePrefix(page.url).pathname))
        .map((page) => {
          const desc = page.data.description ? `: ${page.data.description}` : '';
          const canonicalUrl = getProductionDocsUrl(lang, page.url);
          return `- [${page.data.title}](${canonicalUrl})${desc}`;
        });
      return items.length > 0 ? `## ${section.title}\n\n${items.join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  return `${header}\n\n${sections}\n`;
}

/** Build the clean Markdown corpus for all active topics or a focused section bundle in the given language. */
export async function buildLlmsFullText(
  lang: FastGPTDocsLocale,
  bundle?: LlmsBundleKey
): Promise<string> {
  const isEn = lang === 'en';
  const fileToRelSlug = (file: string): string =>
    file
      .replace(/^\.\/content/, '')
      .replace(/(?:\.en)?\.mdx$/, '')
      .replace(/\/index$/, '');
  const fileToCanonicalUrl = (file: string): string =>
    getProductionDocsUrl(lang, fileToRelSlug(file));

  const files = (await fg('./content/**/*.mdx'))
    .filter(
      (file) =>
        file.endsWith('.en.mdx') === isEn &&
        !/\/toc(?:\.en)?\.mdx$/.test(file) &&
        !file.startsWith('./content/self-host/upgrading/outdated/') &&
        matchesLlmsBundle(fileToRelSlug(file), bundle)
    )
    .sort();

  const scanned = (
    await Promise.all(
      files.map(async (file: string) => {
        const fileContent = await fs.readFile(file, 'utf8');
        const { content, data } = matter(fileContent);
        if (data.deprecated || data.draft) return null;

        const body = await renderCleanMdxBody(file, content);
        return `file: ${file}
url: ${fileToCanonicalUrl(file)}
title: ${String(data.title ?? '')}
meta: ${JSON.stringify(data, null, 2)}

${body}`;
      })
    )
  ).filter((entry): entry is string => entry !== null);

  return scanned.join('\n\n');
}

/** Resolve the canonical HTML URL corresponding to a single-page Markdown slug. */
export function getSingleDocCanonicalUrl(lang: FastGPTDocsLocale, slugParts: string[]): string {
  const normalizedSlug = slugParts.join('/').replace(/\/index$/, '');
  return getProductionDocsUrl(lang, `/${normalizedSlug}`);
}

/** Render a single published documentation topic as standalone clean Markdown. */
export async function buildSingleDocMarkdown(params: {
  lang: FastGPTDocsLocale;
  slugParts: string[];
}): Promise<string | null> {
  const { lang, slugParts } = params;
  if (
    slugParts.length === 0 ||
    slugParts.some((part) => part.length === 0 || part === '.' || part === '..' || part.includes('\\'))
  ) {
    return null;
  }

  const relSlug = slugParts.join('/');
  if (/^toc$/i.test(relSlug)) return null;

  const ext = lang === 'en' ? '.en.mdx' : '.mdx';
  const candidates = [
    path.resolve(CONTENT_ROOT, `${relSlug}${ext}`),
    path.resolve(CONTENT_ROOT, relSlug, `index${ext}`)
  ];

  let resolvedFile: string | null = null;
  for (const candidate of candidates) {
    if (!candidate.startsWith(`${CONTENT_ROOT}${path.sep}`)) continue;
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        resolvedFile = candidate;
        break;
      }
    } catch {
      // Try next candidate.
    }
  }
  if (resolvedFile === null) return null;

  const raw = await fs.readFile(resolvedFile, 'utf8');
  const { data, content } = matter(raw);
  if (data.draft === true) return null;

  const canonicalUrl = getSingleDocCanonicalUrl(lang, slugParts);
  const relativeForRemark = `./${path.relative(process.cwd(), resolvedFile).split(path.sep).join('/')}`;
  const body = await renderCleanMdxBody(relativeForRemark, content);
  const descriptionBlock =
    typeof data.description === 'string' && data.description.trim().length > 0
      ? `\n\n> ${data.description.trim()}`
      : '';

  return `# ${String(data.title ?? '')}${descriptionBlock}\n\nSource: ${canonicalUrl}\n\n${body}\n`;
}
