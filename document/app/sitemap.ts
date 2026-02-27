import { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { i18n } from '@/lib/i18n';

// 由 CI/CD 构建参数传入: doc.fastgpt.cn 或 doc.fastgpt.io
const baseUrl = process.env.NEXT_PUBLIC_DOC_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_DOC_DOMAIN}`
  : 'https://doc.fastgpt.io';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const lang of i18n.languages) {
    const pages = source.getPages(lang);

    // 首页
    entries.push({
      url: `${baseUrl}/${lang}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
      alternates: {
        languages: Object.fromEntries(
          i18n.languages.map((l) => [l, `${baseUrl}/${l}`])
        )
      }
    });

    // 所有文档页面
    for (const page of pages) {
      const slug = page.slugs?.join('/') || '';
      const url = `${baseUrl}/${lang}/docs/${slug}`;

      const alternates: Record<string, string> = {};
      for (const altLang of i18n.languages) {
        alternates[altLang] = `${baseUrl}/${altLang}/docs/${slug}`;
      }

      entries.push({
        url,
        lastModified: page.data.lastModified
          ? new Date(page.data.lastModified)
          : new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
        alternates: {
          languages: alternates
        }
      });
    }
  }

  return entries;
}
