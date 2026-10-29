import type { BreadcrumbList, FAQPage, TechArticle, WithContext } from 'schema-dts';

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

  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    url,
    image: `${origin}/og-image.png`,
    inLanguage: lang,
    datePublished: datePublished?.toISOString(),
    dateModified: dateModified?.toISOString(),
    author: {
      '@type': 'Organization',
      name: 'Labring',
      url: 'https://github.com/labring'
    },
    publisher: {
      '@type': 'Organization',
      name: 'FastGPT',
      logo: {
        '@type': 'ImageObject',
        url: `${origin}/favicon/android-chrome-512x512.png`
      }
    }
  };
}

/** Build a FAQPage JSON-LD object from Fumadocs structured headings and section contents. */
export function generateFaqSchema(params: {
  headings?: Array<{ id: string; content: string }>;
  contents?: Array<{ heading?: string; content: string }>;
}): WithContext<FAQPage> | null {
  const headings = params.headings ?? [];
  const contents = params.contents ?? [];
  const nonQuestionHeadingPattern = /^(?:\d+\.\s+|下一步$|Next\s+steps?$)/i;
  const mainEntity = headings
    .map((heading) => {
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
