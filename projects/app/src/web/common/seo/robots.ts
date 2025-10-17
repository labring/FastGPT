import { RobotsConfig } from './types';

export class RobotsGenerator {
  /**
   * Generate robots.txt content
   */
  static generateRobots(config: RobotsConfig): string {
    const { userAgent, allow, disallow, sitemap } = config;

    let content = `User-agent: ${userAgent}\n`;

    // Add allowed paths
    if (allow.length > 0) {
      allow.forEach((path) => {
        content += `Allow: ${path}\n`;
      });
    }

    // Add disallowed paths
    if (disallow.length > 0) {
      disallow.forEach((path) => {
        content += `Disallow: ${path}\n`;
      });
    }

    // Add sitemap if provided
    if (sitemap) {
      content += `\nSitemap: ${sitemap}\n`;
    }

    return content;
  }

  /**
   * Get default robots configuration for FastGPT
   */
  static getDefaultConfig(baseUrl: string): RobotsConfig {
    return {
      userAgent: '*',
      allow: ['/'],
      disallow: ['/api/', '/admin/', '/account/', '/_next/', '/favicon.ico'],
      sitemap: `${baseUrl}/sitemap.xml`
    };
  }
}
