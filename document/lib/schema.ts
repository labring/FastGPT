import type { BreadcrumbList, TechArticle, WithContext } from 'schema-dts';

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
        url: `${origin}/favicon/favicon.svg`
      }
    }
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
