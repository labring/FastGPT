export interface SitemapPage {
  path: string;
  priority: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  lastmod?: string;
}

export interface RobotsConfig {
  userAgent: string;
  allow: string[];
  disallow: string[];
  sitemap?: string;
}
