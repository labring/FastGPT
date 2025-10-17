import { GetServerSideProps } from 'next';
import { RobotsGenerator } from '@/web/common/seo/robots';

const Robots = () => {
  // This component is never actually rendered because we serve text directly
  return null;
};

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const domain = `${protocol}://${baseUrl.replace(/^https?:\/\//, '')}`;

  // Get default robots configuration for FastGPT
  const robotsConfig = RobotsGenerator.getDefaultConfig(domain);

  // Generate robots.txt content
  const robotsTxt = RobotsGenerator.generateRobots(robotsConfig);

  // Set appropriate headers
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200'); // Cache for 24 hours
  res.write(robotsTxt);
  res.end();

  return {
    props: {}
  };
};

export default Robots;
