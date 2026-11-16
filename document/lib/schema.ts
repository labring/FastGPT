import type { BreadcrumbList, FAQPage, Graph, TechArticle, WithContext } from 'schema-dts';

/** Expand terse sidebar labels on workflow node and release pages into search-intent titles. */
export function resolvePageSeoTitle(params: {
  path: string;
  title: string;
  seoTitle?: string;
  lang: string;
}): string {
  const { path, title, seoTitle, lang } = params;
  if (seoTitle !== undefined && seoTitle.trim().length > 0) {
    return seoTitle.trim();
  }

  const cleanTitle = title.trim();
  const isZh = lang === 'zh-CN';

  if (
    path === 'guide/getting-started' ||
    path === 'guide/getting-started/index.mdx' ||
    path === 'guide/getting-started/index.en.mdx'
  ) {
    if (isZh && cleanTitle === '使用 FastGPT') {
      return 'FastGPT 官方文档 - AI Agent、知识库 RAG 与可视化工作流构建指南';
    }
    if (!isZh && cleanTitle === 'Use FastGPT') {
      return 'FastGPT Documentation - AI Agent, RAG Knowledge Base & Workflow Guide';
    }
  }

  if (path.startsWith('guide/build/workflow/nodes/')) {
    if (isZh) {
      return cleanTitle.includes('节点') ? cleanTitle : `${cleanTitle}工作流节点`;
    }
    return /\bnode\b/i.test(cleanTitle) ? cleanTitle : `${cleanTitle} Workflow Node`;
  }

  if (path.startsWith('self-host/upgrading/') && /^V\d/i.test(cleanTitle)) {
    return isZh ? `${cleanTitle} 更新说明与升级指南` : `${cleanTitle} Release Notes & Upgrade Guide`;
  }

  if (path.startsWith('self-host/deploy/')) {
    if (isZh) {
      return cleanTitle.includes('指南')
        ? cleanTitle
        : `${cleanTitle.replace(/部署$/, '')}私有化部署指南`;
    }
    return /self-host/i.test(cleanTitle) ? cleanTitle : `${cleanTitle} (Self-Hosted)`;
  }

  if (path.startsWith('openapi/') && !path.startsWith('openapi/legacy/')) {
    if (isZh) {
      return /api/i.test(cleanTitle) ? cleanTitle : `${cleanTitle} OpenAPI 参考`;
    }
    return /\bapi\b/i.test(cleanTitle) ? cleanTitle : `${cleanTitle} — OpenAPI Reference`;
  }

  return cleanTitle;
}

/** Build a TechArticle JSON-LD object with a host-aligned publisher logo URL. */
export function generateArticleSchema(params: {
  title: string;
  description: string;
  url: string;
  datePublished?: Date;
  dateModified?: Date;
  lang: string;
}): WithContext<TechArticle> {
  const { title, description, url, datePublished, dateModified, lang } = params;
  const origin = new URL(url).origin;
  const mainSiteOrigin = lang === 'zh-CN' ? 'https://fastgpt.cn' : 'https://fastgpt.io';
  const effectivePublished = datePublished ?? dateModified;

  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    url,
    image: `${origin}/og-image.png`,
    inLanguage: lang,
    datePublished: effectivePublished?.toISOString(),
    dateModified: dateModified?.toISOString(),
    author: {
      '@type': 'Organization',
      name: 'Labring',
      url: 'https://github.com/labring'
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${mainSiteOrigin}/#organization`,
      name: 'FastGPT',
      url: mainSiteOrigin,
      logo: {
        '@type': 'ImageObject',
        url: `${origin}/favicon/android-chrome-512x512.png`
      }
    }
  };
}

/** Build Organization and WebSite JSON-LD entities for the documentation home page. */
export function generateWebSiteSchema(params: { url: string; lang: string }): Graph {
  const { url, lang } = params;
  const parsedUrl = new URL(url);
  const origin = parsedUrl.origin;
  const isZh = lang === 'zh-CN';
  const mainSiteOrigin = isZh ? 'https://fastgpt.cn' : 'https://fastgpt.io';
  const websiteUrl = parsedUrl.pathname === '/' ? `${origin}/guide/getting-started` : url;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${mainSiteOrigin}/#organization`,
        name: 'FastGPT',
        url: mainSiteOrigin,
        logo: {
          '@type': 'ImageObject',
          url: `${origin}/favicon/android-chrome-512x512.png`
        },
        sameAs: ['https://github.com/labring/FastGPT', 'https://fastgpt.io', 'https://fastgpt.cn']
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: isZh ? 'FastGPT 文档' : 'FastGPT Documentation',
        url: websiteUrl,
        inLanguage: lang,
        publisher: {
          '@id': `${mainSiteOrigin}/#organization`
        }
      }
    ]
  };
}

/** Build a FAQPage JSON-LD object from Fumadocs structured headings and section contents. */
export function generateFaqSchema(params: {
  headings?: Array<{ id: string; content: string }>;
  contents?: Array<{ heading?: string; content: string }>;
  toc?: ReadonlyArray<{ url: string; depth: number }>;
}): WithContext<FAQPage> | null {
  const headings = params.headings ?? [];
  const contents = params.contents ?? [];
  const toc = params.toc ?? [];
  const categoryHeadingIds = new Set<string>();
  for (let i = 0; i < toc.length - 1; i++) {
    if (toc[i + 1].depth > toc[i].depth) {
      categoryHeadingIds.add(toc[i].url.replace(/^#/, ''));
    }
  }
  const nonQuestionHeadingPattern = /^(?:\d+\.\s+|下一步$|Next\s+steps?$)/i;
  const mainEntity = headings
    .map((heading) => {
      if (categoryHeadingIds.has(heading.id)) return null;
      const answerText = contents
        .filter((item) => item.heading === heading.id && item.content.trim().length > 0)
        .map((item) => item.content.trim())
        .join('\n\n');
      const name = heading.content.trim();
      if (!name || !answerText || nonQuestionHeadingPattern.test(name)) return null;
      return {
        '@type': 'Question' as const,
        name,
        acceptedAnswer: {
          '@type': 'Answer' as const,
          text: answerText
        }
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (mainEntity.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity
  };
}

export function generateBreadcrumbSchema(params: {
  items: Array<{ name: string; url: string }>;
}): WithContext<BreadcrumbList> {
  const { items } = params;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}
