import { GetServerSideProps } from 'next';
import { SitemapGenerator } from '@/web/common/seo/sitemap';

const Sitemap = () => {
  // This component is never actually rendered because we serve XML directly
  return null;
};

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const domain = `${protocol}://${baseUrl.replace(/^https?:\/\//, '')}`;

  // Configure sitemap generator with FastGPT's i18n settings
  const locales = ['en', 'zh-CN', 'zh-Hant'];
  const defaultLocale = 'en';

  const sitemapGenerator = new SitemapGenerator({
    baseUrl: domain,
    locales,
    defaultLocale
  });

  // Get default pages for FastGPT
  const pages = SitemapGenerator.getDefaultPages();

  // Generate sitemap XML
  const sitemap = sitemapGenerator.generateSitemap(pages);

  // Set appropriate headers
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200'); // Cache for 24 hours
  res.write(sitemap);
  res.end();

  return {
    props: {}
  };
};

export default Sitemap;
