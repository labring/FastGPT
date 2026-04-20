import type { Article, BreadcrumbList, WithContext } from 'schema-dts';

export function generateArticleSchema(params: {
  title: string;
  description: string;
  url: string;
  dateModified?: Date;
  lang: string;
}): WithContext<Article> {
  const { title, description, url, dateModified, lang } = params;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    inLanguage: lang,
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
        url: 'https://doc.fastgpt.io/logo.svg'
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
