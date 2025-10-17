import { SitemapPage } from './types';

export interface SitemapConfig {
  baseUrl: string;
  locales: string[];
  defaultLocale: string;
}

export class SitemapGenerator {
  private config: SitemapConfig;

  constructor(config: SitemapConfig) {
    this.config = config;
  }

  /**
   * Generate sitemap XML string
   */
  generateSitemap(pages: SitemapPage[]): string {
    const currentDate = new Date().toISOString();

    const urlElements = pages.map((page) => this.generateUrlElement(page, currentDate)).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlElements}
</urlset>`;
  }

  /**
   * Generate URL element for a single page
   */
  private generateUrlElement(page: SitemapPage, lastmod: string): string {
    const defaultUrl = `${this.config.baseUrl}${page.path}`;
    const alternateLinks = this.generateAlternateLinks(page.path);

    return `  <url>
    <loc>${defaultUrl}</loc>
    <lastmod>${page.lastmod || lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
${alternateLinks}
  </url>`;
  }

  /**
   * Generate alternate language links for a page
   */
  private generateAlternateLinks(path: string): string {
    return this.config.locales
      .filter((locale) => locale !== this.config.defaultLocale)
      .map((locale) => {
        const localePath = locale === this.config.defaultLocale ? path : `/${locale}${path}`;
        return `    <xhtml:link rel="alternate" hreflang="${locale}" href="${this.config.baseUrl}${localePath}" />`;
      })
      .join('\n');
  }

  /**
   * Get default static pages for FastGPT
   */
  static getDefaultPages(): SitemapPage[] {
    return [
      { path: '', priority: '1.0', changefreq: 'daily' },
      { path: '/app/list', priority: '0.9', changefreq: 'weekly' },
      { path: '/chat', priority: '0.9', changefreq: 'daily' },
      { path: '/dataset/list', priority: '0.8', changefreq: 'weekly' },
      { path: '/login', priority: '0.7', changefreq: 'monthly' },
      { path: '/more', priority: '0.6', changefreq: 'monthly' },
      { path: '/price', priority: '0.6', changefreq: 'monthly' },
      { path: '/toolkit', priority: '0.6', changefreq: 'monthly' }
    ];
  }
}
